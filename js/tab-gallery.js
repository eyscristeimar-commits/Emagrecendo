import { cache, visiblePhotos, photoUrl, isOwner, updatePhoto, deletePhoto } from './db.js';
import { fmtDate, fmtKg, fmtNum, today, weekIndex, weekRange, weightOn } from './calc.js';
import { state, esc, openModal, toast, refresh, confirmBox, avatar } from './ui.js';
import { uploadPhotoFlow } from './tab-today.js';

const KINDS = [['front', 'Frente'], ['side', 'Perfil'], ['back', 'Costas'], ['scale', 'Balança']];
const KLABEL = Object.fromEntries(KINDS);

export function renderGallery(el) {
  const pid = state.viewProfile || state.me;
  const p = cache.profiles[pid];
  const mine = isOwner(pid);
  const photos = visiblePhotos().filter((x) => x.profileId === pid && KLABEL[x.kind]);
  const byDate = {};
  for (const ph of photos) (byDate[ph.date] ||= []).push(ph);
  const dates = Object.keys(byDate).sort().reverse();

  el.innerHTML = `
  ${profilePicker(pid)}
  ${mine ? `<section class="card">
    <h3>📸 Fotos de hoje (${fmtDate(today())})</h3>
    <div class="slots">${KINDS.slice(0, 3).map(([k, l]) => {
      const has = photos.find((x) => x.date === today() && x.kind === k);
      return `<button class="slot ${has ? 'has' : ''}" data-up="${k}">${has ? `<img data-path="${esc(has.path)}" alt="">` : '<span>＋</span>'}<em>${l}</em></button>`;
    }).join('')}</div>
    <p class="muted sm">Dica: mesma luz, mesmo lugar e mesma roupa toda semana deixam a comparação mais justa.</p>
  </section>` : ''}

  <section class="card">
    <div class="row between"><h3>🖼️ Evolução</h3>
      <div class="seg sm"><button data-gv="diaria" class="${state.galleryView === 'diaria' ? 'on' : ''}">Diária</button><button data-gv="semanal" class="${state.galleryView === 'semanal' ? 'on' : ''}">Semanal</button></div>
    </div>
    ${!dates.length ? `<p class="muted">Nenhuma foto ${mine ? 'ainda' : 'liberada para o grupo'}.</p>` : state.galleryView === 'diaria' ? dates.map((d) => dayRow(p, d, byDate[d])).join('') : weekRows(p, photos)}
  </section>

  <section class="card">
    <h3>⚖️ Antes vs Depois</h3>
    ${dates.length < 2 ? '<p class="muted sm">Precisa de fotos em pelo menos duas datas.</p>' : `
    <div class="grid2">
      <label class="field"><span>Antes</span><select id="cmpA">${dates.slice().reverse().map((d, i) => `<option value="${d}" ${i === 0 ? 'selected' : ''}>${fmtDate(d, { year: true })}</option>`).join('')}</select></label>
      <label class="field"><span>Depois</span><select id="cmpB">${dates.map((d, i) => `<option value="${d}" ${i === 0 ? 'selected' : ''}>${fmtDate(d, { year: true })}</option>`).join('')}</select></label>
    </div>
    <div id="cmp"></div>`}
  </section>`;

  el.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => { state.viewProfile = b.dataset.pick; refresh(); });
  el.querySelectorAll('[data-up]').forEach((b) => b.onclick = () => uploadPhotoFlow(p, today(), b.dataset.up));
  el.querySelectorAll('[data-gv]').forEach((b) => b.onclick = () => { state.galleryView = b.dataset.gv; refresh(); });
  el.querySelectorAll('[data-ph]').forEach((b) => b.onclick = () => viewer(cache.photos.find((x) => x.id === b.dataset.ph)));
  const doCmp = () => {
    const a = el.querySelector('#cmpA').value; const b = el.querySelector('#cmpB').value;
    el.querySelector('#cmp').innerHTML = compare(p, a, b, byDate);
    hydrate(el.querySelector('#cmp'));
  };
  if (el.querySelector('#cmpA')) { el.querySelector('#cmpA').onchange = doCmp; el.querySelector('#cmpB').onchange = doCmp; doCmp(); }
  hydrate(el);
}

export function profilePicker(pid) {
  const ps = Object.values(cache.profiles);
  if (ps.length < 2) return '';
  return `<div class="pp">${ps.map((p) => `<button data-pick="${esc(p.id)}" class="${p.id === pid ? 'on' : ''}">${avatar(p, 26)}<span>${esc(p.name.split(' ')[0])}</span></button>`).join('')}</div>`;
}

function thumb(ph) {
  return `<button class="thumb" data-ph="${esc(ph.id)}"><img data-path="${esc(ph.path)}" alt=""><em>${KLABEL[ph.kind]}${ph.visibility === 'private' ? ' 🔒' : ''}</em></button>`;
}

function dayRow(p, date, list) {
  const w = weightOn(p.id, date);
  const order = Object.keys(KLABEL);
  return `<div class="g-row"><div class="g-h"><b>${fmtDate(date, { wd: true })}</b><span class="muted sm">${w != null ? fmtKg(w) : ''}</span></div>
    <div class="thumbs">${list.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).map(thumb).join('')}</div></div>`;
}

function weekRows(p, photos) {
  const weeks = {};
  for (const ph of photos) (weeks[weekIndex(p, ph.date)] ||= []).push(ph);
  return Object.keys(weeks).map(Number).sort((a, b) => b - a).map((n) => {
    const r = weekRange(p, n);
    // última foto de cada tipo dentro da semana (fechamento)
    const last = {};
    for (const ph of weeks[n].sort((a, b) => a.date.localeCompare(b.date))) last[ph.kind] = ph;
    const ws = Object.keys(cache.days[p.id] || {}).filter((d) => d >= r.start && d <= r.end && weightOn(p.id, d) != null).sort();
    const w = ws.length ? weightOn(p.id, ws[ws.length - 1]) : null;
    return `<div class="g-row"><div class="g-h"><b>${n >= 1 ? `Semana ${n}` : 'Antes do início'}</b><span class="muted sm">${fmtDate(r.start)}–${fmtDate(r.end)}${w != null ? ' · fechou em ' + fmtKg(w) : ''}</span></div>
      <div class="thumbs">${Object.keys(KLABEL).filter((k) => last[k]).map((k) => thumb(last[k])).join('')}</div></div>`;
  }).join('');
}

function compare(p, a, b, byDate) {
  const wa = weightOn(p.id, a); const wb = weightOn(p.id, b);
  const diff = wa != null && wb != null ? wb - wa : null;
  const kinds = Object.keys(KLABEL).filter((k) => (byDate[a] || []).some((x) => x.kind === k) || (byDate[b] || []).some((x) => x.kind === k));
  const cell = (d, k) => { const ph = (byDate[d] || []).find((x) => x.kind === k); return ph ? `<img data-path="${esc(ph.path)}" alt="">` : '<div class="noimg">sem foto</div>'; };
  return `
    <div class="cmp-head"><div><b>${fmtDate(a, { year: true })}</b><span>${fmtKg(wa)}</span></div>
      <div class="cmp-diff ${diff != null && diff < 0 ? 'c-green' : ''}">${diff == null ? '' : `${diff > 0 ? '+' : ''}${fmtNum(diff)} kg`}</div>
      <div><b>${fmtDate(b, { year: true })}</b><span>${fmtKg(wb)}</span></div></div>
    ${kinds.map((k) => `<div class="cmp-row"><div class="cmp-k">${KLABEL[k]}</div><div class="cmp-pair">${cell(a, k)}${cell(b, k)}</div></div>`).join('')}`;
}

export function hydrate(root) {
  root.querySelectorAll('img[data-path]').forEach(async (img) => {
    const u = await photoUrl(img.dataset.path);
    if (u) img.src = u;
  });
}

function viewer(ph) {
  if (!ph) return;
  const mine = isOwner(ph.profileId);
  const { body, close } = openModal(`
    <div class="viewer"><img data-path="${esc(ph.path)}" alt=""></div>
    <p class="mt"><b>${KLABEL[ph.kind] || 'Foto'}</b> · ${fmtDate(ph.date, { long: true, year: true })}${ph.weight ? ' · ' + fmtKg(ph.weight) : ''}</p>
    ${mine ? `<div class="row mt wrap">
      <button class="btn ghost grow" id="vis">${ph.visibility === 'group' ? '🔒 Tornar privada' : '👥 Liberar para o grupo'}</button>
      <button class="btn danger ghost" id="del">Excluir</button></div>` : ''}`, { wide: true });
  hydrate(body);
  body.querySelector('#vis')?.addEventListener('click', async () => {
    await updatePhoto({ ...ph, visibility: ph.visibility === 'group' ? 'private' : 'group' });
    toast('Privacidade atualizada'); close();
  });
  body.querySelector('#del')?.addEventListener('click', async () => {
    if (!(await confirmBox('Excluir esta foto?', 'Excluir'))) return;
    await deletePhoto(ph); close();
  });
}
