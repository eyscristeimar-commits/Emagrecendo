// Service worker: funciona offline (cache do app) e mostra notificações push.
const VERSION = 'foco-v1';
const ASSETS = [
  './', 'index.html', 'manifest.json', 'css/app.css',
  'js/app.js', 'js/config.js', 'js/db.js', 'js/presets.js', 'js/calc.js', 'js/ui.js', 'js/charts.js',
  'js/foods.js', 'js/nutrition.js', 'js/notify.js', 'js/strava.js',
  'js/tab-today.js', 'js/tab-train.js', 'js/tab-gallery.js', 'js/tab-reports.js', 'js/tab-group.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/badge-72.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Arquivos do app: rede primeiro (sempre a versão nova), cache se estiver offline.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request).then((r) => {
      const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
  } else if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res;
    })));
  }
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { title: 'Foco Total', body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Foco Total', {
    body: d.body || '', tag: d.tag, icon: 'icons/icon-192.png', badge: 'icons/badge-72.png', data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if (c.url.startsWith(self.registration.scope)) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
