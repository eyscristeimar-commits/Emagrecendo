import { cache } from './db.js';
import { dayTotals, weekStats, weekIndex, weekRange, addDays, today, fmtDate, fmtNum, fmtInt, refAt, weightOn, forecast, diffDays, kcalColor } from './calc.js';
import { state, esc, refresh } from './ui.js';
import { barChart, lineChart, legend } from './charts.js';
import { profilePicker } from './tab-gallery.js';

const C = { accent: 'var(--accent)', green: 'var(--green)', yellow: 'var(--yellow)', red: 'var(--red)', orange: 'var(--orange)', blue: 'var(--blue)', violet: 'var(--violet)', muted: 'var(--muted)' };

export function renderReports(el) {
  const pid = state.viewProfile || state.me;
  const p = cache.profiles[pid];
  const curWeek = Math.max(1, weekIndex(p, today()));
  const n = state.reportWeek && state.reportWeek <= curWeek ? state.reportWeek : curWeek;
  const s = weekStats(p, n);

  el.innerHTML = `
  ${profilePicker(pid)}
  <section class="card score">
    <div class="row between">
      <button class="icon-btn" data-wk="${n - 1}" ${n <= 1 ? 'disabled' : ''} aria-label="Semana anterior">‹</button>
      <div class="center"><h3>🏆 Placar da Semana ${n}</h3><div class="muted sm">${fmtDate(s.start)} a ${fmtDate(s.end)} · ${esc(p.name.split(' ')[0])}</div></div>
      <button class="icon-btn" data-wk="${n + 1}" ${n >= curWeek ? 'disabled' : ''} aria-label="Próxima semana">›</button>
    </div>
    <div class="score-grid">
      ${tile('🏋️', 'Treinos', `${s.workouts} / ${Math.max(6, s.workouts)}`, 'concluídos')}
      ${tile('🏃', 'Cardio', `${s.cardioDays} / ${s.days || 7}`, `dias · ${fmtInt(s.cardioMin)} min${s.cardioKm ? ` · ${fmtNum(s.cardioKm)} km` : ''}`)}
      ${tile('🔥', 'Calorias', `<span class="c-green">${s.green}</span> · <span class="c-yellow">${s.yellow}</span> · <span class="c-red">${s.red}</span>`, `verde ≤${fmtInt(p.kcalGoal)} · amarelo ≤${fmtInt(p.kcalTol)} · vermelho`)}
      ${tile('🥩', 'Proteína', `${s.protein} / ${s.days || 7}`, `dias com ${p.proteinGoal}g+`)}
      ${tile('💧', 'Água', `${s.water} / ${s.days || 7}`, `dias com ${fmtNum(p.waterGoal / 1000, 0)} L`)}
      ${tile('⚖️', 'Peso na semana', s.delta == null ? '–' : `${s.delta > 0 ? '+' : ''}${fmtNum(s.delta)} kg`, s.wEnd != null ? `fechou em ${fmtNum(s.wEnd)} kg` : 'sem pesagem', s.delta != null && s.delta < 0 ? 'good' : '')}
    </div>
  </section>

  <div class="seg block-seg">
    <button data-rv="diario" class="${state.reportView === 'diario' ? 'on' : ''}">📅 Gráfico diário</button>
    <button data-rv="semanal" class="${state.reportView === 'semanal' ? 'on' : ''}">📊 Gráfico semanal</button>
  </div>
  <div id="charts">${state.reportView === 'diario' ? daily(p) : weekly(p, curWeek)}</div>`;

  el.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => { state.viewProfile = b.dataset.pick; state.reportWeek = null; refresh(); });
  el.querySelectorAll('[data-wk]').forEach((b) => b.onclick = () => { state.reportWeek = Number(b.dataset.wk); refresh(); });
  el.querySelectorAll('[data-rv]').forEach((b) => b.onclick = () => { state.reportView = b.dataset.rv; refresh(); });
  el.querySelectorAll('[data-range]').forEach((b) => b.onclick = () => { state.reportRange = Number(b.dataset.range); refresh(); });
}

const tile = (ic, label, val, sub, cls = '') => `<div class="tile ${cls}"><div class="t-l">${ic} ${label}</div><div class="t-v">${val}</div><div class="t-s">${sub}</div></div>`;

function daily(p) {
  const N = state.reportRange;
  const end = today();
  const start0 = addDays(end, -(N - 1));
  const start = start0 < addDays(p.startDate, -3) && diffDays(addDays(p.startDate, -3), end) >= 6 ? addDays(p.startDate, -3) : start0;
  const dates = []; for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  const labels = dates.map((d) => fmtDate(d));
  const days = cache.days[p.id] || {};
  const T = dates.map((d) => dayTotals(p, days[d], d));
  const weightsV = dates.map((d) => weightOn(p.id, d));
  const band = dates.map((d) => (d >= p.startDate ? refAt(p, d) : null));
  const bars = (f, color) => dates.map((d, i) => ({ label: labels[i], value: f(T[i], d), color: typeof color === 'function' ? color(T[i]) : color }));

  return `
  <div class="seg sm mb">${[7, 14, 30].map((r) => `<button data-range="${r}" class="${N === r ? 'on' : ''}">${r} dias</button>`).join('')}</div>
  ${chartCard('⚖️ Peso (kg)', lineChart({ labels, series: [{ values: weightsV, color: C.accent, connect: true }], band: band.some(Boolean) ? band : null, lines: p.goalWeight ? [{ y: Number(p.goalWeight), color: C.green, label: 'meta' }] : [] }),
    legend([{ color: C.accent, label: 'Peso real' }, ...(band.some(Boolean) ? [{ color: 'var(--band-solid)', label: 'Faixa de referência' }] : [])]))}
  ${chartCard('🔥 Calorias por dia', barChart({ bars: bars((t) => t.kcal, (t) => kcalColor(p, t.kcal)), lines: [{ y: p.kcalGoal, color: C.green, label: fmtInt(p.kcalGoal) }, { y: p.kcalTol, color: C.yellow, label: fmtInt(p.kcalTol) }], unit: ' kcal' }),
    legend([{ color: C.green, label: `até ${fmtInt(p.kcalGoal)}` }, { color: C.yellow, label: `até ${fmtInt(p.kcalTol)}` }, { color: C.red, label: 'acima' }]))}
  ${chartCard('🥩 Proteína por dia (g)', barChart({ bars: bars((t) => t.protein, (t) => (t.proteinHit ? C.green : C.orange)), lines: [{ y: p.proteinGoal, color: C.green, label: `${p.proteinGoal} g` }], unit: ' g' }),
    legend([{ color: C.green, label: 'bateu a meta' }, { color: C.orange, label: 'não bateu' }]))}
  ${chartCard('💧 Água (L)', barChart({ bars: bars((t) => t.water / 1000, (t) => (t.waterHit ? C.blue : 'var(--blue-soft)')), lines: [{ y: p.waterGoal / 1000, color: C.blue, label: `${fmtNum(p.waterGoal / 1000, 0)} L` }], unit: ' L' }))}
  ${chartCard('🏃 Cardio (min)', barChart({ bars: bars((t) => t.cardioMin, (t) => (t.cardioHit ? C.accent : 'var(--accent-soft)')), unit: ' min' }))}
  ${chartCard('😴 Horas de sono', barChart({ bars: bars((t) => t.sleep || 0, C.violet), lines: [{ y: 7, color: C.muted, label: '7h' }], unit: ' h' }))}
  <div>
    ${chartCard('💛 Xixi (vezes)', barChart({ bars: bars((t) => t.pee, 'var(--yellow-soft)'), unit: 'x' }))}
    ${chartCard('💩 Cocô (vezes)', barChart({ bars: bars((t) => t.poop, 'var(--brown)'), unit: 'x' }))}
  </div>`;
}

function weekly(p, curWeek) {
  const f = forecast(p);
  const lastWeek = Math.max(curWeek, f?.date ? weekIndex(p, f.date) : curWeek);
  const weeks = []; for (let i = 1; i <= Math.min(lastWeek, curWeek + 26); i++) weeks.push(i);
  const S = weeks.map((n) => (n <= curWeek ? weekStats(p, n) : null));
  const labels = weeks.map((n) => `S${n}`);
  // Projeção: do peso inicial, seguindo a curva de referência e depois o ritmo do plano até a meta
  const proj = weeks.map((n) => {
    const end = weekRange(p, n).end;
    const ref = refAt(p, addDays(weekRange(p, n).start, 7));
    if (ref) return (ref.min + ref.max) / 2;
    const c = (p.refCurve || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const lastRef = c.length ? c[c.length - 1] : { date: p.startDate, min: Number(p.startWeight), max: Number(p.startWeight) };
    const base = (lastRef.min + lastRef.max) / 2;
    const v = base - (Number(p.weeklyRate) || 0.8) * (diffDays(lastRef.date, end) / 7);
    return Math.max(Number(p.goalWeight) || 0, v);
  });
  const real = S.map((s) => s?.wEnd ?? null);
  const bars = (key, color, scale = 1) => weeks.map((n, i) => ({ label: labels[i], value: S[i] ? (S[i][key] || 0) * scale : 0, color }));
  const pastLabels = labels.slice(0, curWeek); const past = (arr) => arr.slice(0, curWeek);

  return `
  ${chartCard('⚖️ Peso fechado vs. meta projetada', lineChart({ labels, series: [{ values: proj, color: 'var(--muted)', dash: true, dots: false }, { values: real, color: C.accent, connect: true }], lines: p.goalWeight ? [{ y: Number(p.goalWeight), color: C.green, label: 'meta' }] : [] }),
    legend([{ color: C.accent, label: 'Real (fim da semana)' }, { color: 'var(--muted)', label: 'Projeção do plano' }]) + (f?.date ? `<p class="muted sm mt">Previsão de chegada na meta: <b>${fmtDate(f.date, { year: true })}</b></p>` : ''))}
  ${chartCard('🔥 Média de calorias/dia', barChart({ bars: past(bars('avgKcal')).map((b) => ({ ...b, color: b.value ? kcalColor(p, b.value) : C.muted })), lines: [{ y: p.kcalGoal, color: C.green, label: fmtInt(p.kcalGoal) }], unit: ' kcal' }))}
  ${chartCard('🥩 Proteína semanal', barChart({ bars: past(bars('avgProt')).map((b) => ({ ...b, color: b.value >= p.proteinGoal ? C.green : C.orange })), lines: [{ y: p.proteinGoal, color: C.green, label: `${p.proteinGoal} g` }], unit: ' g/dia' }),
    `<p class="muted sm">Média diária de proteína em cada semana. Dias batidos: ${past(S).map((s, i) => `${pastLabels[i]} ${s.protein}/${s.days}`).join(' · ')}</p>`)}
  ${chartCard('💧 Média de água/dia (L)', barChart({ bars: past(bars('avgWater', C.blue, 1 / 1000)), lines: [{ y: p.waterGoal / 1000, color: C.blue, label: `${fmtNum(p.waterGoal / 1000, 0)} L` }], unit: ' L' }))}
  ${chartCard('🏋️ Treinos concluídos', barChart({ bars: past(bars('workouts', C.accent)), lines: [{ y: 6, color: C.muted, label: '6' }], yMax: 7 }))}
  <div>
    ${chartCard('🏃 Cardio (min)', barChart({ bars: past(bars('cardioMin', C.accent)), unit: ' min' }))}
    ${chartCard('📍 Cardio (km)', barChart({ bars: past(bars('cardioKm', C.violet)), unit: ' km', empty: 'Sem km' }))}
  </div>`;
}

const chartCard = (title, svg, foot = '') => `<section class="card chart-card"><h4>${title}</h4>${svg}${foot}</section>`;
