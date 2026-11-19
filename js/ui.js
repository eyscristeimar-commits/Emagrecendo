// Utilidades de interface: estado, modal, aviso, imagens.
import { today } from './calc.js';

export const state = {
  me: null,          // id do perfil ativo neste aparelho
  tab: 'hoje',
  date: today(),     // dia exibido em "Hoje"
  viewProfile: null, // perfil exibido em Relatórios/Galeria
  reportView: 'diario',
  reportRange: 14,
  reportWeek: null,
  galleryView: 'diaria',
  groupView: 'hoje',
  unread: 0,
};

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

let rerender = () => {};
export const setRerender = (fn) => { rerender = fn; };
export const refresh = () => rerender();

export function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
}

const modalStack = [];
export function openModal(html, { onMount, wide = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true"><button class="modal-x" aria-label="Fechar">✕</button><div class="modal-body">${html}</div></div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('noscroll');
  const close = () => {
    wrap.classList.remove('show');
    setTimeout(() => wrap.remove(), 200);
    modalStack.splice(modalStack.indexOf(close), 1);
    if (!modalStack.length) document.body.classList.remove('noscroll');
    onClose?.();
  };
  modalStack.push(close);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  wrap.querySelector('.modal-x').onclick = close;
  requestAnimationFrame(() => wrap.classList.add('show'));
  const body = wrap.querySelector('.modal-body');
  onMount?.(body, close);
  return { body, close };
}
export const closeAllModals = () => [...modalStack].forEach((c) => c());

export function confirmBox(msg, okLabel = 'Confirmar') {
  return new Promise((res) => {
    const { body, close } = openModal(`<p class="mb">${esc(msg)}</p><div class="row end"><button class="btn ghost" data-no>Cancelar</button><button class="btn danger" data-ok>${esc(okLabel)}</button></div>`, { onClose: () => res(false) });
    body.querySelector('[data-no]').onclick = () => close();
    body.querySelector('[data-ok]').onclick = () => { res(true); close(); };
  });
}

// Abre a câmera/galeria e devolve o arquivo escolhido.
export function pickImage({ camera = false } = {}) {
  return new Promise((res) => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*';
    if (camera) i.capture = 'environment';
    i.onchange = () => res(i.files?.[0] || null);
    i.click();
  });
}

// Reduz a imagem (economiza espaço e dados) e devolve { blob, base64 }.
export async function compressImage(file, max = 1280, quality = 0.82) {
  const bmp = await loadImage(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
  const dataUrl = c.toDataURL('image/jpeg', quality);
  return { blob, base64: dataUrl.split(',')[1], dataUrl };
}
function loadImage(file) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(img.src); res(img); };
    img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}

export const initials = (n) => (n || '?').trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
export const avatar = (p, size = 34) => `<span class="avatar" style="--c:${esc(p?.color || '#64748b')};width:${size}px;height:${size}px;font-size:${size * 0.4}px">${esc(initials(p?.name))}</span>`;

export function busy(btn, on, label) {
  if (!btn) return;
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span> ${label || 'Aguarde…'}`; }
  else { btn.disabled = false; btn.innerHTML = btn.dataset.label || btn.innerHTML; }
}

// Lê "7h30", "7:30", "7,5" → horas decimais
export function parseHours(s) {
  if (s == null || s === '') return null;
  const t = String(s).trim().toLowerCase().replace(',', '.');
  let m = t.match(/^(\d{1,2})\s*[h:]\s*(\d{1,2})?\s*(m|min)?$/);
  if (m) return Number(m[1]) + (Number(m[2] || 0) / 60);
  m = t.match(/^\d+(\.\d+)?$/);
  return m ? Number(t) : null;
}
export const fmtHours = (h) => (h == null ? '' : `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, '0')}`);
