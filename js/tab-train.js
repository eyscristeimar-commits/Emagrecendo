import { cache, getDay, saveDay, saveProfile, uuid, addPhoto } from './db.js';
import { emptyDay, dayTotals, nextWorkout, nextCoreLoaded, fmtDate, fmtNum, fmtInt, today, weekIndex, planOf, allPlans, workoutLabel } from './calc.js';
import { state, esc, openModal, toast, refresh, busy, pickImage, compressImage, confirmBox } from './ui.js';
import { CORE, PLAN_EYSHILLA } from './presets.js';
import { stravaReady, connect, fetchDay, STRAVA_LINK_RE, disconnect } from './strava.js';
import { aiAvailable, readCardioPrint, generatePlan } from './nutrition.js';

const INDOOR = ['Elíptico', 'Bicicleta ergométrica', 'Esteira'];
const OUTDOOR = ['Bike aro 29 (rua)', 'Caminhada externa', 'Corrida'];
const dayCopy = (pid, date) => structuredClone(getDay(pid, date) || emptyDay());

export function renderTrain(el) {
  const p = cache.profiles[state.me];
  const date = state.date;
  const d = getDay(p.id, date) || emptyDay();
  const t = dayTotals(p, d, date);
  const plan = planOf(p);
  const suggested = nextWorkout(p, date);
  const w = d.workout && (d.workout.planId || PLAN_EYSHILLA.id) === plan.id ? d.workout
    : { planId: plan.id, num: suggested, done: false, ex: {}, pullup: false, core: false, coreLoaded: nextCoreLoaded(p, date), coreEx: {} };
  const num = Math.min(w.num || suggested, plan.days.length);
  const list = plan.days[num - 1]?.ex || [];
  const coreList = w.coreLoaded ? CORE.loaded : CORE.free;
  const doneCount = list.filter((_, i) => w.ex?.[i]).length;

  el.innerHTML = `
  <div class="datenav"><div class="center"><b>${date === today() ? 'Hoje' : fmtDate(date, { long: true })}</b><div class="muted sm">Semana ${Math.max(1, weekIndex(p, date))} · rotação contínua 1 → ${plan.days.length}</div></div></div>

  <section class="card">
    <div class="row between"><h3>🏋️ Musculação</h3><button class="btn ghost sm" data-act="plans">📚 Fichas</button></div>
    <div class="muted sm">Ficha atual: <b>${esc(plan.name)}</b></div>
    <div class="chips mt">${plan.days.map((dd, i) => { const n = i + 1; return `<button class="chip ${n === num ? 'on' : ''} ${n === suggested ? 'sug' : ''}" data-num="${n}"><b>${n}</b><span>${esc(dd.name)}</span></button>`; }).join('')}</div>
    <p class="muted sm">${num === suggested ? 'Esse é o próximo da fila.' : `O próximo da fila seria o Treino ${suggested}.`}</p>

    <div class="checklist">
      ${plan.pullup ? `<label class="check must"><input type="checkbox" data-flag="pullup" ${w.pullup ? 'checked' : ''}> <span><b>Barra fixa</b> (1x máx na entrada)</span>
        <input class="mini" type="number" inputmode="numeric" placeholder="reps" data-flag="pullupReps" value="${w.pullupReps ?? ''}"></label>` : ''}
      <div class="ex-head"><b>${esc(workoutLabel(p, num, plan))}</b><span class="muted sm">${doneCount}/${list.length}</span></div>
      ${list.map((x, i) => `<label class="check"><input type="checkbox" data-ex="${i}" ${w.ex?.[i] ? 'checked' : ''}> <span>${esc(x)}</span></label>`).join('')}
      ${plan.core ? `<div class="ex-head"><b>Bloco de abdômen – ${w.coreLoaded ? 'com carga' : 'sem carga'}</b><button class="link" data-act="toggle-core">trocar</button></div>
      ${coreList.map((x, i) => `<label class="check"><input type="checkbox" data-core="${i}" ${w.coreEx?.[i] ? 'checked' : ''}> <span>${esc(x)}</span></label>`).join('')}
      <label class="check must"><input type="checkbox" data-flag="core" ${w.core ? 'checked' : ''}> <span><b>Bloco de abdômen concluído</b></span></label>` : ''}
    </div>
    <button class="btn block mt ${w.done ? 'ok' : ''}" data-act="done">${w.done ? '✅ Treino concluído (toque para desfazer)' : 'Concluir treino'}</button>
  </section>

  <section class="card">
    <h3>🏃 Cardio <span class="muted sm">meta ${t.cardioGoal.min}–${t.cardioGoal.max} min/dia</span></h3>
    <div class="bar water"><span style="width:${Math.min(100, (t.cardioMin / t.cardioGoal.min) * 100)}%"></span><em>${fmtInt(t.cardioMin)} min</em></div>
    <div class="muted sm mt">${t.cardioKm ? `${fmtNum(t.cardioKm)} km · ` : ''}${t.cardioKcal ? `${fmtInt(t.cardioKcal)} kcal gastas` : ''}</div>
    <div class="cardio-list">${(d.cardio || []).map((c) => `
      <div class="cardio-item">
        <div><b>${esc(c.type)}</b> ${c.validated ? '<span class="tag strava">✔ Validado via Strava</span>' : ''}
          <div class="muted sm">${fmtInt(c.minutes)} min${c.km ? ` · ${fmtNum(c.km, 2)} km` : ''}${c.speed ? ` · ${fmtNum(c.speed)} km/h` : ''}${c.kcal ? ` · ${fmtInt(c.kcal)} kcal` : ''}${c.link ? ` · <a href="${esc(c.link.startsWith('http') ? c.link : 'https://' + c.link)}" target="_blank" rel="noopener">ver no Strava</a>` : ''}</div>
        </div>
        <button class="icon-btn sm" data-delc="${esc(c.id)}" aria-label="Remover">✕</button>
      </div>`).join('') || '<p class="muted sm">Nenhum cardio registrado hoje.</p>'}</div>
    <div class="row mt">
      <button class="btn grow" data-act="indoor">🏠 Cardio indoor</button>
      <button class="btn grow strava-btn" data-act="outdoor">🚴 Cardio de rua</button>
    </div>
  </section>`;

  const save = (fn) => {
    const c = dayCopy(p.id, date);
    if (!c.workout || (c.workout.planId || PLAN_EYSHILLA.id) !== plan.id) c.workout = { ...w, ex: { ...(w.ex || {}) }, coreEx: { ...(w.coreEx || {}) } };
    c.workout.planId = plan.id;
    fn(c.workout, c); saveDay(p.id, date, c);
  };

  el.querySelectorAll('[data-num]').forEach((b) => b.onclick = () => save((x) => { x.num = Number(b.dataset.num); x.ex = {}; }));
  el.querySelectorAll('[data-ex]').forEach((b) => b.onchange = () => save((x) => { x.ex[b.dataset.ex] = b.checked; }));
  el.querySelectorAll('[data-core]').forEach((b) => b.onchange = () => save((x) => { x.coreEx[b.dataset.core] = b.checked; }));
  el.querySelectorAll('input[data-flag]').forEach((b) => b.onchange = () => save((x) => {
    const k = b.dataset.flag; x[k] = b.type === 'checkbox' ? b.checked : (b.value === '' ? null : Number(b.value));
  }));
  el.querySelector('[data-act=toggle-core]')?.addEventListener('click', () => save((x) => { x.coreLoaded = !x.coreLoaded; x.coreEx = {}; }));
  el.querySelector('[data-act=done]').onclick = () => {
    save((x) => { x.num = num; x.done = !x.done; x.doneAt = x.done ? new Date().toISOString() : null; });
    if (!w.done) {
      const miss = [plan.pullup && !w.pullup && 'barra fixa', plan.core && !w.core && 'abdômen'].filter(Boolean);
      toast(miss.length ? `Treino ${num} concluído! Faltou marcar: ${miss.join(' e ')}.` : `💪 Treino ${num} concluído!`);
    }
  };
  el.querySelector('[data-act=plans]').onclick = () => plansModal(p);
  el.querySelectorAll('[data-delc]').forEach((b) => b.onclick = async () => {
    if (!(await confirmBox('Remover este cardio?', 'Remover'))) return;
    const c = dayCopy(p.id, date); c.cardio = (c.cardio || []).filter((x) => x.id !== b.dataset.delc); saveDay(p.id, date, c);
  });
  el.querySelector('[data-act=indoor]').onclick = () => indoorModal(p, date);
  el.querySelector('[data-act=outdoor]').onclick = () => outdoorModal(p, date);
}

// ---------- Biblioteca de fichas ----------
function plansModal(p) {
  const { body, close } = openModal('<div id="pl"></div>', { wide: true });
  const root = body.querySelector('#pl');
  const draw = () => {
    const me = cache.profiles[p.id];
    const plans = allPlans(me);
    root.innerHTML = `
      <h2>📚 Fichas de treino</h2>
      <p class="muted sm">Escolha a ficha que você segue. Você também pode criar a sua, publicar para o grupo ou pedir para a IA montar uma.</p>
      <div class="row mt wrap"><button class="btn grow" id="new">➕ Criar minha ficha</button><button class="btn ghost grow" id="ai">✨ Pedir para a IA</button></div>
      <div class="plan-list mt">${plans.map((pl) => `
        <div class="plan ${pl.id === me.planId ? 'on' : ''}">
          <div class="grow"><b>${esc(pl.name)}</b>
            <div class="muted sm">${pl.days.length} treinos · ${esc(pl.author || '')}${pl.published ? ' · 👥 publicada' : ''}${pl.ownerId === me.id && !pl.published ? ' · 🔒 só minha' : ''}</div>
            <div class="muted sm ellipsis">${pl.days.map((x) => esc(x.name)).join(' · ')}</div></div>
          <div class="col">
            ${pl.id === me.planId ? '<span class="tag green">em uso</span>' : `<button class="btn sm" data-use="${esc(pl.id)}">Usar</button>`}
            ${pl.ownerId === me.id ? `<button class="link sm" data-edit="${esc(pl.id)}">editar</button>` : `<button class="link sm" data-copy="${esc(pl.id)}">copiar</button>`}
          </div>
        </div>`).join('')}</div>`;
    root.querySelectorAll('[data-use]').forEach((b) => b.onclick = async () => { await saveProfile({ ...cache.profiles[p.id], planId: b.dataset.use }); toast('Ficha selecionada ✅'); draw(); });
    root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editPlan(p, structuredClone((me.plans || []).find((x) => x.id === b.dataset.edit)), draw));
    root.querySelectorAll('[data-copy]').forEach((b) => b.onclick = () => {
      const src = plans.find((x) => x.id === b.dataset.copy);
      editPlan(p, { ...structuredClone(src), id: uuid(), name: src.name + ' (minha cópia)', published: false, author: me.name, ownerId: undefined }, draw);
    });
    root.querySelector('#new').onclick = () => editPlan(p, { id: uuid(), name: 'Minha ficha', author: me.name, published: false, pullup: false, core: true, days: [{ name: 'A', ex: [] }, { name: 'B', ex: [] }] }, draw);
    root.querySelector('#ai').onclick = () => aiPlanModal(p, draw);
  };
  draw();
}

function editPlan(p, plan, onDone) {
  const { body, close } = openModal('<div id="ep"></div>', { wide: true });
  const root = body.querySelector('#ep');
  const draw = () => {
    root.innerHTML = `
      <h2>Editar ficha</h2>
      <label class="field"><span>Nome da ficha</span><input id="pname" value="${esc(plan.name)}"></label>
      <label class="check"><input type="checkbox" id="ppull" ${plan.pullup ? 'checked' : ''}> Incluir barra fixa na entrada</label>
      <label class="check"><input type="checkbox" id="pcore" ${plan.core ? 'checked' : ''}> Incluir bloco de abdômen (alterna com/sem carga)</label>
      <p class="muted sm mt">Cada treino: um exercício por linha (ex: "Agachamento livre 4x10").</p>
      ${plan.days.map((d, i) => `
        <div class="plan-day">
          <div class="row"><b>Treino ${i + 1}</b><input class="grow" data-dn="${i}" value="${esc(d.name)}" placeholder="Nome (ex: Pernas)"><button class="icon-btn sm" data-rm="${i}" aria-label="Remover treino">✕</button></div>
          <textarea data-dx="${i}" rows="5">${esc(d.ex.join('\n'))}</textarea>
        </div>`).join('')}
      <button class="btn ghost sm" id="addday">+ Adicionar treino</button>
      <label class="check mt"><input type="checkbox" id="ppub" ${plan.published ? 'checked' : ''}> 👥 Publicar para o grupo (outras pessoas podem usar e copiar)</label>
      <div class="row mt">${(cache.profiles[p.id].plans || []).some((x) => x.id === plan.id) ? '<button class="btn danger ghost" id="del">Excluir</button>' : ''}<button class="btn grow" id="save">Salvar ficha</button></div>`;
    const sync = () => {
      plan.name = root.querySelector('#pname').value.trim() || 'Minha ficha';
      plan.pullup = root.querySelector('#ppull').checked; plan.core = root.querySelector('#pcore').checked; plan.published = root.querySelector('#ppub').checked;
      root.querySelectorAll('[data-dn]').forEach((i) => { plan.days[i.dataset.dn].name = i.value.trim() || `Treino ${Number(i.dataset.dn) + 1}`; });
      root.querySelectorAll('[data-dx]').forEach((t) => { plan.days[t.dataset.dx].ex = t.value.split('\n').map((x) => x.trim()).filter(Boolean); });
    };
    root.querySelector('#addday').onclick = () => { sync(); plan.days.push({ name: String.fromCharCode(65 + plan.days.length), ex: [] }); draw(); };
    root.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { sync(); if (plan.days.length > 1) plan.days.splice(Number(b.dataset.rm), 1); draw(); });
    root.querySelector('#save').onclick = async () => {
      sync();
      if (!plan.days.some((d) => d.ex.length)) return toast('Adicione pelo menos um exercício', 'err');
      const me = cache.profiles[p.id];
      const { ownerId, ...clean } = plan;
      const plans = [...(me.plans || []).filter((x) => x.id !== plan.id), { ...clean, author: me.name }];
      await saveProfile({ ...me, plans, planId: plan.id });
      toast('Ficha salva e selecionada ✅'); close(); onDone?.();
    };
    root.querySelector('#del')?.addEventListener('click', async () => {
      if (!(await confirmBox('Excluir esta ficha?', 'Excluir'))) return;
      const me = cache.profiles[p.id];
      await saveProfile({ ...me, plans: (me.plans || []).filter((x) => x.id !== plan.id), planId: me.planId === plan.id ? PLAN_EYSHILLA.id : me.planId });
      close(); onDone?.();
    });
  };
  draw();
}

function aiPlanModal(p, onDone) {
  const { body, close } = openModal(`
    <h2>✨ Ficha montada pela IA</h2>
    ${aiAvailable() ? '' : '<div class="note warn">A IA ainda não está configurada. Peça para quem administra o app ativar em ⚙️ Ajustes → IA.</div>'}
    <label class="field"><span>Objetivo</span><select id="goal"><option>Emagrecer e definir</option><option>Ganhar massa muscular</option><option>Condicionamento e saúde</option></select></label>
    <div class="grid2">
      <label class="field"><span>Treinos por semana</span><select id="days">${[2, 3, 4, 5, 6].map((n) => `<option ${n === 5 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label class="field"><span>Nível</span><select id="level"><option>Iniciante</option><option selected>Intermediário</option><option>Avançado</option></select></label>
    </div>
    <label class="field"><span>Onde treina</span><select id="place"><option>Academia completa</option><option>Em casa com halteres</option><option>Em casa sem equipamento</option></select></label>
    <label class="field"><span>Foco ou limitações (opcional)</span><input id="notes" placeholder="ex: foco em glúteos, dor no joelho"></label>
    <button class="btn block mt" id="go" ${aiAvailable() ? '' : 'disabled'}>Gerar ficha</button>`);
  body.querySelector('#go').onclick = async (e) => {
    busy(e.target, true, 'Montando a ficha…');
    try {
      const v = (id) => body.querySelector('#' + id).value;
      const plan = await generatePlan({ goal: v('goal'), days: Number(v('days')), level: v('level'), place: v('place'), notes: v('notes') });
      close();
      editPlan(p, { id: uuid(), name: plan.name, author: cache.profiles[p.id].name + ' (IA)', published: false, pullup: false, core: true, days: plan.days.map((d) => ({ name: d.name, ex: d.exercises })) }, onDone);
      toast('Confira a ficha e salve ✅');
    } catch (err) { busy(e.target, false); toast(err.message, 'err'); }
  };
}

function addCardio(p, date, entry) {
  const c = dayCopy(p.id, date);
  (c.cardio ||= []).push({ id: uuid(), at: new Date().toISOString(), ...entry });
  saveDay(p.id, date, c);
}

function indoorModal(p, date) {
  const { body, close } = openModal(`
    <h2>🏠 Cardio indoor</h2>
    <div class="seg" id="types">${INDOOR.map((x, i) => `<button class="${i === 0 ? 'on' : ''}" data-t="${x}">${x}</button>`).join('')}</div>
    <div class="grid2 mt">
      <label class="field"><span>Minutos</span><input id="min" type="number" inputmode="numeric" placeholder="ex: 50"></label>
      <label class="field"><span>Calorias (opcional)</span><input id="kcal" type="number" inputmode="numeric" placeholder="kcal do aparelho"></label>
    </div>
    <label class="field"><span>Distância em km (opcional)</span><input id="km" type="text" inputmode="decimal" step="0.01"></label>
    <button class="btn block mt" id="ok">Salvar cardio</button>`);
  let type = INDOOR[0];
  body.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { type = b.dataset.t; body.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); });
  body.querySelector('#ok').onclick = () => {
    const minutes = Number(body.querySelector('#min').value);
    if (!minutes) return toast('Informe os minutos', 'err');
    addCardio(p, date, { type, indoor: true, minutes, kcal: Number(body.querySelector('#kcal').value) || null, km: Number(body.querySelector('#km').value.replace(',', '.')) || null, source: 'manual' });
    toast('Cardio salvo ✅'); close();
  };
}

function outdoorModal(p, date) {
  const ready = stravaReady();
  const connected = !!p.strava;
  const { body, close } = openModal(`
    <h2>🚴 Cardio de rua</h2>
    <div class="strava-box">
      ${ready ? (connected
        ? `<p class="sm">Conectado ao Strava como <b>${esc(p.strava.athlete || 'atleta')}</b>.</p>
           <button class="btn block strava-btn" id="import">⬇️ Importar atividades de ${fmtDate(date)} do Strava</button>
           <button class="link sm mt" id="disc">Desconectar Strava</button>`
        : `<button class="btn block strava-btn" id="conn">🔗 Conectar / Importar do Strava</button>
           <p class="muted sm mt">Você vai autorizar o app no site oficial do Strava. Depois, tempo em movimento, distância, velocidade média e calorias vêm automaticamente.</p>`)
      : `<p class="muted sm">A conexão automática com o Strava fica disponível depois que o servidor for configurado. Por enquanto, cole o link ou envie o print da atividade.</p>`}
      <div id="found"></div>
    </div>
    <h4 class="mt">Ou registre colando o link / print</h4>
    <div class="seg" id="types">${OUTDOOR.map((x, i) => `<button class="${i === 0 ? 'on' : ''}" data-t="${x}">${x}</button>`).join('')}</div>
    <label class="field mt"><span>Link da atividade no Strava</span><input id="link" placeholder="https://www.strava.com/activities/…"></label>
    <button class="btn ghost block" id="print">🖼️ Enviar print da atividade ${aiAvailable() ? '(a IA lê os dados)' : ''}</button>
    <div class="preview mt" id="pv"></div>
    <div class="grid2 mt">
      <label class="field"><span>Tempo em movimento (min)</span><input id="min" type="number" inputmode="numeric"></label>
      <label class="field"><span>Distância (km)</span><input id="km" type="text" inputmode="decimal" step="0.01"></label>
      <label class="field"><span>Velocidade média (km/h)</span><input id="spd" type="text" inputmode="decimal" step="0.1" placeholder="automático"></label>
      <label class="field"><span>Calorias</span><input id="kcal" type="number" inputmode="numeric"></label>
    </div>
    <button class="btn block mt" id="ok">Salvar atividade</button>`, { wide: true });

  let type = OUTDOOR[0]; let printImg = null;
  body.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { type = b.dataset.t; body.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); });
  body.querySelector('#conn')?.addEventListener('click', () => connect(p.id));
  body.querySelector('#disc')?.addEventListener('click', async () => { await disconnect(p.id); toast('Strava desconectado'); close(); });
  body.querySelector('#import')?.addEventListener('click', async (e) => {
    busy(e.target, true, 'Buscando…');
    try {
      const acts = await fetchDay(p.id, date);
      const existing = new Set((getDay(p.id, date)?.cardio || []).map((c) => String(c.stravaId)));
      const box = body.querySelector('#found');
      if (!acts.length) { box.innerHTML = '<p class="muted sm mt">Nenhuma atividade encontrada nesse dia.</p>'; busy(e.target, false); return; }
      box.innerHTML = acts.map((a, i) => `<div class="cardio-item mt"><div><b>${esc(a.name)}</b><div class="muted sm">${esc(a.type)} · ${fmtInt(a.minutes)} min · ${fmtNum(a.km, 2)} km · ${fmtNum(a.speed)} km/h${a.kcal ? ` · ${fmtInt(a.kcal)} kcal` : ''}</div></div>
        ${existing.has(String(a.id)) ? '<span class="tag green">já importado</span>' : `<button class="btn sm" data-imp="${i}">Importar</button>`}</div>`).join('');
      box.querySelectorAll('[data-imp]').forEach((b) => b.onclick = () => {
        const a = acts[Number(b.dataset.imp)];
        addCardio(p, date, { type: a.typeLabel || a.type, indoor: false, minutes: a.minutes, km: a.km, speed: a.speed, kcal: a.kcal, source: 'strava', stravaId: a.id, validated: true, link: `https://www.strava.com/activities/${a.id}` });
        b.replaceWith(Object.assign(document.createElement('span'), { className: 'tag green', textContent: 'importado ✅' }));
      });
      busy(e.target, false);
    } catch (err) { busy(e.target, false); toast(err.message, 'err'); }
  });
  body.querySelector('#print').onclick = async (e) => {
    const f = await pickImage(); if (!f) return;
    printImg = await compressImage(f, 1200, 0.85);
    body.querySelector('#pv').innerHTML = `<img src="${printImg.dataUrl}" alt="">`;
    if (aiAvailable()) {
      busy(e.target, true, 'Lendo o print…');
      try {
        const r = await readCardioPrint(printImg.base64, 'image/jpeg');
        if (r.minutes) body.querySelector('#min').value = Math.round(r.minutes);
        if (r.km) body.querySelector('#km').value = r.km;
        if (r.speed_kmh) body.querySelector('#spd').value = r.speed_kmh;
        if (r.kcal) body.querySelector('#kcal').value = Math.round(r.kcal);
        const map = { pedal: 0, caminhada: 1, corrida: 2 };
        const ix = map[(r.activity || '').toLowerCase()];
        if (ix != null) body.querySelectorAll('[data-t]')[ix].click();
        toast('Dados lidos do print ✅ Confira antes de salvar.');
      } catch (err) { toast(err.message, 'err'); }
      busy(e.target, false);
    }
  };
  body.querySelector('#ok').onclick = async (e) => {
    const link = body.querySelector('#link').value.trim();
    const minutes = Number(body.querySelector('#min').value);
    const km = Number(body.querySelector('#km').value.replace(',', '.')) || null;
    let speed = Number(body.querySelector('#spd').value.replace(',', '.')) || null;
    if (!speed && km && minutes) speed = Math.round((km / (minutes / 60)) * 10) / 10;
    if (!minutes) return toast('Informe o tempo em movimento', 'err');
    if (link && !STRAVA_LINK_RE.test(link)) return toast('Esse link não parece ser do Strava', 'err');
    busy(e.target, true, 'Salvando…');
    let printId = null;
    try { if (printImg) printId = (await addPhoto({ profileId: p.id, date, kind: 'cardio', visibility: 'group' }, printImg.blob)).id; } catch {}
    addCardio(p, date, { type, indoor: false, minutes, km, speed, kcal: Number(body.querySelector('#kcal').value) || null, source: link ? 'strava-link' : printImg ? 'strava-print' : 'manual', link: link || null, printId, validated: !!(link || printImg) });
    toast('Atividade salva ✅'); close();
  };
}
