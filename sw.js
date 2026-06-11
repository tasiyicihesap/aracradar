// AraçRadar Hub — Service Worker
// Sürümü artırınca eski önbellek otomatik temizlenir.
const SURUM = 'aracradar-hub-v1';

// Kabuk: her zaman önbelleğe alınan çekirdek dosyalar
const KABUK = [
  './',
  './index.html',
  './tools.json',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(SURUM).then(c => c.addAll(KABUK)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks =>
      Promise.all(ks.filter(k => k !== SURUM).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Strateji:
// - tools.json → önce ağ (liste güncel kalsın), düşerse önbellek
// - diğer her şey (araç HTML'leri dahil) → önce önbellek, yoksa ağdan al ve önbelleğe yaz
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.endsWith('tools.json')) {
    e.respondWith(
      fetch(e.request).then(r => {
        const kopya = r.clone();
        caches.open(SURUM).then(c => c.put(e.request, kopya));
        return r;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(onbellek => {
      if (onbellek) return onbellek;
      return fetch(e.request).then(r => {
        if (r.ok) {
          const kopya = r.clone();
          caches.open(SURUM).then(c => c.put(e.request, kopya));
        }
        return r;
      });
    })
  );
});
