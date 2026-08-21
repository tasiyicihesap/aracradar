// ARAÇRADAR Service Worker
var CACHE = 'aracradar-v2';

self.addEventListener('install', function(e) {
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(['./','./index.html']); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(e) {
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));
  }).then(function(){ return self.clients.claim(); }));
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET' || e.request.url.includes('raw.githubusercontent')) return;
  e.respondWith(fetch(e.request).catch(function(){ return caches.match(e.request); }));
});

// Bildirim mesajı al
self.addEventListener('message', function(e) {
  if (!e.data || e.data.type !== 'FIYAT_BILDIRIMI') return;
  var d = e.data;
  self.registration.showNotification(d.baslik || 'ARAÇRADAR', {
    body: d.mesaj || '',
    icon: './icon192.svg',
    badge: './icon96.svg',
    tag: d.id || 'ar-' + Date.now(),
    vibrate: [200, 100, 200],
    data: { url: d.url || './' },
    actions: [
      { action: 'ac', title: '🔍 Görüntüle' },
      { action: 'kapat', title: '✕' }
    ]
  });
});

// Bildirime tıklama
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  if (e.action === 'kapat') return;
  var url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    clients.matchAll({type:'window'}).then(function(cls) {
      for (var i=0; i<cls.length; i++) {
        if ('focus' in cls[i]) { cls[i].focus(); return; }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
