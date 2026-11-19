// Integração com o Strava. Segredos: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { cors, json } from '../_shared/cors.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const CID = Deno.env.get('STRAVA_CLIENT_ID');
const SECRET = Deno.env.get('STRAVA_CLIENT_SECRET');
const TYPES: Record<string, string> = {
  Ride: 'Bike aro 29 (rua)', MountainBikeRide: 'Bike aro 29 (rua)', GravelRide: 'Bike aro 29 (rua)', EBikeRide: 'Bike (elétrica)',
  Walk: 'Caminhada externa', Hike: 'Caminhada externa', Run: 'Corrida', TrailRun: 'Corrida',
};

async function token(profileId: string) {
  const { data: t } = await admin.from('strava_tokens').select('*').eq('profile_id', profileId).maybeSingle();
  if (!t) throw new Error('Strava não conectado.');
  if (t.expires_at > Date.now() / 1000 + 60) return t.access_token;
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: CID, client_secret: SECRET, grant_type: 'refresh_token', refresh_token: t.refresh_token }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Falha ao renovar o acesso ao Strava. Conecte de novo.');
  await admin.from('strava_tokens').update({ access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at }).eq('profile_id', profileId);
  return j.access_token;
}

// Converte "2026-11-23" no fuso do usuário para o intervalo em segundos (epoch).
function dayRange(date: string, tz: string) {
  const guess = new Date(`${date}T12:00:00Z`);
  const local = new Date(guess.toLocaleString('en-US', { timeZone: tz }));
  const offsetMs = local.getTime() - guess.getTime();
  const start = new Date(`${date}T00:00:00Z`).getTime() - offsetMs;
  return { after: Math.floor(start / 1000) - 1, before: Math.floor(start / 1000) + 86400 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (!CID || !SECRET) return json({ error: 'Strava ainda não configurado no servidor.' }, 400);
    const auth = req.headers.get('Authorization') ?? '';
    const user = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { action, profile_id, code, date, tz = 'America/Sao_Paulo' } = await req.json();
    const { data: owner } = await user.rpc('is_owner', { pid: profile_id });
    if (!owner) return json({ error: 'Sem permissão para este perfil.' }, 403);

    if (action === 'exchange') {
      const r = await fetch('https://www.strava.com/oauth/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: CID, client_secret: SECRET, code, grant_type: 'authorization_code' }),
      });
      const j = await r.json();
      if (!r.ok) return json({ error: 'O Strava recusou a conexão. Tente de novo.' }, 400);
      const name = [j.athlete?.firstname, j.athlete?.lastname].filter(Boolean).join(' ');
      await admin.from('strava_tokens').upsert({ profile_id, athlete_id: j.athlete?.id, athlete_name: name, access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at });
      return json({ ok: true, athlete_name: name });
    }
    if (action === 'activities') {
      const tk = await token(profile_id);
      const { after, before } = dayRange(date, tz);
      const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&before=${before}&per_page=30`, { headers: { Authorization: `Bearer ${tk}` } });
      if (!r.ok) return json({ error: 'Não foi possível ler as atividades do Strava.' }, 502);
      const list = await r.json();
      const out = [];
      for (const a of list) {
        let kcal = null;
        try {
          const d = await fetch(`https://www.strava.com/api/v3/activities/${a.id}`, { headers: { Authorization: `Bearer ${tk}` } });
          if (d.ok) kcal = (await d.json()).calories ?? null;
        } catch { /* sem calorias */ }
        if (!kcal && a.kilojoules) kcal = Math.round(a.kilojoules); // bike: kJ ≈ kcal gastas
        out.push({
          id: a.id, name: a.name, type: a.sport_type || a.type, typeLabel: TYPES[a.sport_type || a.type] || a.sport_type || a.type,
          minutes: Math.round(a.moving_time / 60), km: Math.round(a.distance / 10) / 100,
          speed: Math.round(a.average_speed * 3.6 * 10) / 10, kcal: kcal ? Math.round(kcal) : null,
        });
      }
      return json({ activities: out });
    }
    if (action === 'disconnect') {
      try { const tk = await token(profile_id); await fetch('https://www.strava.com/oauth/deauthorize', { method: 'POST', headers: { Authorization: `Bearer ${tk}` } }); } catch { /* já desconectado */ }
      await admin.from('strava_tokens').delete().eq('profile_id', profile_id);
      return json({ ok: true });
    }
    return json({ error: 'Ação inválida' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message || 'Erro no Strava' }, 500);
  }
});
