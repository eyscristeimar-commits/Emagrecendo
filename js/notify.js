// Notificações: permissão, lembretes enquanto o app está aberto/em segundo plano, e push do servidor.
import { CONFIG } from './config.js';
import { cache, hasBackend, savePushSubscription } from './db.js';
import { today, dayTotals, nextWorkout, pad, planOf, workoutLabel } from './calc.js';

export const supported = () => 'Notification' in window;
export const permission = () => (supported() ? Notification.permission : 'unsupported');
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try { return await navigator.serviceWorker.register('./sw.js'); } catch (e) { console.warn('SW', e); return null; }
}

export async function show(title, body, tag, url = './') {
  if (permission() !== 'granted') return;
  const reg = await navigator.serviceWorker?.getRegistration();
  const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/badge-72.png', data: { url } };
  if (reg) reg.showNotification(title, opts); else new Notification(title, opts);
}

function b64ToUint8(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Pede permissão e, se houver servidor, registra o push (funciona com o app fechado).
export async function enable(profileId) {
  if (!supported()) throw new Error(isIOS() && !isStandalone() ? 'No iPhone, primeiro adicione o app à Tela de Início e abra por lá.' : 'Este navegador não suporta notificações.');
  const res = await Notification.requestPermission();
  if (res !== 'granted') throw new Error('Permissão negada. Libere as notificações nas configurações do navegador.');
  let push = false;
  if (hasBackend() && CONFIG.VAPID_PUBLIC_KEY && 'PushManager' in window) {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToUint8(CONFIG.VAPID_PUBLIC_KEY) });
    push = await savePushSubscription(profileId, sub);
  }
  await show('Notificações ativadas ✅', 'Você vai receber os lembretes nos horários escolhidos.', 'welcome');
  return { push };
}

// ---------- Lembretes ----------
export function waterTimes(r) {
  const out = []; const [fh, fm] = r.from.split(':').map(Number); const [th, tm] = r.to.split(':').map(Number);
  for (let m = fh * 60 + fm; m <= th * 60 + tm; m += (Number(r.every) || 2) * 60) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return out;
}

export function reminderText(key, p, date) {
  const t = dayTotals(p, (cache.days[p.id] || {})[date], date);
  switch (key) {
    case 'weigh': return t.weighed ? null : ['⚖️ Pesagem em jejum', 'Bom dia! Hora de subir na balança em jejum, registrar o peso e tirar a foto antes de beber água.'];
    case 'water': return t.waterHit ? null : ['💧 Hora de beber água!', `Você já bebeu ${t.water.toLocaleString('pt-BR')} mL de ${p.waterGoal.toLocaleString('pt-BR')} mL hoje.`];
    case 'meals': return ['🍽️ Registre sua refeição', `Não esqueça de fotografar ou anotar sua refeição para calcular as calorias e bater seus ${p.proteinGoal}g de proteína!`];
    case 'workout': {
      const n = nextWorkout(p, date); const pl = planOf(p);
      const extra = [pl.pullup && 'Barra Fixa', pl.core && 'Core', 'Cardio'].filter(Boolean).join(' + ');
      return t.workoutDone ? null : ['🏋️ Bora treinar!', `Hoje é dia do ${workoutLabel(p, n, pl)} + ${extra}.`];
    }
    case 'night': return ['🌙 Fechamento do dia', 'Confira se registrou suas horas de sono, idas ao banheiro (xixi/cocô) e se bateu a meta de proteína!'];
    case 'photo': return ['📸 Dia de comparação semanal!', 'Tire suas fotos de Frente, Perfil e Costas para atualizar o antes e depois.'];
    default: return null;
  }
}

function dueTimes(key, r) {
  if (!r?.on) return [];
  if (key === 'water') return waterTimes(r);
  if (key === 'photo' && !(r.days || [0, 1]).includes(new Date().getDay())) return [];
  return r.times || [];
}

const firedKey = (pid, key, date, time) => `emag:fired:${pid}:${key}:${date}:${time}`;

// Verifica a cada 30 s (só enquanto o app está aberto). Com push do servidor ativo, o servidor cuida disso.
export function startLocalScheduler(getProfileIds) {
  const tick = () => {
    if (permission() !== 'granted') return;
    const now = new Date(); const date = today(); const mins = now.getHours() * 60 + now.getMinutes();
    for (const pid of getProfileIds()) {
      const p = cache.profiles[pid]; if (!p) continue;
      if (hasBackend() && p.serverPush) continue;
      for (const [key, r] of Object.entries(p.reminders || {})) {
        if (key === 'chat') continue;
        for (const time of dueTimes(key, r)) {
          const [h, m] = time.split(':').map(Number); const tm = h * 60 + m;
          if (mins < tm || mins > tm + 10) continue;
          const fk = firedKey(pid, key, date, time);
          try { if (localStorage.getItem(fk)) continue; localStorage.setItem(fk, '1'); } catch {}
          const txt = reminderText(key, p, date);
          if (txt) show(txt[0], txt[1], `${key}-${time}`);
        }
      }
    }
  };
  tick();
  return setInterval(tick, 30000);
}
