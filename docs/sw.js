// Service worker: guarda o app no aparelho para funcionar sem internet.
const VERSION = 'valle-2ce89b67f8';
const ASSETS = [
  "./",
  "css/app.css",
  "css/fonts.css",
  "fonts/bebas-neue.woff2",
  "fonts/caveat.woff2",
  "fonts/cormorant-garamond.woff2",
  "fonts/josefin-sans.woff2",
  "fonts/montserrat.woff2",
  "fonts/playfair-display-italic.woff2",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/icon.svg",
  "index.html",
  "js/app.js",
  "js/art.js",
  "js/audio.js",
  "js/db.js",
  "js/engine.js",
  "js/exporter.js",
  "js/media.js",
  "js/music-worker.js",
  "js/player.js",
  "manifest.webmanifest",
  "templates/templates.json",
  "vendor/mp4-muxer.mjs"
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Páginas e templates: tenta a rede primeiro (para receber novidades), senão usa o cache.
// Demais arquivos: responde do cache e atualiza em segundo plano.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const fresh = req.mode === 'navigate' || url.pathname.endsWith('templates.json');
  if (fresh) {
    e.respondWith(
      fetch(req)
        .then((res) => { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./')))
    );
    return;
  }
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const net = fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      }).catch(() => cached);
      return cached || net;
    })
  );
});
