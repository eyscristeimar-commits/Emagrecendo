// Integração com o Strava (OAuth oficial). O segredo do app fica no servidor (função "strava").
import { CONFIG } from './config.js';
import { hasBackend, callFunction, cache, saveProfile } from './db.js';

export const stravaReady = () => hasBackend() && !!CONFIG.STRAVA_CLIENT_ID;
const redirectUri = () => location.origin + location.pathname;

export function connect(profileId) {
  const mobile = /android|iphone|ipad/i.test(navigator.userAgent);
  const base = mobile ? 'https://www.strava.com/oauth/mobile/authorize' : 'https://www.strava.com/oauth/authorize';
  const q = new URLSearchParams({
    client_id: CONFIG.STRAVA_CLIENT_ID, redirect_uri: redirectUri(), response_type: 'code',
    approval_prompt: 'auto', scope: 'read,activity:read_all', state: 'strava:' + profileId,
  });
  location.href = `${base}?${q}`;
}

// Chamado ao abrir o app: se voltou do Strava com ?code=..., troca o código pelo acesso.
export async function handleRedirect() {
  const u = new URL(location.href);
  const code = u.searchParams.get('code'); const st = u.searchParams.get('state') || '';
  if (!st.startsWith('strava:')) return null;
  history.replaceState(null, '', redirectUri() + u.hash);
  if (!code) return { error: 'Conexão com o Strava cancelada.' };
  const profileId = st.slice(7);
  try {
    const r = await callFunction('strava', { action: 'exchange', code, profile_id: profileId });
    const p = cache.profiles[profileId];
    if (p) await saveProfile({ ...p, strava: { athlete: r.athlete_name, connectedAt: new Date().toISOString() } });
    return { ok: true, athlete: r.athlete_name };
  } catch (e) { return { error: e.message }; }
}

// Atividades de rua do dia (pedal, caminhada, corrida).
export async function fetchDay(profileId, date) {
  const tz = cache.profiles[profileId]?.tz || 'America/Sao_Paulo';
  const r = await callFunction('strava', { action: 'activities', profile_id: profileId, date, tz });
  return r.activities || [];
}

export async function disconnect(profileId) {
  await callFunction('strava', { action: 'disconnect', profile_id: profileId });
  const p = cache.profiles[profileId];
  if (p) { const { strava, ...rest } = p; await saveProfile(rest); }
}

export const STRAVA_LINK_RE = /(https?:\/\/)?(www\.)?(strava\.com\/activities\/\d+|strava\.app\.link\/[\w-]+)/i;
