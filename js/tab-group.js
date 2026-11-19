import { cache, sendMessage, photoUrl, hasBackend, saveProfile } from './db.js';
import { dayTotals, weekStats, weekIndex, today, fmtTime, fmtDate, fmtNum, fmtInt, latestWeight, forecast } from './calc.js';
import { state, esc, refresh, avatar, toast, pickImage, compressImage, busy, openModal } from './ui.js';
import { hydrate } from './tab-gallery.js';

export function renderGroup(el) {
  const me = cache.profiles[state.me];
  const ps = Object.values(cache.profiles).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  const d = today();
  const muted = me.reminders?.chat?.on === false;

  el.innerHTML = `
  <section class="card">
    <div class="row between"><h3>📡 Placar ao vivo</h3>
      <div class="seg sm"><button data-gv="hoje" class="${state.groupView === 'hoje' ? 'on' : ''}">Hoje</button><button data-gv="semana" class="${state.groupView === 'semana' ? 'on' : ''}">Semana</button></div></div>
    <div class="board">${ps.map((p) => state.groupView === 'hoje' ? rowToday(p, d) : rowWeek(p)).join('')}</div>
    <button class="btn ghost block mt" data-act="share">🔗 Convidar pelo link</button>
  </section>

  <section class="card chat">
    <div class="row between"><h3>💬 Chat do grupo</h3><button class="link sm" data-act="mute">${muted ? '🔕 silenciado' : '🔔 notificações ligadas'}</button></div>
    ${!hasBackend() ? '<div class="note warn sm">O chat fica salvo só neste aparelho até o servidor ser configurado.</div>' : ''}
    <div class="msgs" id="msgs">${msgsHtml()}</div>
    <div class="composer">
      <button class="icon-btn" data-act="photo" aria-label="Enviar foto">📷</button>
      <textarea id="txt" rows="1" placeholder="Mensagem de incentivo, receita, conquista…"></textarea>
      <button class="btn" data-act="send">Enviar</button>
    </div>
    <div class="quick">${['💪 Bora!', '💧 Bebe água!', '🔥 Treino pago!', '🥩 Proteína batida!', '👏 Parabéns!'].map((q) => `<button data-q="${esc(q)}">${q}</button>`).join('')}</div>
  </section>`;

  const box = el.querySelector('#msgs');
  box.scrollTop = box.scrollHeight;
  hydrate(box);
  state.unread = 0;
  document.dispatchEvent(new Event('unread'));

  el.querySelectorAll('[data-gv]').forEach((b) => b.onclick = () => { state.groupView = b.dataset.gv; refresh(); });
  el.querySelectorAll('[data-who]').forEach((b) => b.onclick = () => { state.viewProfile = b.dataset.who; state.tab = 'relatorios'; refresh(); });
  el.querySelector('[data-act=share]').onclick = share;
  el.querySelector('[data-act=mute]').onclick = async () => {
    const r = structuredClone(me.reminders || {}); r.chat = { on: muted };
    await saveProfile({ ...me, reminders: r }); refresh();
  };
  const txt = el.querySelector('#txt');
  txt.oninput = () => { txt.style.height = 'auto'; txt.style.height = Math.min(120, txt.scrollHeight) + 'px'; };
  txt.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
  const send = async (photo) => {
    const text = txt.value.trim();
    if (!text && !photo) return;
    const btn = el.querySelector('[data-act=send]');
    busy(btn, true, '');
    try { await sendMessage(me.id, text, photo?.blob); txt.value = ''; txt.style.height = 'auto'; }
    catch (e) { toast('Não foi possível enviar: ' + e.message, 'err'); }
    busy(btn, false);
  };
  el.querySelector('[data-act=send]').onclick = () => send();
  el.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => { txt.value = b.dataset.q; send(); });
  el.querySelector('[data-act=photo]').onclick = async () => {
    const f = await pickImage(); if (!f) return;
    const img = await compressImage(f, 1100, 0.8);
    const { body, close } = openModal(`<h3>Enviar foto no chat</h3><div class="preview"><img src="${img.dataUrl}" alt=""></div><input id="cap" class="mt" placeholder="Legenda (opcional)"><button class="btn block mt" id="go">Enviar</button>`);
    body.querySelector('#go').onclick = async () => { txt.value = body.querySelector('#cap').value; close(); await send(img); };
  };
  box.querySelectorAll('img[data-path]').forEach((img) => img.onclick = () => openModal(`<div class="viewer"><img src="${img.src}" alt=""></div>`, { wide: true }));
}

export function msgsHtml() {
  let lastDay = '';
  return cache.messages.slice(-150).map((m) => {
    const p = cache.profiles[m.profileId] || { name: '?' };
    const mine = m.profileId === state.me;
    const day = m.createdAt.slice(0, 10);
    const sep = day !== lastDay ? `<div class="day-sep">${day === today() ? 'Hoje' : fmtDate(day, { long: true })}</div>` : '';
    lastDay = day;
    return `${sep}<div class="msg ${mine ? 'mine' : ''}">${mine ? '' : avatar(p, 28)}<div class="bubble">${mine ? '' : `<b style="color:${esc(p.color)}">${esc(p.name.split(' ')[0])}</b>`}${m.photoPath ? `<img data-path="${esc(m.photoPath)}" alt="foto">` : ''}${m.text ? `<p>${esc(m.text)}</p>` : ''}<time>${fmtTime(m.createdAt)}</time></div></div>`;
  }).join('') || '<p class="muted sm center">Nenhuma mensagem ainda. Mande a primeira! 👋</p>';
}

const chk = (ok, label, title) => `<span class="pill ${ok ? 'ok' : ''}" title="${esc(title)}">${label}</span>`;

function rowToday(p, d) {
  const t = dayTotals(p, (cache.days[p.id] || {})[d], d);
  const photosToday = cache.photos.filter((x) => x.profileId === p.id && x.date === d && x.visibility === 'group' && ['front', 'side', 'back', 'scale'].includes(x.kind)).length;
  const f = forecast(p);
  return `<button class="b-row" data-who="${esc(p.id)}">
    ${avatar(p, 36)}
    <div class="grow"><div class="row between"><b>${esc(p.name)}</b><span class="muted sm">${f ? `${fmtNum(f.current)} kg · faltam ${fmtNum(f.remaining)}` : ''}</span></div>
    <div class="pills">
      ${chk(t.weighed, '⚖️ pesou', 'Pesou hoje')}
      ${chk(t.waterHit, `💧 ${fmtNum(t.water / 1000, 1)}/${fmtNum(p.waterGoal / 1000, 0)}L`, 'Água')}
      ${chk(t.proteinHit, `🥩 ${fmtInt(t.protein)}g`, 'Proteína')}
      ${chk(t.workoutDone, '🏋️ treino', 'Treino concluído')}
      ${chk(t.cardioHit, `🏃 ${fmtInt(t.cardioMin)}min`, 'Cardio')}
      ${chk(photosToday > 0, `📸 ${photosToday}`, 'Fotos liberadas hoje')}
    </div></div></button>`;
}

function rowWeek(p) {
  const n = Math.max(1, weekIndex(p, today()));
  const s = weekStats(p, n);
  return `<button class="b-row" data-who="${esc(p.id)}">
    ${avatar(p, 36)}
    <div class="grow"><div class="row between"><b>${esc(p.name)}</b><span class="muted sm">Semana ${n}${s.delta != null ? ` · ${s.delta > 0 ? '+' : ''}${fmtNum(s.delta)} kg` : ''}</span></div>
    <div class="pills">
      ${chk(s.workouts >= 6, `🏋️ ${s.workouts}/6`, 'Treinos')}
      ${chk(s.cardioDays >= s.days && s.days, `🏃 ${s.cardioDays}/${s.days}`, 'Cardio')}
      ${chk(s.red === 0 && s.kcalDays, `🔥 ${s.green}🟢 ${s.yellow}🟡 ${s.red}🔴`, 'Calorias')}
      ${chk(s.protein >= s.days && s.days, `🥩 ${s.protein}/${s.days}`, 'Proteína')}
      ${chk(s.water >= s.days && s.days, `💧 ${s.water}/${s.days}`, 'Água')}
    </div></div></button>`;
}

async function share() {
  const url = location.origin + location.pathname;
  const text = 'Bora juntos na reeducação alimentar! Entra no nosso app, cria seu perfil e acompanha o grupo:';
  try {
    if (navigator.share) await navigator.share({ title: 'Foco Total', text, url });
    else { await navigator.clipboard.writeText(`${text} ${url}`); toast('Link copiado ✅'); }
  } catch {}
}
