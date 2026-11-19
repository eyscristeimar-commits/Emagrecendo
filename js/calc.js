// Datas, totais do dia, placar da semana e previsão da meta.
import { cache } from './db.js';
import { BUILTIN_PLANS, PLAN_EYSHILLA, ACTIVITY } from './presets.js';

export const pad = (n) => String(n).padStart(2, '0');
export const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => iso(new Date());
export const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
export const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const fmtDate = (s, opts = {}) => {
  if (!s) return '';
  const d = parseISO(s);
  const base = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  if (opts.long) return `${WD[d.getDay()]}, ${d.getDate()} de ${MO[d.getMonth()]}${opts.year ? ' de ' + d.getFullYear() : ''}`;
  if (opts.year) return `${base}/${d.getFullYear()}`;
  if (opts.wd) return `${WD[d.getDay()]} ${base}`;
  return base;
};
export const fmtNum = (n, dec = 1) => (n == null || isNaN(n) ? '–' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec }));
export const fmtInt = (n) => (n == null || isNaN(n) ? '–' : Math.round(n).toLocaleString('pt-BR'));
export const fmtKg = (n) => (n == null ? '–' : fmtNum(n, 1) + ' kg');
export const fmtTime = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export const emptyDay = () => ({
  weight: null, weightAt: null, water: 0, waterLog: [], meals: [],
  sleep: null, sleepQ: null, pee: 0, poop: 0, poopLog: [],
  workout: null, cardio: [],
});

// ---------- Semana do plano ----------
export function weekIndex(p, date) {
  return Math.floor(diffDays(p.startDate, date) / 7) + 1;
}
export function weekRange(p, n) {
  const start = addDays(p.startDate, (n - 1) * 7);
  return { start, end: addDays(start, 6), n };
}
export function cardioGoalFor(p, date) {
  const w = Math.max(1, weekIndex(p, date));
  const list = [...(p.cardioGoal || [])].sort((a, b) => a.fromWeek - b.fromWeek);
  let g = list[0] || { min: 45, max: 60 };
  for (const x of list) if (w >= x.fromWeek) g = x;
  return g;
}

// ---------- Totais do dia ----------
export function dayTotals(p, day, date) {
  const d = day || emptyDay();
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, sugar: 0 };
  let addedSugar = false;
  for (const m of d.meals || []) {
    for (const k of Object.keys(t)) t[k] += Number(m.totals?.[k]) || 0;
    if ((m.items || []).some((i) => i.addedSugar)) addedSugar = true;
  }
  const cardioMin = (d.cardio || []).reduce((s, c) => s + (Number(c.minutes) || 0), 0);
  const cardioKm = (d.cardio || []).reduce((s, c) => s + (Number(c.km) || 0), 0);
  const cardioKcal = (d.cardio || []).reduce((s, c) => s + (Number(c.kcal) || 0), 0);
  const cg = cardioGoalFor(p, date);
  const hasMeals = (d.meals || []).length > 0;
  return {
    ...t, addedSugar, hasMeals,
    kcalStatus: !hasMeals ? 'none' : t.kcal <= p.kcalGoal ? 'green' : t.kcal <= p.kcalTol ? 'yellow' : 'red',
    proteinHit: t.protein >= p.proteinGoal,
    water: d.water || 0,
    waterHit: (d.water || 0) >= p.waterGoal,
    weighed: d.weight != null,
    workoutDone: !!d.workout?.done,
    cardioMin, cardioKm, cardioKcal, cardioGoal: cg,
    cardioHit: cardioMin >= cg.min,
    sleep: d.sleep, pee: d.pee || 0, poop: d.poop || 0,
  };
}

export const kcalColor = (p, kcal) => (kcal <= p.kcalGoal ? 'var(--green)' : kcal <= p.kcalTol ? 'var(--yellow)' : 'var(--red)');

// ---------- Pesos ----------
export function weights(pid) {
  const days = cache.days[pid] || {};
  return Object.keys(days).filter((d) => days[d]?.weight != null).sort().map((d) => ({ date: d, w: Number(days[d].weight) }));
}
export function latestWeight(p) {
  const ws = weights(p.id);
  return ws.length ? ws[ws.length - 1] : (p.startWeight ? { date: p.startDate, w: Number(p.startWeight) } : null);
}
export function weightOn(pid, date) {
  const d = (cache.days[pid] || {})[date];
  return d?.weight != null ? Number(d.weight) : null;
}

// Peso de referência (meio da faixa) numa data, interpolando a curva do plano.
export function refAt(p, date) {
  const c = (p.refCurve || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!c.length) return null;
  if (date <= c[0].date) return { min: c[0].min, max: c[0].max };
  for (let i = 1; i < c.length; i++) {
    if (date <= c[i].date) {
      const f = diffDays(c[i - 1].date, date) / diffDays(c[i - 1].date, c[i].date);
      return { min: c[i - 1].min + (c[i].min - c[i - 1].min) * f, max: c[i - 1].max + (c[i].max - c[i - 1].max) * f };
    }
  }
  return null;
}

// Ritmo planejado (kg/dia) numa data: segue a curva de referência e depois o ritmo semanal.
function planRatePerDay(p, date) {
  const c = (p.refCurve || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 1; i < c.length; i++) {
    if (date >= c[i - 1].date && date < c[i].date) {
      const a = (c[i - 1].min + c[i - 1].max) / 2; const b = (c[i].min + c[i].max) / 2;
      const r = (a - b) / diffDays(c[i - 1].date, c[i].date);
      if (r > 0) return r;
    }
  }
  return (Number(p.weeklyRate) || 0.7) / 7;
}

// Previsão: a partir do último peso registrado, quando chega na meta no ritmo do plano.
export function forecast(p) {
  const goal = Number(p.goalWeight);
  const last = latestWeight(p);
  if (!goal || !last) return null;
  const remaining = last.w - goal;
  const out = { goal, current: last.w, currentDate: last.date, remaining: Math.max(0, remaining), lost: p.startWeight ? p.startWeight - last.w : 0 };
  if (remaining <= 0) return { ...out, reached: true, date: last.date };
  let w = last.w; let d = last.date < p.startDate ? p.startDate : last.date; let n = 0;
  while (w > goal && n < 2000) { w -= planRatePerDay(p, d); d = addDays(d, 1); n++; }
  out.date = d;
  out.weeksLeft = Math.ceil(n / 7);
  // Ritmo real (se tiver pelo menos 7 dias de dados)
  const ws = weights(p.id);
  const first = p.startWeight ? { date: p.startDate, w: Number(p.startWeight) } : ws[0];
  if (first && diffDays(first.date, last.date) >= 7 && first.w > last.w) {
    const rate = (first.w - last.w) / diffDays(first.date, last.date);
    out.realRateWeek = rate * 7;
    out.realDate = addDays(last.date, Math.ceil(remaining / rate));
  }
  return out;
}

// ---------- Placar da semana ----------
export function weekStats(p, n) {
  const { start, end } = weekRange(p, n);
  const days = cache.days[p.id] || {};
  const s = { n, start, end, days: 0, workouts: 0, cardioDays: 0, cardioMin: 0, cardioKm: 0, green: 0, yellow: 0, red: 0, protein: 0, water: 0,
    kcalSum: 0, kcalDays: 0, protSum: 0, waterSum: 0, sleepSum: 0, sleepDays: 0, wStart: null, wEnd: null };
  const t = today();
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    if (date > t) break;
    s.days++;
    const tt = dayTotals(p, days[date], date);
    if (tt.workoutDone) s.workouts++;
    if (tt.cardioHit) s.cardioDays++;
    s.cardioMin += tt.cardioMin; s.cardioKm += tt.cardioKm;
    if (tt.kcalStatus !== 'none') { s[tt.kcalStatus]++; s.kcalSum += tt.kcal; s.kcalDays++; s.protSum += tt.protein; }
    if (tt.proteinHit) s.protein++;
    if (tt.waterHit) s.water++;
    s.waterSum += tt.water;
    if (tt.sleep) { s.sleepSum += tt.sleep; s.sleepDays++; }
  }
  // Variação: último peso da semana anterior (ou inicial) vs último peso desta semana
  const ws = weights(p.id);
  const before = ws.filter((x) => x.date < start).pop();
  const inWeek = ws.filter((x) => x.date >= start && x.date <= end);
  s.wStart = before ? before.w : (n === 1 && p.startWeight ? Number(p.startWeight) : inWeek[0]?.w ?? null);
  s.wEnd = inWeek.length ? inWeek[inWeek.length - 1].w : null;
  s.delta = s.wStart != null && s.wEnd != null ? s.wEnd - s.wStart : null;
  s.avgKcal = s.kcalDays ? s.kcalSum / s.kcalDays : null;
  s.avgProt = s.kcalDays ? s.protSum / s.kcalDays : null;
  s.avgWater = s.days ? s.waterSum / s.days : null;
  s.avgSleep = s.sleepDays ? s.sleepSum / s.sleepDays : null;
  return s;
}

// Próximo treino da rotação 1→6 (continua de onde parou, independente do dia da semana).
export function nextWorkout(p, beforeDate) {
  const days = cache.days[p.id] || {};
  const plan = planOf(p);
  const done = Object.keys(days).filter((d) => d < beforeDate && days[d]?.workout?.done && days[d].workout.num && (days[d].workout.planId || PLAN_EYSHILLA.id) === plan.id).sort();
  if (!done.length) return 1;
  const last = days[done[done.length - 1]].workout.num;
  return (last % plan.days.length) + 1;
}

// ---------- Fichas de treino ----------
// Biblioteca: fichas padrão + fichas publicadas no grupo + as fichas da própria pessoa.
export function allPlans(forProfile) {
  const out = [...BUILTIN_PLANS];
  for (const pr of Object.values(cache.profiles)) {
    for (const pl of pr.plans || []) {
      if (pl.published || pr.id === forProfile?.id) out.push({ ...pl, ownerId: pr.id, author: pl.author || pr.name });
    }
  }
  return out;
}
export function planOf(p) {
  return allPlans(p).find((x) => x.id === p.planId) || PLAN_EYSHILLA;
}
export function workoutLabel(p, num, plan = planOf(p)) {
  const d = plan.days[(num - 1) % plan.days.length];
  return d ? `Treino ${num} – ${d.name}` : `Treino ${num}`;
}

// ---------- Energia: IMC, gasto calórico e déficit ----------
export function bmi(p, w) {
  const h = Number(p.height) / 100;
  if (!h || !w) return null;
  const v = w / (h * h);
  const cls = v < 18.5 ? 'abaixo do peso' : v < 25 ? 'peso normal' : v < 30 ? 'sobrepeso' : v < 35 ? 'obesidade grau I' : v < 40 ? 'obesidade grau II' : 'obesidade grau III';
  return { v, cls };
}
// Taxa metabólica basal (Mifflin-St Jeor) e gasto total do dia.
export function energy(p, w) {
  if (!w || !p.height || !p.age || !p.sex) return null;
  const bmr = 10 * w + 6.25 * Number(p.height) - 5 * Number(p.age) + (p.sex === 'M' ? 5 : -161);
  const f = ACTIVITY[p.activity || 'moderado']?.f || 1.55;
  const tdee = bmr * f;
  const floor = p.sex === 'M' ? 1500 : 1200;
  const suggested = Math.max(floor, Math.round((tdee * 0.75) / 50) * 50); // déficit de ~25%
  const deficit = tdee - Number(p.kcalGoal || suggested);
  return {
    bmr, tdee, suggested, deficit,
    kgPerWeek: (deficit * 7) / 7700,
    proteinSuggested: Math.round((Number(p.goalWeight) || w) * 2 / 5) * 5, // ~2 g por kg do peso meta
    waterSuggested: Math.round((w * 40) / 250) * 250, // ~40 mL por kg
  };
}
// Core alterna: com carga / sem carga.
export function nextCoreLoaded(p, beforeDate) {
  const days = cache.days[p.id] || {};
  const done = Object.keys(days).filter((d) => d < beforeDate && days[d]?.workout?.core).sort();
  if (!done.length) return true;
  return !days[done[done.length - 1]].workout.coreLoaded;
}

// Horas desde o último cocô registrado
export function hoursSincePoop(pid) {
  const days = cache.days[pid] || {};
  let last = null;
  for (const d of Object.keys(days).sort().reverse()) {
    const log = days[d]?.poopLog || [];
    if (log.length) { last = log[log.length - 1]; break; }
    if (days[d]?.poop > 0) { last = parseISO(d).toISOString(); break; }
  }
  if (!last) return null;
  return (Date.now() - new Date(last).getTime()) / 36e5;
}
