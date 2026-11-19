// Notificações push: lembretes (chamado pelo agendador a cada 5 min) e aviso de mensagem no chat.
// Segredos: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ex: mailto:voce@email.com).
// O 'tick' pode ser chamado sem login: ele só envia lembretes que estão no horário e nunca repete (reminder_log).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';
import { cors, json } from '../_shared/cors.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:app@example.com', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

type Sub = { endpoint: string; profile_id: string; sub: webpush.PushSubscription };

async function send(subs: Sub[], payload: Record<string, unknown>) {
  await Promise.all(subs.map(async (s) => {
    try { await webpush.sendNotification(s.sub, JSON.stringify(payload)); }
    catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from('push_subs').delete().eq('endpoint', s.endpoint);
      else console.error('push', code, e);
    }
  }));
}

const pad = (n: number) => String(n).padStart(2, '0');
function localNow(tz: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, mins: (Number(parts.hour) % 24) * 60 + Number(parts.minute), wd };
}
function waterTimes(r: { from: string; to: string; every: number }) {
  const out: string[] = []; const [fh, fm] = r.from.split(':').map(Number); const [th, tm] = r.to.split(':').map(Number);
  for (let m = fh * 60 + fm; m <= th * 60 + tm; m += (Number(r.every) || 2) * 60) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return out;
}

// Mesmas regras do app (js/notify.js)
function text(key: string, p: any, day: any) {
  const water = day?.water || 0;
  switch (key) {
    case 'weigh': return day?.weight != null ? null : ['⚖️ Pesagem em jejum', 'Bom dia! Hora de subir na balança em jejum, registrar o peso e tirar a foto antes de beber água.'];
    case 'water': return water >= p.waterGoal ? null : ['💧 Hora de beber água!', `Você já bebeu ${water.toLocaleString('pt-BR')} mL de ${Number(p.waterGoal).toLocaleString('pt-BR')} mL hoje.`];
    case 'meals': return ['🍽️ Registre sua refeição', `Não esqueça de fotografar ou anotar sua refeição para calcular as calorias e bater seus ${p.proteinGoal}g de proteína!`];
    case 'workout': return day?.workout?.done ? null : ['🏋️ Bora treinar!', 'Hoje tem treino da fila + Barra Fixa + Core + Cardio. Abra o app para ver qual é o seu.'];
    case 'night': return ['🌙 Fechamento do dia', 'Confira se registrou suas horas de sono, idas ao banheiro (xixi/cocô) e se bateu a meta de proteína!'];
    case 'photo': return ['📸 Dia de comparação semanal!', 'Tire suas fotos de Frente, Perfil e Costas para atualizar o antes e depois.'];
  }
  return null;
}

async function tick() {
  const { data: subs } = await admin.from('push_subs').select('*');
  const byProfile = new Map<string, Sub[]>();
  for (const s of (subs || []) as Sub[]) byProfile.set(s.profile_id, [...(byProfile.get(s.profile_id) || []), s]);
  let sent = 0;
  for (const [pid, list] of byProfile) {
    const { data: prof } = await admin.from('profiles').select('data').eq('id', pid).maybeSingle();
    if (!prof) continue;
    const p = prof.data; const now = localNow(p.tz || 'America/Sao_Paulo');
    const { data: dayRow } = await admin.from('days').select('data').eq('profile_id', pid).eq('date', now.date).maybeSingle();
    for (const [key, r] of Object.entries<any>(p.reminders || {})) {
      if (key === 'chat' || !r?.on) continue;
      if (key === 'photo' && !(r.days || [0, 1]).includes(now.wd)) continue;
      const times: string[] = key === 'water' ? waterTimes(r) : (r.times || []);
      for (const t of times) {
        const [h, m] = t.split(':').map(Number); const tm = h * 60 + m;
        if (now.mins < tm || now.mins >= tm + 5) continue;
        const { error } = await admin.from('reminder_log').insert({ profile_id: pid, key, slot: `${now.date} ${t}` });
        if (error) continue; // já enviado
        const msg = text(key, p, dayRow?.data);
        if (msg) { await send(list, { title: msg[0], body: msg[1], tag: `${key}-${t}`, url: './' }); sent++; }
      }
    }
  }
  // limpeza do histórico antigo
  await admin.from('reminder_log').delete().lt('slot', new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10));
  return sent;
}

async function chat(req: Request, messageId: string) {
  const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: { user: u } } = await user.auth.getUser();
  if (!u) return json({ error: 'Faça login' }, 401);
  const { data: m } = await admin.from('messages').select('*').eq('id', messageId).maybeSingle();
  if (!m) return json({ error: 'Mensagem não encontrada' }, 404);
  const { data: owns } = await admin.from('profile_owners').select('profile_id').eq('uid', u.id).eq('profile_id', m.profile_id);
  if (!owns?.length) return json({ error: 'Sem permissão' }, 403);
  const { data: from } = await admin.from('profiles').select('data').eq('id', m.profile_id).maybeSingle();
  const { data: subs } = await admin.from('push_subs').select('*, profiles(data)').neq('profile_id', m.profile_id);
  const targets = ((subs || []) as any[]).filter((s) => s.profiles?.data?.reminders?.chat?.on !== false);
  const unique = [...new Map(targets.map((s) => [s.endpoint, s])).values()];
  const name = (from?.data?.name || 'Alguém').split(' ')[0];
  await send(unique, { title: `💬 ${name}`, body: m.text || '📷 Foto', tag: 'chat', url: './?tab=grupo' });
  return json({ ok: true, sent: unique.length });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === 'tick') {
      return json({ ok: true, sent: await tick() });
    }
    if (body.action === 'chat') return await chat(req, body.message_id);
    return json({ error: 'Ação inválida' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'Erro nas notificações' }, 500);
  }
});
