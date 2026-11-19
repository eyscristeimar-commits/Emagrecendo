import { cache, getDay, saveDay, addPhoto, photoUrl, isOwner, uuid } from './db.js';
import { emptyDay, dayTotals, forecast, fmtDate, fmtKg, fmtNum, fmtInt, today, addDays, weekIndex, kcalColor, hoursSincePoop, nextWorkout, fmtTime, refAt, workoutLabel, bmi, energy, latestWeight } from './calc.js';
import { state, esc, openModal, toast, pickImage, compressImage, busy, parseHours, fmtHours, refresh, confirmBox } from './ui.js';
import { analyzeMealText, analyzeMealPhoto, sumItems, aiAvailable } from './nutrition.js';

export const dayCopy = (pid, date) => structuredClone(getDay(pid, date) || emptyDay());
export const MEAL_NAMES = ['Café da manhã', 'Lanche da manhã', 'Almoço', 'Lanche da tarde', 'Pré-treino', 'Pós-treino', 'Jantar', 'Ceia'];

export function forecastCard(p) {
  const f = forecast(p);
  if (!f) return `<div class="card"><p class="muted">Defina o peso inicial e a meta no perfil para ver a previsão.</p></div>`;
  const pct = p.startWeight && p.startWeight > f.goal ? Math.min(100, Math.max(0, ((p.startWeight - f.current) / (p.startWeight - f.goal)) * 100)) : 0;
  const ref = refAt(p, today());
  return `<div class="card hero">
    <div class="hero-top">
      <div><div class="label">Peso atual</div><div class="big">${fmtKg(f.current)}</div><div class="muted sm">${f.lost > 0 ? `−${fmtNum(f.lost)} kg desde o início` : `início: ${fmtKg(p.startWeight)}`}</div></div>
      <div class="right"><div class="label">Faltam</div><div class="big accent">${f.reached ? '🎉 0' : fmtNum(f.remaining)} kg</div><div class="muted sm">meta ${fmtKg(f.goal)}</div></div>
    </div>
    <div class="progress"><span style="width:${pct}%"></span></div>
    <div class="hero-bottom">
      ${f.reached ? '<b>Meta atingida! Parabéns!</b>' : `📅 Previsão para chegar na meta: <b>${fmtDate(f.date, { long: true, year: true })}</b> <span class="muted">(~${f.weeksLeft} sem.)</span>`}
      ${f.realRateWeek ? `<div class="muted sm">Seu ritmo real: −${fmtNum(f.realRateWeek)} kg/semana → ${fmtDate(f.realDate, { year: true })}</div>` : ''}
      ${p.interim ? `<div class="muted sm">Meta do Bloco 1 (até ${fmtDate(p.interim.date)}): ${fmtNum(p.interim.min)}–${fmtNum(p.interim.max)} kg</div>` : ''}
      ${energyLine(p, f.current)}
      ${ref && today() >= p.startDate ? `<div class="muted sm">Referência para hoje: ${fmtNum(ref.min)}–${fmtNum(ref.max)} kg</div>` : ''}
    </div>
  </div>`;
}

export function energyLine(p, w) {
  const b = bmi(p, w); const e = energy(p, w);
  if (!b && !e) return '';
  return `<div class="energy">
    ${b ? `<span><b>IMC ${fmtNum(b.v)}</b><i>${b.cls}</i></span>` : ''}
    ${e ? `<span><b>${fmtInt(e.tdee)}</b><i>gasto/dia (kcal)</i></span><span><b>${fmtInt(Math.abs(e.deficit))}</b><i>${e.deficit >= 0 ? 'déficit/dia' : 'superávit/dia'} (kcal)</i></span><span><b>${fmtNum(e.kgPerWeek)} kg</b><i>perda/sem. estimada</i></span>` : ''}
  </div>`;
}

export function renderToday(el) {
  const p = cache.profiles[state.me];
  const date = state.date;
  const d = getDay(p.id, date) || emptyDay();
  const t = dayTotals(p, d, date);
  const wk = weekIndex(p, date);
  const kcalPct = Math.min(100, (t.kcal / p.kcalTol) * 100);
  const protPct = Math.min(100, (t.protein / p.proteinGoal) * 100);
  const waterPct = Math.min(100, (t.water / p.waterGoal) * 100);
  const hp = hoursSincePoop(p.id);
  const scalePhotos = cache.photos.filter((x) => x.profileId === p.id && x.date === date && x.kind === 'scale');

  el.innerHTML = `
  ${forecastCard(p)}
  <div class="datenav">
    <button class="icon-btn" data-act="prev" aria-label="Dia anterior">‹</button>
    <div class="center"><b>${date === today() ? 'Hoje' : fmtDate(date, { long: true })}</b><div class="muted sm">${fmtDate(date, { year: true })} · ${wk >= 1 ? `Semana ${wk} do plano` : `Plano começa em ${fmtDate(p.startDate)}`}</div></div>
    <button class="icon-btn" data-act="next" ${date >= today() ? 'disabled' : ''} aria-label="Próximo dia">›</button>
  </div>

  <section class="card">
    <h3>⚖️ Pesagem em jejum</h3>
    <div class="row">
      <input type="text" inputmode="decimal" step="0.1" placeholder="Peso (kg)" id="w-in" value="${d.weight != null ? String(d.weight).replace('.', ',') : ''}" class="grow">
      <button class="btn" data-act="save-w">Salvar</button>
      <button class="btn ghost" data-act="scale-photo" title="Foto da balança">📷</button>
    </div>
    ${d.weightAt ? `<div class="muted sm mt">Registrado às ${fmtTime(d.weightAt)}${scalePhotos.length ? ' · com foto' : ''}</div>` : ''}
    <div class="thumbs" id="scale-thumbs"></div>
  </section>

  <section class="card">
    <h3>💧 Água <span class="muted sm">${fmtInt(t.water)} / ${fmtInt(p.waterGoal)} mL</span></h3>
    <div class="bar water"><span style="width:${waterPct}%"></span><em>${fmtNum(t.water / 1000, 2)} L</em></div>
    ${t.waterHit ? '<div class="tag green mt">✅ Meta de 4 L batida!</div>' : ''}
    <div class="row mt wrap">
      <button class="btn water-btn" data-water="250">+250 mL</button>
      <button class="btn water-btn" data-water="500">+500 mL</button>
      <button class="btn water-btn" data-water="1000">+1.000 mL</button>
      <button class="btn ghost sm" data-water="-250" title="Desfazer 250 mL">−250</button>
    </div>
  </section>

  <section class="card">
    <h3>🍽️ Alimentação</h3>
    <div class="metric"><span>Calorias</span><b style="color:${t.hasMeals ? kcalColor(p, t.kcal) : 'inherit'}">${fmtInt(t.kcal)} kcal</b></div>
    <div class="bar kcal ${t.kcalStatus}"><span style="width:${kcalPct}%"></span><i class="mark" style="left:${(p.kcalGoal / p.kcalTol) * 100}%"></i></div>
    <div class="muted sm">Meta ${fmtInt(p.kcalGoal)} kcal (verde) · tolerância até ${fmtInt(p.kcalTol)} kcal (amarelo) · acima disso vermelho</div>
    <div class="metric mt"><span>Proteína</span><b class="${t.proteinHit ? 'c-green' : t.hasMeals ? 'c-orange' : ''}">${fmtNum(t.protein, 0)} / ${p.proteinGoal} g</b></div>
    <div class="bar prot ${t.proteinHit ? 'green' : 'orange'}"><span style="width:${protPct}%"></span></div>
    <div class="macros">
      <div><b>${fmtNum(t.carbs, 0)}g</b><span>Carbo</span></div>
      <div><b>${fmtNum(t.fat, 0)}g</b><span>Gordura</span></div>
      <div><b>${fmtNum(t.sugar, 0)}g</b><span>Açúcar</span></div>
    </div>
    ${t.addedSugar ? '<div class="tag yellow mt">🍬 Açúcar pontual contabilizado</div>' : '<div class="tag green-soft mt">Zero açúcar adicionado</div>'}
    <div class="meals">${(d.meals || []).map((m) => `
      <button class="meal" data-meal="${esc(m.id)}">
        <div class="meal-h"><b>${esc(m.name)}</b><span class="muted sm">${m.at ? fmtTime(m.at) : ''} ${m.source === 'ia' ? '· IA' : ''}</span></div>
        <div class="muted sm ellipsis">${esc((m.items || []).map((i) => `${i.grams}g ${i.name}`).join(', '))}</div>
        <div class="meal-m"><span>${fmtInt(m.totals?.kcal)} kcal</span><span>P ${fmtNum(m.totals?.protein, 0)}g</span><span>C ${fmtNum(m.totals?.carbs, 0)}g</span><span>G ${fmtNum(m.totals?.fat, 0)}g</span></div>
      </button>`).join('') || '<p class="muted sm">Nenhuma refeição registrada.</p>'}</div>
    <div class="row mt">
      <button class="btn grow" data-act="meal-photo">📷 Foto do prato</button>
      <button class="btn grow ghost" data-act="meal-text">✍️ Escrever alimentos</button>
    </div>
  </section>

  <section class="card">
    <h3>🩺 Check-up do dia</h3>
    <div class="grid2">
      <label class="field"><span>😴 Sono (horas)</span><input id="sleep-in" placeholder="ex: 7h30" value="${esc(fmtHours(d.sleep))}"></label>
      <label class="field"><span>Qualidade</span>
        <div class="stars" id="sleepq">${[1, 2, 3, 4, 5].map((n) => `<button data-q="${n}" class="${(d.sleepQ || 0) >= n ? 'on' : ''}" aria-label="${n}">★</button>`).join('')}</div>
      </label>
    </div>
    <div class="counters">
      <div class="counter"><span>💛 Xixi</span><div><button class="icon-btn" data-cnt="pee" data-d="-1">−</button><b>${d.pee || 0}</b><button class="icon-btn plus" data-cnt="pee" data-d="1">+1</button></div></div>
      <div class="counter"><span>💩 Cocô</span><div><button class="icon-btn" data-cnt="poop" data-d="-1">−</button><b>${d.poop || 0}</b><button class="icon-btn plus" data-cnt="poop" data-d="1">+1</button></div></div>
    </div>
    ${hp != null && hp > 24 && date === today() ? `<div class="tag soft-warn mt">🌿 Faz ${Math.floor(hp)}h sem registro de cocô. Capriche na água, fibras e salada hoje.</div>` : ''}
  </section>

  <section class="card clickable" data-act="go-train">
    <h3>🏋️ Treino & Cardio</h3>
    <div class="row between">
      <span>${t.workoutDone ? `✅ ${esc(workoutLabel(p, d.workout.num))}` : `Próximo: ${esc(workoutLabel(p, nextWorkout(p, date)))}`}</span>
      <span class="muted">›</span>
    </div>
    <div class="muted sm mt">Cardio: ${fmtInt(t.cardioMin)} min${t.cardioKm ? ` · ${fmtNum(t.cardioKm)} km` : ''} (meta ${t.cardioGoal.min}–${t.cardioGoal.max} min) ${t.cardioHit ? '✅' : ''}</div>
  </section>`;

  // thumbs da balança
  const th = el.querySelector('#scale-thumbs');
  scalePhotos.forEach(async (ph) => { const u = await photoUrl(ph.path); if (u) th.insertAdjacentHTML('beforeend', `<img src="${u}" alt="Foto da balança">`); });

  const upd = (fn) => { const c = dayCopy(p.id, date); fn(c); saveDay(p.id, date, c); };

  el.querySelector('[data-act=prev]').onclick = () => { state.date = addDays(date, -1); refresh(); };
  el.querySelector('[data-act=next]').onclick = () => { if (date < today()) { state.date = addDays(date, 1); refresh(); } };
  el.querySelector('[data-act=save-w]').onclick = () => {
    const v = parseFloat(String(el.querySelector('#w-in').value).replace(',', '.'));
    if (!v || v < 30 || v > 300) return toast('Digite um peso válido', 'err');
    upd((c) => { c.weight = v; c.weightAt = c.weightAt || new Date().toISOString(); });
    toast('Peso salvo ✅');
  };
  el.querySelector('#w-in').onkeydown = (e) => { if (e.key === 'Enter') el.querySelector('[data-act=save-w]').click(); };
  el.querySelector('[data-act=scale-photo]').onclick = () => uploadPhotoFlow(p, date, 'scale');
  el.querySelectorAll('[data-water]').forEach((b) => b.onclick = () => {
    const ml = Number(b.dataset.water);
    upd((c) => { c.water = Math.max(0, (c.water || 0) + ml); (c.waterLog ||= []).push({ ml, at: new Date().toISOString() }); });
    if (ml > 0 && (d.water || 0) < p.waterGoal && (d.water || 0) + ml >= p.waterGoal) toast('💧 Meta de água batida! Parabéns!');
  });
  el.querySelector('[data-act=meal-photo]').onclick = () => openMealModal(p, date, null, 'foto');
  el.querySelector('[data-act=meal-text]').onclick = () => openMealModal(p, date, null, 'texto');
  el.querySelectorAll('[data-meal]').forEach((b) => b.onclick = () => openMealModal(p, date, (d.meals || []).find((m) => m.id === b.dataset.meal)));
  el.querySelector('#sleep-in').onchange = (e) => {
    const h = parseHours(e.target.value);
    if (e.target.value && h == null) return toast('Use o formato 7h30', 'err');
    upd((c) => { c.sleep = h; });
  };
  el.querySelectorAll('#sleepq button').forEach((b) => b.onclick = () => upd((c) => { c.sleepQ = Number(b.dataset.q); }));
  el.querySelectorAll('[data-cnt]').forEach((b) => b.onclick = () => upd((c) => {
    const k = b.dataset.cnt; const dl = Number(b.dataset.d);
    c[k] = Math.max(0, (c[k] || 0) + dl);
    if (k === 'poop') { c.poopLog ||= []; if (dl > 0) c.poopLog.push(new Date().toISOString()); else c.poopLog.pop(); }
  }));
  el.querySelector('[data-act=go-train]').onclick = () => { state.tab = 'treino'; refresh(); };
}

// Fluxo de envio de foto (balança ou corporal), com escolha de privacidade.
export async function uploadPhotoFlow(p, date, kind) {
  const labels = { scale: 'Foto da balança', front: 'Frente', side: 'Perfil', back: 'Costas' };
  const { body, close } = openModal(`
    <h2>${labels[kind]}</h2>
    <p class="muted sm">${fmtDate(date, { long: true, year: true })}</p>
    <div class="row mt"><button class="btn grow" data-src="cam">📷 Tirar foto</button><button class="btn ghost grow" data-src="gal">🖼️ Galeria</button></div>
    <div class="preview mt" id="pv"></div>
    <fieldset class="mt"><legend>Quem pode ver esta foto?</legend>
      <label class="radio"><input type="radio" name="vis" value="group" ${kind === 'scale' ? 'checked' : ''}> 👥 Todo o Grupo do Link</label>
      <label class="radio"><input type="radio" name="vis" value="private" ${kind !== 'scale' ? 'checked' : ''}> 🔒 Somente Meu Perfil / Privado</label>
    </fieldset>
    <button class="btn block mt" id="send" disabled>Salvar foto</button>`);
  let img = null;
  const choose = async (camera) => {
    const f = await pickImage({ camera });
    if (!f) return;
    img = await compressImage(f);
    body.querySelector('#pv').innerHTML = `<img src="${img.dataUrl}" alt="">`;
    body.querySelector('#send').disabled = false;
  };
  body.querySelector('[data-src=cam]').onclick = () => choose(true);
  body.querySelector('[data-src=gal]').onclick = () => choose(false);
  body.querySelector('#send').onclick = async (e) => {
    busy(e.target, true, 'Enviando…');
    try {
      const vis = body.querySelector('input[name=vis]:checked').value;
      const w = getDay(p.id, date)?.weight ?? null;
      await addPhoto({ profileId: p.id, date, kind, visibility: vis, weight: w }, img.blob);
      if (kind === 'scale') {
        const c = dayCopy(p.id, date); c.weightAt ||= new Date().toISOString(); saveDay(p.id, date, c);
      }
      toast('Foto salva ✅'); close();
    } catch (err) { console.error(err); toast('Erro ao salvar: ' + err.message, 'err'); busy(e.target, false); }
  };
}

// ---------- Modal de refeição ----------
export function openMealModal(p, date, meal, startMode = 'texto') {
  const editing = !!meal;
  const m = meal ? structuredClone(meal) : { id: uuid(), name: guessMealName(), items: [], text: '', source: 'manual', at: new Date().toISOString() };
  let mode = startMode;
  let photo = null;

  const { body, close } = openModal('<div id="mm"></div>', { wide: true });
  const root = body.querySelector('#mm');

  const draw = () => {
    const tot = sumItems(m.items);
    root.innerHTML = `
      <h2>${editing ? 'Editar refeição' : 'Nova refeição'}</h2>
      <label class="field"><span>Refeição</span><select id="mname">${MEAL_NAMES.map((n) => `<option ${n === m.name ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      ${!editing ? `<div class="seg mt"><button data-mode="foto" class="${mode === 'foto' ? 'on' : ''}">📷 Foto do prato</button><button data-mode="texto" class="${mode === 'texto' ? 'on' : ''}">✍️ Texto com gramas</button></div>` : ''}
      ${!editing && mode === 'foto' ? `
        <div class="mt">
          <div class="row"><button class="btn grow" data-ph="cam">📷 Tirar foto</button><button class="btn ghost grow" data-ph="gal">🖼️ Galeria</button></div>
          <div class="preview mt">${photo ? `<img src="${photo.dataUrl}" alt="">` : ''}</div>
          <input id="hint" class="mt" placeholder="Opcional: detalhe (ex: arroz integral, 2 ovos)">
          <button class="btn block mt" id="analyze-photo" ${photo ? '' : 'disabled'}>🔍 Analisar com IA</button>
          ${aiAvailable() ? '' : '<p class="muted sm mt">A análise por foto precisa da IA. Configure em ⚙️ Ajustes → IA. Você ainda pode preencher os valores abaixo manualmente.</p>'}
        </div>` : ''}
      ${!editing && mode === 'texto' ? `
        <div class="mt">
          <textarea id="mtext" rows="3" placeholder="ex: 160g de acém moído, 70g de arroz branco, 100g de salada&#10;ou: 3 ovos inteiros e 50g de cuscuz">${esc(m.text)}</textarea>
          <div class="row mt"><button class="btn grow" id="calc">🧮 Calcular</button>${aiAvailable() ? '<button class="btn ghost" id="calc-ai">✨ IA</button>' : ''}</div>
        </div>` : ''}
      <div id="msg"></div>
      <div class="items mt">
        <div class="item head"><span>Alimento</span><span>g</span><span>kcal</span><span>P</span><span>C</span><span>G</span><span>Aç</span><span></span></div>
        ${m.items.map((i, idx) => `
          <div class="item" data-idx="${idx}">
            <input data-k="name" value="${esc(i.name)}">
            <input data-k="grams" type="text" inputmode="decimal" value="${i.grams}">
            <input data-k="kcal" type="text" inputmode="decimal" value="${i.kcal}">
            <input data-k="protein" type="text" inputmode="decimal" value="${i.protein}">
            <input data-k="carbs" type="text" inputmode="decimal" value="${i.carbs}">
            <input data-k="fat" type="text" inputmode="decimal" value="${i.fat}">
            <input data-k="sugar" type="text" inputmode="decimal" value="${i.sugar}">
            <button class="icon-btn sm" data-del="${idx}" aria-label="Remover">✕</button>
          </div>`).join('')}
        <button class="btn ghost sm mt" id="add-item">+ Adicionar item manual</button>
      </div>
      <div class="totals mt"><b>Total:</b> ${fmtInt(tot.kcal)} kcal · P ${fmtNum(tot.protein, 0)}g · C ${fmtNum(tot.carbs, 0)}g · G ${fmtNum(tot.fat, 0)}g · Açúcar ${fmtNum(tot.sugar, 0)}g
        ${m.items.some((i) => i.addedSugar) ? '<div class="tag yellow mt">🍬 Açúcar pontual contabilizado</div>' : ''}</div>
      <label class="check mt"><input type="checkbox" id="added-sugar" ${m.items.some((i) => i.addedSugar) ? 'checked' : ''}> Teve açúcar adicionado nesta refeição</label>
      <div class="row mt">
        ${editing ? '<button class="btn danger ghost" id="del-meal">Excluir</button>' : ''}
        <button class="btn grow" id="save-meal" ${m.items.length ? '' : 'disabled'}>Salvar refeição</button>
      </div>`;
    bind();
  };

  const showMsg = (html, cls = '') => { root.querySelector('#msg').innerHTML = html ? `<div class="note ${cls} mt">${html}</div>` : ''; };

  const bind = () => {
    root.querySelector('#mname').onchange = (e) => { m.name = e.target.value; };
    root.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { mode = b.dataset.mode; draw(); });
    root.querySelectorAll('[data-ph]').forEach((b) => b.onclick = async () => {
      const f = await pickImage({ camera: b.dataset.ph === 'cam' }); if (!f) return;
      photo = await compressImage(f, 1100, 0.8); draw();
    });
    const ap = root.querySelector('#analyze-photo');
    if (ap) ap.onclick = async () => {
      busy(ap, true, 'Analisando…');
      try {
        const r = await analyzeMealPhoto(photo.base64, 'image/jpeg', root.querySelector('#hint').value);
        m.items = r.items.map(roundItem); m.source = 'ia'; m.notes = r.notes; draw();
        showMsg(`✨ ${esc(r.notes || 'Estimativa da IA.')} Confira e ajuste as gramas se precisar.`);
      } catch (err) { busy(ap, false); showMsg(esc(err.message), 'err'); }
    };
    const ta = root.querySelector('#mtext');
    if (ta) ta.oninput = () => { m.text = ta.value; };
    const runCalc = async (btn, forceAI) => {
      if (!m.text.trim()) return showMsg('Escreva o que comeu, com as gramas.', 'err');
      busy(btn, true, 'Calculando…');
      try {
        const r = await analyzeMealText(m.text, { forceAI });
        m.items = r.items.map(roundItem); m.source = r.source; draw();
        if (r.unknown?.length) showMsg(`Não reconheci: <b>${r.unknown.map(esc).join(', ')}</b>. ${aiAvailable() ? 'Toque em ✨ IA para calcular tudo com a IA,' : 'Adicione esses itens manualmente'} ou ajuste abaixo.`, 'warn');
        else showMsg(r.source === 'ia' ? `✨ Calculado pela IA. ${esc(r.notes || '')}` : '🧮 Calculado pela tabela de alimentos (TACO). Confira os valores.');
      } catch (err) { busy(btn, false); showMsg(esc(err.message), 'err'); }
    };
    const c1 = root.querySelector('#calc'); if (c1) c1.onclick = () => runCalc(c1, false);
    const c2 = root.querySelector('#calc-ai'); if (c2) c2.onclick = () => runCalc(c2, true);
    root.querySelectorAll('.item[data-idx] input').forEach((inp) => inp.onchange = () => {
      const i = m.items[Number(inp.closest('.item').dataset.idx)];
      const k = inp.dataset.k;
      if (k === 'name') i.name = inp.value;
      else if (k === 'grams') {
        const g = Number(String(inp.value).replace(',', '.')) || 0; const f = i.grams ? g / i.grams : 0;
        if (f) for (const kk of ['kcal', 'protein', 'carbs', 'fat', 'sugar']) i[kk] = Math.round(i[kk] * f * 10) / 10;
        i.grams = g; draw(); return;
      } else i[k] = Number(String(inp.value).replace(',', '.')) || 0;
      draw();
    });
    root.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { m.items.splice(Number(b.dataset.del), 1); draw(); });
    root.querySelector('#add-item').onclick = () => { m.items.push({ name: 'Item', grams: 100, kcal: 0, protein: 0, carbs: 0, fat: 0, sugar: 0, addedSugar: false }); draw(); };
    root.querySelector('#added-sugar').onchange = (e) => {
      if (!m.items.length) return;
      if (e.target.checked) { if (!m.items.some((i) => i.addedSugar)) m.items[m.items.length - 1].addedSugar = true; }
      else m.items.forEach((i) => { i.addedSugar = false; });
      draw();
    };
    root.querySelector('#save-meal').onclick = () => {
      m.totals = sumItems(m.items);
      const c = dayCopy(p.id, date);
      c.meals ||= [];
      const ix = c.meals.findIndex((x) => x.id === m.id);
      if (ix >= 0) c.meals[ix] = m; else c.meals.push(m);
      saveDay(p.id, date, c);
      toast(`Refeição salva: ${fmtInt(m.totals.kcal)} kcal ✅`);
      close();
    };
    const dm = root.querySelector('#del-meal');
    if (dm) dm.onclick = async () => {
      if (!(await confirmBox('Excluir esta refeição?', 'Excluir'))) return;
      const c = dayCopy(p.id, date); c.meals = (c.meals || []).filter((x) => x.id !== m.id); saveDay(p.id, date, c); close();
    };
  };
  draw();
}

const roundItem = (i) => ({
  name: i.name, grams: Math.round(Number(i.grams) || 0), kcal: Math.round(Number(i.kcal) || 0),
  protein: Math.round((Number(i.protein) || 0) * 10) / 10, carbs: Math.round((Number(i.carbs) || 0) * 10) / 10,
  fat: Math.round((Number(i.fat) || 0) * 10) / 10, sugar: Math.round((Number(i.sugar) || 0) * 10) / 10, addedSugar: !!i.addedSugar,
});

function guessMealName() {
  const h = new Date().getHours() + new Date().getMinutes() / 60;
  if (h < 10) return 'Café da manhã';
  if (h < 11.5) return 'Lanche da manhã';
  if (h < 14) return 'Almoço';
  if (h < 16.5) return 'Lanche da tarde';
  if (h < 20.5) return 'Jantar';
  return 'Ceia';
}
