// Gráficos SVG leves (sem bibliotecas, funcionam offline).
const W = 340; const H = 180; const PAD = { l: 34, r: 8, t: 12, b: 24 };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function scale(min, max, a, b) { const k = max === min ? 0 : (b - a) / (max - min); return (v) => a + (v - min) * k; }
function niceTicks(min, max, n = 4) {
  const span = max - min || 1; const step0 = span / n; const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((x) => x * mag).find((x) => x >= step0) || step0;
  const out = []; for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}
const fmt = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k' : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));

function frame(yMin, yMax, labels, yFmt = fmt) {
  const y = scale(yMin, yMax, H - PAD.b, PAD.t);
  let g = '';
  for (const t of niceTicks(yMin, yMax)) {
    g += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${PAD.l - 4}" y="${y(t) + 3}" class="ax" text-anchor="end">${yFmt(t)}</text>`;
  }
  const n = labels.length; const step = Math.max(1, Math.ceil(n / 7));
  const x = (i) => PAD.l + ((W - PAD.l - PAD.r) * (i + 0.5)) / n;
  labels.forEach((l, i) => { if ((i % step === 0 && (n - 1 - i >= step || i === n - 1)) || i === n - 1) g += `<text x="${x(i)}" y="${H - 6}" class="ax" text-anchor="middle">${esc(l)}</text>`; });
  return { y, x, g };
}

// Barras com cor por barra e linhas de meta.
export function barChart({ bars, lines = [], unit = '', yMax: forceMax, empty = 'Sem dados ainda' }) {
  if (!bars.length || bars.every((b) => !b.value)) return `<div class="chart-empty">${empty}</div>`;
  const maxV = Math.max(forceMax || 0, ...bars.map((b) => b.value || 0), ...lines.map((l) => l.y)) * 1.1;
  const { y, x, g } = frame(0, maxV, bars.map((b) => b.label));
  const bw = Math.max(3, ((W - PAD.l - PAD.r) / bars.length) * 0.68);
  let s = g;
  bars.forEach((b, i) => {
    if (!b.value) return;
    const top = y(b.value);
    s += `<rect x="${x(i) - bw / 2}" y="${top}" width="${bw}" height="${H - PAD.b - top}" rx="3" fill="${b.color || 'var(--accent)'}"><title>${esc(b.label)}: ${fmt(b.value)}${unit}</title></rect>`;
  });
  for (const l of lines) s += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(l.y)}" y2="${y(l.y)}" stroke="${l.color}" stroke-dasharray="4 3" stroke-width="1.5"/><text x="${W - PAD.r}" y="${y(l.y) - 3}" class="ax" text-anchor="end" fill="${l.color}">${esc(l.label || '')}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${s}</svg>`;
}

// Linha (ex.: peso) com faixa de referência opcional e linha de meta.
export function lineChart({ labels, series, band = null, lines = [], empty = 'Sem dados ainda', yFmt }) {
  const vals = series.flatMap((s) => s.values.filter((v) => v != null));
  if (!vals.length) return `<div class="chart-empty">${empty}</div>`;
  const bandVals = band ? band.flatMap((b) => (b ? [b.min, b.max] : [])) : [];
  const all = [...vals, ...bandVals, ...lines.map((l) => l.y)];
  let lo = Math.min(...all); let hi = Math.max(...all);
  const padv = Math.max(0.5, (hi - lo) * 0.12); lo -= padv; hi += padv;
  const { y, x, g } = frame(lo, hi, labels, yFmt);
  let s = g;
  if (band) {
    const pts = band.map((b, i) => (b ? [x(i), y(b.max), y(b.min)] : null));
    const segs = []; let cur = [];
    pts.forEach((p) => { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } });
    if (cur.length) segs.push(cur);
    for (const sg of segs) {
      const d = sg.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('') + sg.slice().reverse().map((p) => `L${p[0]},${p[2]}`).join('') + 'Z';
      s += `<path d="${d}" fill="var(--band)" />`;
    }
  }
  for (const l of lines) s += `<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(l.y)}" y2="${y(l.y)}" stroke="${l.color}" stroke-dasharray="4 3" stroke-width="1.5"/><text x="${W - PAD.r}" y="${y(l.y) - 3}" class="ax" text-anchor="end" fill="${l.color}">${esc(l.label || '')}</text>`;
  for (const se of series) {
    let d = ''; let pen = false;
    se.values.forEach((v, i) => {
      if (v == null) { if (!se.connect) pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x(i)},${y(v)}`; pen = true;
    });
    s += `<path d="${d}" fill="none" stroke="${se.color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" ${se.dash ? 'stroke-dasharray="5 4"' : ''}/>`;
    if (se.dots !== false) se.values.forEach((v, i) => { if (v != null) s += `<circle cx="${x(i)}" cy="${y(v)}" r="2.8" fill="${se.color}"><title>${esc(labels[i])}: ${fmt(v)}</title></circle>`; });
  }
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img">${s}</svg>`;
}

export function legend(items) {
  return `<div class="legend">${items.map((i) => `<span><i style="background:${i.color}"></i>${esc(i.label)}</span>`).join('')}</div>`;
}
