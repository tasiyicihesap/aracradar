// ARAÇRADAR Service Worker v3
var CACHE = 'aracradar-v3';

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) {
      return c.addAll(['./','./index.html']).catch(function(){});
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k){ return k!==CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET' || e.request.url.includes('raw.githubusercontent') || e.request.url.includes('api.github.com')) return;
  e.respondWith(
    fetch(e.request).catch(function(){ return caches.match(e.request); })
  );
});

// Bildirim tıklama
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  if (e.action === 'kapat') return;
  var url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(function(cls) {
      for (var i=0; i<cls.length; i++) {
        if (cls[i].url.includes('aracradar') && 'focus' in cls[i]) {
          return cls[i].focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// Bildirim push (gelecek için)
self.addEventListener('push', function(e) {
  if (!e.data) return;
  var d = e.data.json();
  e.waitUntil(
    self.registration.showNotification(d.baslik || 'ARAÇRADAR', {
      body: d.mesaj || '',
      icon: './icon192.svg',
      badge: './icon192.svg',
      tag: 'ar-push-' + Date.now(),
      vibrate: [200,100,200],
      data: { url: d.url || './' }
    })
  );
});
