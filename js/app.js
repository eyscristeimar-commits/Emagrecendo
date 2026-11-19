import { CONFIG } from './config.js';
import * as db from './db.js';
import { cache } from './db.js';
import { today, fmtNum, fmtInt, bmi, energy, latestWeight } from './calc.js';
import { state, esc, $, openModal, closeAllModals, toast, setRerender, refresh, avatar, busy, confirmBox } from './ui.js';
import { defaultProfile, ACTIVITY, DEFAULT_REMINDERS } from './presets.js';
import { renderToday } from './tab-today.js';
import { renderTrain } from './tab-train.js';
import { renderGallery, hydrate } from './tab-gallery.js';
import { renderReports } from './tab-reports.js';
import { renderGroup, msgsHtml } from './tab-group.js';
import * as notify from './notify.js';
import { handleRedirect } from './strava.js';
import { getPersonalKey, setPersonalKey } from './nutrition.js';

const TABS = [
  ['hoje', '🏠', 'Hoje', renderToday],
  ['treino', '🏋️', 'Treino', renderTrain],
  ['galeria', '📸', 'Galeria', renderGallery],
  ['relatorios', '📊', 'Relatórios', renderReports],
  ['grupo', '💬', 'Grupo', renderGroup],
];
const COLORS = ['#db2777', '#2563eb', '#0ea5a4', '#7c3aed', '#ea580c', '#16a34a', '#ca8a04', '#475569'];

const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

// ---------------- Início ----------------
async function boot() {
  notify.registerSW();
  const app = $('#app');
  try { await db.init(); } catch (e) { app.innerHTML = `<div class="center pad"><h2>Erro ao iniciar</h2><p>${esc(e.message)}</p></div>`; return; }
  setRerender(render);
  db.onChange(onData);
  window.addEventListener('focusout', () => { if (pendingRender) { pendingRender = false; setTimeout(render, 50); } });
  document.addEventListener('unread', updateBadge);
  notify.startLocalScheduler(() => [...cache.owned]);
  if (db.hasBackend() && !db.needsLogin()) {
    const r = await handleRedirect();
    if (r?.ok) toast(`Strava conectado: ${r.athlete} ✅`);
    else if (r?.error) toast(r.error, 'err');
  }
  const tab = new URL(location.href).searchParams.get('tab');
  if (tab && TABS.some((t) => t[0] === tab)) state.tab = tab;
  render();
}

let pendingRender = false;
function onData(ev) {
  if (ev.table === 'error') { toast('Erro ao salvar: ' + (ev.error?.message || ''), 'err'); return; }
  if (ev.table === 'messages' && ev.message && ev.message.profileId !== state.me && !ev.mine) {
    const me = cache.profiles[state.me];
    if (state.tab !== 'grupo' || document.hidden) { state.unread++; updateBadge(); }
    if (document.hidden && me?.reminders?.chat?.on !== false) {
      const from = cache.profiles[ev.message.profileId]?.name?.split(' ')[0] || 'Alguém';
      notify.show(`💬 ${from}`, ev.message.text || '📷 Foto', 'chat', './?tab=grupo');
    }
  }
  if (ev.table === 'messages' && state.tab === 'grupo') {
    const box = $('#msgs');
    if (box) { box.innerHTML = msgsHtml(); hydrate(box); box.scrollTop = box.scrollHeight; return; }
  }
  const a = document.activeElement;
  if (a && $('#main')?.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.type !== 'checkbox' && a.type !== 'radio') { pendingRender = true; return; }
  render();
}

function updateBadge() {
  const b = $('.nav [data-tab=grupo] .badge');
  if (b) { b.textContent = state.unread > 9 ? '9+' : state.unread; b.hidden = !state.unread; }
}

// ---------------- Render ----------------
function render() {
  const app = $('#app');
  if (db.needsLogin()) return renderLogin(app);
  const saved = lsGet('emag:me');
  if (saved && cache.owned.has(saved) && cache.profiles[saved]) state.me = saved;
  else if (!state.me || !cache.owned.has(state.me) || !cache.profiles[state.me]) state.me = [...cache.owned].find((id) => cache.profiles[id]) || null;
  if (!state.me) return renderWho(app);
  if (state.viewProfile && !cache.profiles[state.viewProfile]) state.viewProfile = null;

  const me = cache.profiles[state.me];
  const scrollY = window.scrollY;
  const sameTab = app.dataset.tab === state.tab;
  app.dataset.tab = state.tab;
  app.innerHTML = `
    <header class="top">
      <button class="me" data-act="profile">${avatar(me, 34)}<span><b>${esc(me.name.split(' ')[0])}</b><small>${db.getMode() === 'local' ? 'modo local' : 'online'}</small></span></button>
      <div class="title">${esc(CONFIG.APP_NAME)}</div>
      <div class="row"><button class="icon-btn" data-act="bell" aria-label="Notificações e lembretes">🔔</button><button class="icon-btn" data-act="settings" aria-label="Ajustes">⚙️</button></div>
    </header>
    <main id="main"></main>
    <nav class="nav">${TABS.map(([id, ic, label]) => `<button data-tab="${id}" class="${state.tab === id ? 'on' : ''}"><span class="ic">${ic}</span><span>${label}</span>${id === 'grupo' ? '<i class="badge" hidden></i>' : ''}</button>`).join('')}</nav>`;
  const main = $('#main');
  const fn = TABS.find((t) => t[0] === state.tab)[3];
  try { fn(main); } catch (e) { console.error(e); main.innerHTML = `<div class="card"><b>Ops, algo deu errado nesta tela.</b><p class="muted sm">${esc(e.message)}</p></div>`; }
  if (sameTab) window.scrollTo(0, scrollY);
  updateBadge();

  app.querySelectorAll('.nav [data-tab]').forEach((b) => b.onclick = () => {
    state.tab = b.dataset.tab;
    if (['galeria', 'relatorios'].includes(state.tab) && !state.viewProfile) state.viewProfile = state.me;
    if (state.tab === 'hoje' || state.tab === 'treino') state.date = state.date > today() ? today() : state.date;
    render(); window.scrollTo(0, 0);
  });
  app.querySelector('[data-act=profile]').onclick = () => profileSwitcher();
  app.querySelector('[data-act=bell]').onclick = () => remindersModal(me);
  app.querySelector('[data-act=settings]').onclick = () => settingsModal();
}

// ---------------- Login por e-mail (modo online) ----------------
function renderLogin(app) {
  app.innerHTML = `
    <div class="onb">
      <div class="logo">🥗💪</div>
      <h1>${esc(CONFIG.APP_NAME)}</h1>
      <p class="muted">Reeducação alimentar, treinos e hidratação em grupo.</p>
      <div class="card">
        <div id="step1">
          <label class="field"><span>Seu e-mail</span><input id="email" type="email" inputmode="email" autocomplete="email" placeholder="voce@email.com" value="${esc(lsGet('emag:email') || '')}"></label>
          <button class="btn block" id="send">Receber código de acesso</button>
        </div>
        <div id="step2" hidden>
          <p class="sm">Enviamos um código para <b id="em"></b>. Digite abaixo (confira o spam).</p>
          <input id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="código" class="code">
          <button class="btn block mt" id="verify">Entrar</button>
          <button class="link sm mt" id="back">Usar outro e-mail</button>
        </div>
      </div>
    </div>`;
  const email = () => $('#email').value.trim().toLowerCase();
  $('#send').onclick = async (e) => {
    if (!/^\S+@\S+\.\S+$/.test(email())) return toast('Digite um e-mail válido', 'err');
    busy(e.target, true, 'Enviando…');
    try { await db.loginEmail(email()); lsSet('emag:email', email()); $('#em').textContent = email(); $('#step1').hidden = true; $('#step2').hidden = false; $('#code').focus(); }
    catch (err) { toast(err.message, 'err'); }
    busy(e.target, false);
  };
  $('#verify').onclick = async (e) => {
    busy(e.target, true, 'Entrando…');
    try { await db.verifyCode(lsGet('emag:email') || email(), $('#code').value.trim()); render(); }
    catch (err) { busy(e.target, false); toast('Código inválido ou expirado', 'err'); }
  };
  $('#back').onclick = () => { $('#step1').hidden = false; $('#step2').hidden = true; };
}

// ---------------- Quem é você? ----------------
function renderWho(app) {
  const ps = db.listProfiles();
  app.innerHTML = `
    <div class="onb">
      <div class="logo">🥗💪</div>
      <h1>Bem-vindo(a)!</h1>
      <p class="muted">${db.hasBackend() ? `Entrou como ${esc(db.userEmail())}. ` : ''}Escolha o seu perfil ou crie um novo.</p>
      <div class="card">
        ${ps.length ? ps.map((p) => `<div class="who">${avatar(p, 40)}<div class="grow"><b>${esc(p.name)}</b><div class="muted sm">${p.age ? p.age + ' anos · ' : ''}${p.startWeight ? fmtNum(p.startWeight) + ' kg → ' + fmtNum(p.goalWeight) + ' kg' : ''}</div></div><button class="btn sm" data-claim="${esc(p.id)}">Sou eu</button></div>`).join('') : '<p class="muted">Ninguém cadastrado ainda.</p>'}
        <button class="btn block mt" id="new">➕ Criar meu perfil</button>
        ${db.hasBackend() ? '<button class="link sm mt" id="out">Sair</button>' : ''}
      </div>
    </div>`;
  app.querySelectorAll('[data-claim]').forEach((b) => b.onclick = async () => {
    busy(b, true, '');
    try {
      const ok = await db.claimProfile(b.dataset.claim);
      if (!ok) { toast('Esse perfil já pertence a outro e-mail.', 'err'); busy(b, false); return; }
      lsSet('emag:me', b.dataset.claim); state.me = b.dataset.claim; render();
    } catch (e) { toast(e.message, 'err'); busy(b, false); }
  });
  $('#new').onclick = () => profileForm(null);
  $('#out')?.addEventListener('click', () => db.logout());
}

function profileSwitcher() {
  const mine = [...cache.owned].map((id) => cache.profiles[id]).filter(Boolean);
  const { body, close } = openModal(`
    <h2>Perfis neste aparelho</h2>
    ${mine.map((p) => `<button class="who btn-like ${p.id === state.me ? 'on' : ''}" data-sw="${esc(p.id)}">${avatar(p, 36)}<b class="grow">${esc(p.name)}</b>${p.id === state.me ? '✓' : ''}</button>`).join('')}
    <div class="row mt"><button class="btn ghost grow" id="edit">✏️ Editar meu perfil</button><button class="btn ghost grow" id="add">➕ Outro perfil</button></div>`);
  body.querySelectorAll('[data-sw]').forEach((b) => b.onclick = () => { state.me = b.dataset.sw; lsSet('emag:me', state.me); state.viewProfile = state.me; close(); render(); });
  body.querySelector('#edit').onclick = () => { close(); profileForm(cache.profiles[state.me]); };
  body.querySelector('#add').onclick = () => { close(); state.me = null; lsSet('emag:me', null); renderWho($('#app')); };
}

// ---------------- Formulário de perfil ----------------
function profileForm(existing) {
  const p = existing ? structuredClone(existing) : defaultProfile({ color: COLORS[Object.keys(cache.profiles).length % COLORS.length] });
  const { body, close } = openModal(`
    <h2>${existing ? 'Editar perfil' : 'Criar perfil'}</h2>
    <div class="grid2">
      <label class="field span2"><span>Nome</span><input id="name" value="${esc(p.name)}" placeholder="Seu nome"></label>
      <label class="field"><span>Idade</span><input id="age" type="number" inputmode="numeric" value="${p.age ?? ''}"></label>
      <label class="field"><span>Altura (cm)</span><input id="height" type="number" inputmode="numeric" placeholder="ex: 174" value="${p.height ?? ''}"></label>
      <label class="field"><span>Sexo (para o cálculo)</span><select id="sex"><option value="">–</option><option value="F" ${p.sex === 'F' ? 'selected' : ''}>Feminino</option><option value="M" ${p.sex === 'M' ? 'selected' : ''}>Masculino</option></select></label>
      <label class="field"><span>Data de início</span><input id="startDate" type="date" value="${esc(p.startDate)}"></label>
      <label class="field"><span>Peso inicial (kg)</span><input id="startWeight" type="text" inputmode="decimal" step="0.1" value="${p.startWeight ?? ''}"></label>
      <label class="field"><span>Peso meta final (kg)</span><input id="goalWeight" type="text" inputmode="decimal" step="0.1" value="${p.goalWeight ?? ''}"></label>
      <label class="field span2"><span>Nível de atividade</span><select id="activity">${Object.entries(ACTIVITY).map(([k, v]) => `<option value="${k}" ${p.activity === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
    </div>
    <div class="note mt" id="calc"></div>
    <h4 class="mt">Metas diárias</h4>
    <div class="grid2">
      <label class="field"><span>Meta de calorias (verde)</span><input id="kcalGoal" type="number" inputmode="numeric" value="${p.kcalGoal}"></label>
      <label class="field"><span>Tolerância (amarelo até)</span><input id="kcalTol" type="number" inputmode="numeric" value="${p.kcalTol}"></label>
      <label class="field"><span>Proteína (g)</span><input id="proteinGoal" type="number" inputmode="numeric" value="${p.proteinGoal}"></label>
      <label class="field"><span>Água (mL)</span><input id="waterGoal" type="number" inputmode="numeric" step="250" value="${p.waterGoal}"></label>
    </div>
    <details class="mt"><summary>Avançado: ritmo e meta intermediária</summary>
      <div class="grid2 mt">
        <label class="field"><span>Ritmo projetado (kg/semana)</span><input id="weeklyRate" type="text" inputmode="decimal" step="0.1" value="${p.weeklyRate}"></label>
        <label class="field"><span>Meta intermediária até</span><input id="iDate" type="date" value="${esc(p.interim?.date || '')}"></label>
        <label class="field"><span>Faixa mín. (kg)</span><input id="iMin" type="number" step="0.1" value="${p.interim?.min ?? ''}"></label>
        <label class="field"><span>Faixa máx. (kg)</span><input id="iMax" type="number" step="0.1" value="${p.interim?.max ?? ''}"></label>
      </div>
      <p class="muted sm">${p.refCurve?.length ? `Curva de referência semanal com ${p.refCurve.length} pontos ativa.` : 'Sem curva de referência: a previsão usa o ritmo semanal.'}</p>
    </details>
    <label class="field mt"><span>Cor</span><div class="colors">${COLORS.map((c) => `<button type="button" data-color="${c}" style="background:${c}" class="${p.color === c ? 'on' : ''}" aria-label="cor"></button>`).join('')}</div></label>
    <div class="row mt">${existing && db.isOwner(existing.id) ? '<button class="btn danger ghost" id="del">Excluir</button>' : ''}<button class="btn grow" id="save">${existing ? 'Salvar' : 'Criar perfil'}</button></div>`, { wide: true });

  const v = (id) => body.querySelector('#' + id).value;
  const num = (id) => (v(id) === '' ? null : Number(String(v(id)).replace(',', '.')));
  const read = () => {
    Object.assign(p, {
      name: v('name').trim(), age: num('age'), height: num('height'), sex: v('sex'), activity: v('activity'),
      startDate: v('startDate') || today(), startWeight: num('startWeight'), goalWeight: num('goalWeight'),
      kcalGoal: num('kcalGoal') || 1600, kcalTol: num('kcalTol') || 1800, proteinGoal: num('proteinGoal') || 120, waterGoal: num('waterGoal') || 3000,
      weeklyRate: num('weeklyRate') || 0.8,
      interim: v('iDate') && num('iMin') ? { date: v('iDate'), min: num('iMin'), max: num('iMax') || num('iMin') } : null,
    });
    if (p.height && p.height < 3) p.height = Math.round(p.height * 100); // 1,74 → 174
  };
  const calc = () => {
    read();
    const w = existing ? latestWeight(p)?.w : p.startWeight;
    const b = bmi(p, w); const e = energy(p, w);
    body.querySelector('#calc').innerHTML = !b && !e ? 'Preencha idade, altura, sexo e peso para calcular IMC, gasto calórico e déficit.' : `
      ${b ? `<b>IMC ${fmtNum(b.v)}</b> (${b.cls})` : ''}
      ${e ? `<br>Gasto basal: <b>${fmtInt(e.bmr)} kcal</b> · Gasto total do dia: <b>${fmtInt(e.tdee)} kcal</b>
      <br>Com ${fmtInt(p.kcalGoal)} kcal/dia, o déficit é de <b>${fmtInt(e.deficit)} kcal/dia</b> ≈ <b>${fmtNum(e.kgPerWeek)} kg/semana</b>.
      <br>Sugestão: <b>${fmtInt(e.suggested)} kcal</b>, proteína <b>${e.proteinSuggested} g</b>, água <b>${fmtInt(e.waterSuggested)} mL</b>.
      <button class="link sm" id="apply" type="button">Usar sugestão</button>` : ''}`;
    body.querySelector('#apply')?.addEventListener('click', () => {
      body.querySelector('#kcalGoal').value = e.suggested; body.querySelector('#kcalTol').value = e.suggested + 200;
      body.querySelector('#proteinGoal').value = e.proteinSuggested; body.querySelector('#waterGoal').value = e.waterSuggested;
      body.querySelector('#weeklyRate').value = Math.round(Math.min(1.2, Math.max(0.3, e.kgPerWeek)) * 10) / 10;
      calc();
    });
  };
  body.querySelectorAll('input,select').forEach((i) => i.addEventListener('change', calc));
  body.querySelectorAll('[data-color]').forEach((b) => b.onclick = () => { p.color = b.dataset.color; body.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b)); });
  calc();
  body.querySelector('#save').onclick = async (e) => {
    read();
    if (!p.name) return toast('Digite o nome', 'err');
    if (!p.startWeight || !p.goalWeight) return toast('Preencha o peso inicial e a meta', 'err');
    busy(e.target, true, 'Salvando…');
    try {
      if (existing) await db.saveProfile(p);
      else { const np = await db.createProfile(p); state.me = np.id; lsSet('emag:me', np.id); }
      toast('Perfil salvo ✅'); close(); render();
    } catch (err) { busy(e.target, false); toast(err.message, 'err'); }
  };
  body.querySelector('#del')?.addEventListener('click', async () => {
    if (!(await confirmBox(`Excluir o perfil de ${p.name} e todos os registros? Não dá para desfazer.`, 'Excluir tudo'))) return;
    await db.deleteProfile(p.id); state.me = null; lsSet('emag:me', null); close(); render();
  });
}

// ---------------- Notificações & Lembretes ----------------
function remindersModal(me) {
  const r = structuredClone({ ...DEFAULT_REMINDERS, ...(me.reminders || {}) });
  const perm = notify.permission();
  const ios = notify.isIOS(); const standalone = notify.isStandalone();
  const ROWS = [
    ['weigh', '⚖️ Pesagem em jejum', 'Só avisa se o peso do dia ainda não foi registrado.'],
    ['water', '💧 Hidratação', 'Para sozinho quando você bate a meta do dia.'],
    ['meals', '🍽️ Refeições & scanner', 'Lembra de fotografar ou anotar a refeição.'],
    ['workout', '🏋️ Treino & cardio', 'Mostra qual treino da fila é o de hoje.'],
    ['night', '🌙 Check-up noturno', 'Sono, banheiro e proteína.'],
    ['photo', '📸 Foto semanal', 'Frente, perfil e costas.'],
    ['chat', '💬 Chat do grupo', 'Aviso de nova mensagem.'],
  ];
  const { body, close } = openModal(`
    <h2>🔔 Notificações & Lembretes</h2>
    <button class="btn block ${perm === 'granted' ? 'ok' : ''}" id="enable">${perm === 'granted' ? '✅ Notificações ativadas (toque para testar)' : '📲 Ativar Notificações no Celular'}</button>
    <details class="guide mt" ${standalone ? '' : 'open'}><summary>Como instalar o app na tela de início</summary>
      <div class="grid2 mt">
        <div><b>iPhone (Safari)</b><ol><li>Toque em <b>Compartilhar</b> (quadrado com seta ↑)</li><li><b>Adicionar à Tela de Início</b></li><li>Abra o app pelo ícone novo e ative as notificações aqui</li></ol><p class="muted sm">No iPhone as notificações só funcionam com o app instalado (iOS 16.4 ou mais novo).</p></div>
        <div><b>Android (Chrome)</b><ol><li>Toque no menu <b>⋮</b></li><li><b>Instalar app</b> ou <b>Adicionar à tela inicial</b></li><li>Confirme e abra pelo ícone</li></ol></div>
      </div>
    </details>
    ${!db.hasBackend() || !CONFIG.VAPID_PUBLIC_KEY ? '<p class="muted sm mt">Por enquanto os lembretes tocam com o app aberto ou em segundo plano. Com o servidor configurado, eles chegam mesmo com o app fechado.</p>' : ''}
    <div class="rem-list mt">${ROWS.map(([k, label, hint]) => `
      <div class="rem">
        <div class="row between"><div><b>${label}</b><div class="muted sm">${hint}</div></div>
          <label class="switch"><input type="checkbox" data-on="${k}" ${r[k]?.on !== false ? 'checked' : ''}><span></span></label></div>
        ${k === 'water' ? `<div class="row wrap mt sm">de <input type="time" data-wf value="${r.water.from}"> até <input type="time" data-wt value="${r.water.to}"> a cada <select data-we>${[1, 1.5, 2, 3].map((x) => `<option value="${x}" ${Number(r.water.every) === x ? 'selected' : ''}>${String(x).replace('.', ',')}h</option>`).join('')}</select></div>`
        : k === 'chat' ? '' : `<div class="times mt" data-times="${k}">${(r[k].times || []).map((t, i) => `<span class="time"><input type="time" value="${t}" data-t="${i}"><button data-rmt="${i}" aria-label="remover">✕</button></span>`).join('')}<button class="link sm" data-addt>+ horário</button></div>`}
        ${k === 'photo' ? `<div class="row mt sm">Dias: ${['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, i) => `<label class="check inline"><input type="checkbox" data-pd="${i}" ${(r.photo.days || []).includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div>` : ''}
      </div>`).join('')}</div>
    <button class="btn block mt" id="save">Salvar lembretes</button>`, { wide: true });

  body.querySelector('#enable').onclick = async (e) => {
    if (notify.permission() === 'granted') { notify.show('🔔 Teste', 'As notificações estão funcionando!', 'test'); return; }
    busy(e.target, true, 'Ativando…');
    try {
      const res = await notify.enable(me.id);
      if (res.push) await db.saveProfile({ ...cache.profiles[me.id], serverPush: true });
      toast('Notificações ativadas ✅'); close(); remindersModal(cache.profiles[me.id]);
    } catch (err) { busy(e.target, false); toast(err.message, 'err'); }
  };
  body.querySelectorAll('[data-times]').forEach((box) => {
    box.querySelector('[data-addt]').onclick = () => { const k = box.dataset.times; r[k].times = [...readTimes(box), '12:00']; redrawTimes(box, r[k].times); };
    box.querySelectorAll('[data-rmt]').forEach((b) => b.onclick = () => { const t = readTimes(box); t.splice(Number(b.dataset.rmt), 1); r[box.dataset.times].times = t; redrawTimes(box, t); });
  });
  const readTimes = (box) => [...box.querySelectorAll('[data-t]')].map((i) => i.value).filter(Boolean);
  const redrawTimes = (box, times) => {
    box.innerHTML = times.map((t, i) => `<span class="time"><input type="time" value="${t}" data-t="${i}"><button data-rmt="${i}" aria-label="remover">✕</button></span>`).join('') + '<button class="link sm" data-addt>+ horário</button>';
    box.querySelector('[data-addt]').onclick = () => { r[box.dataset.times].times = [...readTimes(box), '12:00']; redrawTimes(box, r[box.dataset.times].times); };
    box.querySelectorAll('[data-rmt]').forEach((b) => b.onclick = () => { const tt = readTimes(box); tt.splice(Number(b.dataset.rmt), 1); r[box.dataset.times].times = tt; redrawTimes(box, tt); });
  };
  body.querySelector('#save').onclick = async () => {
    body.querySelectorAll('[data-on]').forEach((c) => { r[c.dataset.on] = { ...r[c.dataset.on], on: c.checked }; });
    body.querySelectorAll('[data-times]').forEach((box) => { r[box.dataset.times].times = readTimes(box).sort(); });
    r.water = { ...r.water, from: body.querySelector('[data-wf]').value, to: body.querySelector('[data-wt]').value, every: Number(body.querySelector('[data-we]').value) };
    r.photo.days = [...body.querySelectorAll('[data-pd]')].filter((c) => c.checked).map((c) => Number(c.dataset.pd));
    await db.saveProfile({ ...cache.profiles[me.id], reminders: r, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    toast('Lembretes salvos ✅'); close();
  };
}

// ---------------- Ajustes ----------------
function settingsModal() {
  const me = cache.profiles[state.me];
  const local = db.getMode() === 'local';
  const { body, close } = openModal(`
    <h2>⚙️ Ajustes</h2>
    <button class="btn ghost block" id="edit">✏️ Editar meu perfil e metas</button>
    <h4 class="mt">Conexão</h4>
    <p class="sm">${local ? '📱 <b>Modo local:</b> os dados ficam só neste aparelho. Quando o servidor for configurado, todos do link passam a ver o grupo em tempo real.' : `☁️ <b>Online</b> como ${esc(db.userEmail())}. Dados sincronizados em tempo real.`}</p>
    <h4 class="mt">IA (foto do prato, prints e fichas)</h4>
    ${db.hasBackend() ? '<p class="sm">A IA roda no servidor do app. Nada para configurar aqui.</p>' : `
      <p class="muted sm">Sem servidor, você pode colar uma chave da API da Anthropic. Ela fica salva só neste aparelho e nunca vai no link.</p>
      <div class="row"><input id="key" type="password" class="grow" placeholder="sk-ant-…" value="${esc(getPersonalKey())}"><button class="btn" id="savekey">Salvar</button></div>`}
    ${local ? `<h4 class="mt">Backup</h4><div class="row"><button class="btn ghost grow" id="exp">⬇️ Exportar dados</button><button class="btn ghost grow" id="imp">⬆️ Importar</button></div>` : ''}
    <div class="row mt">${!local ? '<button class="btn ghost danger grow" id="out">Sair</button>' : ''}</div>
    <p class="muted sm mt center">${esc(CONFIG.APP_NAME)} · alimentação, hidratação, treinos e hábitos naturais.</p>`);
  body.querySelector('#edit').onclick = () => { close(); profileForm(me); };
  body.querySelector('#savekey')?.addEventListener('click', () => { setPersonalKey(body.querySelector('#key').value.trim()); toast('Chave salva neste aparelho ✅'); close(); render(); });
  body.querySelector('#out')?.addEventListener('click', () => db.logout());
  body.querySelector('#exp')?.addEventListener('click', () => {
    const blob = new Blob([db.exportAll()], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `backup-foco-total-${today()}.json` });
    a.click();
  });
  body.querySelector('#imp')?.addEventListener('click', () => {
    const i = Object.assign(document.createElement('input'), { type: 'file', accept: 'application/json' });
    i.onchange = async () => { try { await db.importAll(await i.files[0].text()); toast('Backup importado ✅'); close(); render(); } catch (e) { toast(e.message, 'err'); } };
    i.click();
  });
}

boot();
