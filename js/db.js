// Camada de dados. Dois modos com a mesma interface:
//  - local: localStorage + IndexedDB (só neste aparelho)
//  - supabase: banco em tempo real compartilhado pelo link
// A interface lê de um cache em memória (síncrono) e grava de forma assíncrona.
import { CONFIG } from './config.js';
import { eyshillaPreset } from './presets.js';

export const cache = { profiles: {}, days: {}, photos: [], messages: [], owned: new Set() };
let mode = 'local';
let sb = null;
let uid = null;
const listeners = new Set();
const urlCache = new Map();

export const getMode = () => mode;
export const hasBackend = () => mode === 'supabase';
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (ev) => listeners.forEach((f) => { try { f(ev); } catch (e) { console.error(e); } });

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

// ---------------- Local ----------------
const LS = 'emag:';
const lsGet = (k, d) => { try { const v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { console.warn('localStorage cheio', e); } };
const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('emag') : null;

let idbP = null;
function idb() {
  if (!idbP) {
    idbP = new Promise((res, rej) => {
      const r = indexedDB.open('emag', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('blobs');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return idbP;
}
async function blobPut(key, blob) {
  const d = await idb();
  return new Promise((res, rej) => { const t = d.transaction('blobs', 'readwrite'); t.objectStore('blobs').put(blob, key); t.oncomplete = res; t.onerror = () => rej(t.error); });
}
async function blobGet(key) {
  const d = await idb();
  return new Promise((res) => { const q = d.transaction('blobs').objectStore('blobs').get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(null); });
}
async function blobDel(key) {
  const d = await idb();
  return new Promise((res) => { const t = d.transaction('blobs', 'readwrite'); t.objectStore('blobs').delete(key); t.oncomplete = res; t.onerror = res; });
}

function loadLocal() {
  cache.profiles = lsGet('profiles', {});
  cache.days = {};
  for (const id of Object.keys(cache.profiles)) cache.days[id] = lsGet('days:' + id, {});
  cache.photos = lsGet('photos', []);
  cache.messages = lsGet('messages', []);
  cache.owned = new Set(lsGet('owned', []));
}

// ---------------- Init ----------------
export async function init() {
  if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
    try {
      await initSupabase();
      mode = 'supabase';
      return mode;
    } catch (e) {
      console.error('Falha ao conectar no Supabase, usando modo local', e);
    }
  }
  loadLocal();
  if (!Object.keys(cache.profiles).length) {
    const p = eyshillaPreset();
    cache.profiles[p.id] = p;
    cache.days[p.id] = {};
    lsSet('profiles', cache.profiles);
  }
  if (bc) bc.onmessage = (e) => { loadLocal(); emit(e.data); };
  return mode;
}

let loggedIn = false;
let currentEmail = '';
export const needsLogin = () => mode === 'supabase' && !loggedIn;
export const userEmail = () => currentEmail;

async function initSupabase() {
  const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
  sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  recovering = /type=recovery/.test(location.hash);
  sb.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') { recovering = true; emit({ table: 'auth' }); } });
  const { data: { session } } = await sb.auth.getSession();
  if (session) await afterLogin(session);
}

// Login por e-mail e senha (funciona igual no navegador e no app instalado).
export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  await afterLogin(data.session);
}
export async function signUp(email, password) {
  const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
  if (error) throw error;
  if (!data.session) return false; // precisa confirmar pelo e-mail
  await afterLogin(data.session);
  return true;
}
export async function resetPassword(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  if (error) throw error;
}
export async function setNewPassword(password) {
  const { data, error } = await sb.auth.updateUser({ password });
  if (error) throw error;
  return data;
}
export const recoveryMode = () => recovering;
let recovering = false;
export async function logout() {
  if (sb) await sb.auth.signOut();
  try { localStorage.removeItem('emag:me'); } catch {}
  location.reload();
}

async function afterLogin(session) {
  uid = session.user.id;
  currentEmail = session.user.email || '';
  loggedIn = true;
  await loadRemote();
}

async function loadRemote() {
  const since = new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  const [pr, ow, dy, ph, ms] = await Promise.all([
    sb.from('profiles').select('*'),
    sb.from('profile_owners').select('profile_id').eq('uid', uid),
    sb.from('days').select('*').gte('date', since),
    sb.from('photos').select('*').order('created_at', { ascending: true }),
    sb.from('messages').select('*').order('created_at', { ascending: false }).limit(200),
  ]);
  for (const r of [pr, ow, dy, ph, ms]) if (r.error) throw r.error;
  cache.profiles = {};
  for (const row of pr.data) cache.profiles[row.id] = { ...row.data, id: row.id };
  cache.owned = new Set(ow.data.map((r) => r.profile_id));
  cache.days = {};
  for (const id of Object.keys(cache.profiles)) cache.days[id] = {};
  for (const row of dy.data) (cache.days[row.profile_id] ||= {})[row.date] = row.data;
  cache.photos = ph.data.map(rowToPhoto);
  cache.messages = ms.data.reverse().map(rowToMsg);

  sb.channel('tudo')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, ({ eventType, new: n, old }) => {
      if (eventType === 'DELETE') delete cache.profiles[old.id];
      else { cache.profiles[n.id] = { ...n.data, id: n.id }; cache.days[n.id] ||= {}; }
      emit({ table: 'profiles' });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'days' }, ({ eventType, new: n }) => {
      if (eventType !== 'DELETE') (cache.days[n.profile_id] ||= {})[n.date] = n.data;
      emit({ table: 'days', profileId: n?.profile_id });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, ({ eventType, new: n, old }) => {
      if (eventType === 'DELETE') cache.photos = cache.photos.filter((p) => p.id !== old.id);
      else { cache.photos = cache.photos.filter((p) => p.id !== n.id); cache.photos.push(rowToPhoto(n)); }
      emit({ table: 'photos' });
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, ({ new: n }) => {
      if (!cache.messages.some((m) => m.id === n.id)) cache.messages.push(rowToMsg(n));
      emit({ table: 'messages', message: rowToMsg(n) });
    })
    .subscribe();
}

const rowToPhoto = (r) => ({ id: r.id, profileId: r.profile_id, date: r.date, kind: r.kind, visibility: r.visibility, path: r.path, weight: r.weight, createdAt: r.created_at });
const rowToMsg = (r) => ({ id: r.id, profileId: r.profile_id, text: r.text, photoPath: r.photo_path, createdAt: r.created_at });

// ---------------- Perfis ----------------
export const listProfiles = () => Object.values(cache.profiles).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
export const isOwner = (pid) => cache.owned.has(pid);

export async function createProfile(data) {
  const p = { ...data, createdAt: new Date().toISOString() };
  if (mode === 'supabase') {
    const { data: id, error } = await sb.rpc('create_profile', { p_data: p });
    if (error) throw error;
    p.id = id;
    cache.profiles[id] = p;
    cache.days[id] ||= {};
    cache.owned.add(id);
  } else {
    p.id = uuid();
    cache.profiles[p.id] = p;
    cache.days[p.id] = {};
    cache.owned.add(p.id);
    lsSet('profiles', cache.profiles);
    lsSet('owned', [...cache.owned]);
    bc?.postMessage({ table: 'profiles' });
  }
  emit({ table: 'profiles' });
  return p;
}

// Assumir um perfil pré-cadastrado. No servidor, só funciona se o perfil ainda não tem dono
// (ex.: a Eyshilla entrando pela primeira vez com o e-mail dela).
export async function claimProfile(id) {
  if (mode === 'supabase') {
    const { data: ok, error } = await sb.rpc('claim_profile', { p_id: id });
    if (error) throw error;
    if (!ok) return false;
  }
  cache.owned.add(id);
  if (mode === 'local') lsSet('owned', [...cache.owned]);
  emit({ table: 'profiles' });
  return true;
}

export async function saveProfile(p) {
  cache.profiles[p.id] = p;
  emit({ table: 'profiles' });
  if (mode === 'supabase') {
    const { id, ...data } = p;
    const { error } = await sb.from('profiles').update({ data, updated_at: new Date().toISOString() }).eq('id', p.id);
    if (error) throw error;
  } else {
    lsSet('profiles', cache.profiles);
    bc?.postMessage({ table: 'profiles' });
  }
}

export async function deleteProfile(id) {
  if (mode === 'supabase') {
    const { error } = await sb.from('profiles').delete().eq('id', id);
    if (error) throw error;
  } else {
    try { localStorage.removeItem(LS + 'days:' + id); } catch {}
    for (const ph of cache.photos.filter((x) => x.profileId === id)) await blobDel(ph.path);
    cache.photos = cache.photos.filter((x) => x.profileId !== id);
    lsSet('photos', cache.photos);
  }
  delete cache.profiles[id];
  delete cache.days[id];
  cache.owned.delete(id);
  if (mode === 'local') { lsSet('profiles', cache.profiles); lsSet('owned', [...cache.owned]); }
  emit({ table: 'profiles' });
}

// ---------------- Dias ----------------
export const getDay = (pid, date) => (cache.days[pid] || {})[date] || null;

const pendingDays = new Map();
export function saveDay(pid, date, data) {
  (cache.days[pid] ||= {})[date] = data;
  emit({ table: 'days', profileId: pid, local: true });
  // agrupa gravações rápidas (ex.: vários toques no +250 mL)
  const key = pid + '|' + date;
  clearTimeout(pendingDays.get(key));
  pendingDays.set(key, setTimeout(() => flushDay(pid, date), 500));
}
async function flushDay(pid, date) {
  pendingDays.delete(pid + '|' + date);
  const data = cache.days[pid][date];
  if (mode === 'supabase') {
    const { error } = await sb.from('days').upsert({ profile_id: pid, date, data, updated_at: new Date().toISOString() });
    if (error) { console.error(error); emit({ table: 'error', error }); }
  } else {
    lsSet('days:' + pid, cache.days[pid]);
    bc?.postMessage({ table: 'days', profileId: pid });
  }
}

// ---------------- Fotos ----------------
export async function addPhoto({ profileId, date, kind, visibility, weight }, blob) {
  const id = uuid();
  const path = `${profileId}/${id}.jpg`;
  const ph = { id, profileId, date, kind, visibility, path, weight: weight ?? null, createdAt: new Date().toISOString() };
  if (mode === 'supabase') {
    const up = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
    if (up.error) throw up.error;
    const { error } = await sb.from('photos').insert({ id, profile_id: profileId, date, kind, visibility, path, weight: ph.weight });
    if (error) throw error;
  } else {
    await blobPut(path, blob);
  }
  cache.photos.push(ph);
  if (mode === 'local') { lsSet('photos', cache.photos); bc?.postMessage({ table: 'photos' }); }
  emit({ table: 'photos' });
  return ph;
}

export async function updatePhoto(ph) {
  const i = cache.photos.findIndex((x) => x.id === ph.id);
  if (i >= 0) cache.photos[i] = ph;
  if (mode === 'supabase') {
    const { error } = await sb.from('photos').update({ visibility: ph.visibility, weight: ph.weight }).eq('id', ph.id);
    if (error) throw error;
  } else { lsSet('photos', cache.photos); bc?.postMessage({ table: 'photos' }); }
  emit({ table: 'photos' });
}

export async function deletePhoto(ph) {
  if (mode === 'supabase') {
    await sb.storage.from('photos').remove([ph.path]);
    const { error } = await sb.from('photos').delete().eq('id', ph.id);
    if (error) throw error;
  } else { await blobDel(ph.path); }
  cache.photos = cache.photos.filter((x) => x.id !== ph.id);
  if (mode === 'local') { lsSet('photos', cache.photos); bc?.postMessage({ table: 'photos' }); }
  emit({ table: 'photos' });
}

export async function photoUrl(path) {
  if (!path) return '';
  if (urlCache.has(path)) return urlCache.get(path);
  let url = '';
  if (mode === 'supabase') {
    const { data, error } = await sb.storage.from('photos').createSignedUrl(path, 60 * 60 * 6);
    if (!error) url = data.signedUrl;
  } else {
    const b = await blobGet(path);
    if (b) url = URL.createObjectURL(b);
  }
  if (url) urlCache.set(path, url);
  return url;
}

// Fotos que este aparelho pode ver: as do grupo + as privadas dos perfis que ele controla.
export const visiblePhotos = () => cache.photos.filter((p) => p.visibility === 'group' || cache.owned.has(p.profileId));

// ---------------- Chat ----------------
export async function sendMessage(profileId, text, blob) {
  const id = uuid();
  let photoPath = null;
  if (blob) {
    photoPath = `${profileId}/chat-${id}.jpg`;
    if (mode === 'supabase') {
      const up = await sb.storage.from('photos').upload(photoPath, blob, { contentType: 'image/jpeg' });
      if (up.error) throw up.error;
    } else await blobPut(photoPath, blob);
  }
  const msg = { id, profileId, text, photoPath, createdAt: new Date().toISOString() };
  if (mode === 'supabase') {
    const { error } = await sb.from('messages').insert({ id, profile_id: profileId, text, photo_path: photoPath });
    if (error) throw error;
    callFunction('push', { action: 'chat', message_id: id }).catch(() => {});
  }
  if (!cache.messages.some((m) => m.id === id)) cache.messages.push(msg);
  if (mode === 'local') {
    cache.messages = cache.messages.slice(-300);
    lsSet('messages', cache.messages);
    bc?.postMessage({ table: 'messages', message: msg });
  }
  emit({ table: 'messages', message: msg, mine: true });
  return msg;
}

// ---------------- Funções do servidor ----------------
export async function callFunction(name, body) {
  if (mode !== 'supabase') throw new Error('Servidor não configurado');
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function savePushSubscription(profileId, sub) {
  if (mode !== 'supabase') return false;
  const json = sub.toJSON();
  const { error } = await sb.from('push_subs').upsert({ endpoint: json.endpoint, profile_id: profileId, sub: json });
  if (error) throw error;
  return true;
}

// Exporta tudo (backup) — útil no modo local.
export function exportAll() {
  return JSON.stringify({ profiles: cache.profiles, days: cache.days, messages: cache.messages, photos: cache.photos.map(({ ...p }) => p) }, null, 1);
}
export async function importAll(json) {
  const d = JSON.parse(json);
  if (mode !== 'local') throw new Error('Importação só no modo local');
  lsSet('profiles', d.profiles || {});
  for (const [id, days] of Object.entries(d.days || {})) lsSet('days:' + id, days);
  lsSet('messages', d.messages || []);
  loadLocal();
  emit({ table: 'profiles' });
}
