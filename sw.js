// ═══════════════════════════════════════════════════════════════════════════
// ARAÇRADAR Service Worker — v1.0
// Görevler: 1) PWA cache  2) Arka plan fiyat kontrolü  3) Push bildirimi
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_NAME   = 'aracradar-v1';
const SUPABASE_URL = 'https://nnwbdmlqelbadavoslxf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tuG1PYIy0m5fOgnjaFpV9A_trDSYIsg';

// Cache'lenecek statik dosyalar
const STATIC_FILES = ['./', './index.html'];

// ── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(STATIC_FILES);
    }).then(function() { return self.skipWaiting(); })
  );
});

// ── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    }).then(function() { return self.clients.claim(); })
  );
});

// ── Fetch — Network first, cache fallback ─────────────────────────────────
self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase.co')) return; // Supabase isteklerini cache'leme
  e.respondWith(
    fetch(e.request).then(function(res) {
      if (res && res.status === 200) {
        var resClone = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(e.request, resClone); });
      }
      return res;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});

// ── Push bildirimi al ─────────────────────────────────────────────────────
self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data.json(); } catch(err) { data = { title: 'ARAÇRADAR', body: e.data ? e.data.text() : 'Fiyat değişimi!' }; }
  e.waitUntil(
    self.registration.showNotification(data.title || 'ARAÇRADAR', {
      body: data.body || 'Fiyat değişimi tespit edildi',
      icon: './icon192.svg',
      badge: './icon96.svg',
      tag: data.tag || 'aracradar',
      data: { url: data.url || './' },
      vibrate: [200, 100, 200],
      requireInteraction: false,
      actions: [
        { action: 'ac',   title: '🔍 Görüntüle' },
        { action: 'kapat', title: '✕ Kapat' }
      ]
    })
  );
});

// ── Bildirime tıklanınca ──────────────────────────────────────────────────
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  if (e.action === 'kapat') return;
  var hedefUrl = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        if ('focus' in clientList[i]) { clientList[i].focus(); return; }
      }
      if (clients.openWindow) return clients.openWindow(hedefUrl);
    })
  );
});

// ── Periyodik arka plan sync (Background Sync API) ────────────────────────
self.addEventListener('periodicsync', function(e) {
  if (e.tag === 'fiyat-kontrol') {
    e.waitUntil(arkaplanFiyatKontrol());
  }
});

// ── Message — sayfadan bildirim tetikleme ─────────────────────────────────
self.addEventListener('message', function(e) {
  if (e.data && e.data.type === 'FIYAT_BILDIRIMI') {
    var d = e.data;
    self.registration.showNotification(d.baslik || 'ARAÇRADAR', {
      body: d.mesaj || '',
      icon: './icon192.svg',
      badge: './icon96.svg',
      tag: 'fiyat-' + (d.id || Date.now()),
      data: { url: './?ilan=' + (d.id || '') },
      vibrate: [200, 100, 200],
      actions: [
        { action: 'ac',    title: '🔍 İlanı Gör' },
        { action: 'kapat', title: '✕' }
      ]
    });
  }
});

// ── Arka plan fiyat kontrolü ──────────────────────────────────────────────
async function arkaplanFiyatKontrol() {
  try {
    var headers = { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY };
    // Son 2 saatte güncellenen ilanları çek
    var since = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    var res = await fetch(SUPABASE_URL + '/rest/v1/ilanlar?guncelleme=gte.' + since + '&order=guncelleme.desc&limit=500', { headers });
    var ilanlar = await res.json();
    if (!ilanlar || !ilanlar.length) return;

    // Takip listesini cache'den al
    var takipCache = await caches.match('aracradar-takip-listesi');
    var takipListesi = [];
    if (takipCache) {
      try { takipListesi = await takipCache.json(); } catch(e) {}
    }

    var bildirilenler = [];
    ilanlar.forEach(function(il) {
      if (!il.gecmis || il.gecmis.length < 2) return;
      var gecmis = Array.isArray(il.gecmis) ? il.gecmis : [];
      if (gecmis.length < 2) return;
      var sonFiyat  = gecmis[gecmis.length - 1].fiyat;
      var oncFiyat  = gecmis[gecmis.length - 2].fiyat;
      if (!sonFiyat || !oncFiyat || sonFiyat === oncFiyat) return;
      var fark = sonFiyat - oncFiyat;
      var yuzde = Math.round(Math.abs(fark) / oncFiyat * 100);
      if (yuzde < 1) return; // %1'den az değişimi yoksay

      var dustu = fark < 0;
      var takipte = takipListesi.indexOf(il.id) !== -1;

      // Bildirim koşulları:
      // 1. Takip listesindeyse → her zaman bildir
      // 2. %5+ düşüş → bildir
      // 3. %10+ artış → bildir
      var bildir = takipte || (dustu && yuzde >= 5) || (!dustu && yuzde >= 10);
      if (!bildir) return;

      bildirilenler.push({
        id: il.id,
        ad: (il.ad || 'Araç').substring(0, 60),
        sonFiyat,
        oncFiyat,
        fark,
        yuzde,
        dustu,
        takipte
      });
    });

    if (!bildirilenler.length) return;

    // Toplu bildirim (max 3 adet, geri kalanı özet)
    var gosterilecek = bildirilenler.slice(0, 3);
    gosterilecek.forEach(function(b) {
      var emoji = b.dustu ? '📉' : '📈';
      var isaret = b.dustu ? '▼' : '▲';
      self.registration.showNotification(
        emoji + ' ARAÇRADAR' + (b.takipte ? ' ⭐' : ''),
        {
          body: b.ad + '\n' + isaret + ' ' + Math.abs(b.fark).toLocaleString('tr-TR') + ' ₺ (%' + b.yuzde + ')\n' +
                b.sonFiyat.toLocaleString('tr-TR') + ' ₺',
          icon: './icon192.svg',
          badge: './icon96.svg',
          tag: 'fiyat-' + b.id,
          data: { url: './?ilan=' + b.id },
          vibrate: b.dustu ? [300, 100, 300, 100, 300] : [200],
          actions: [{ action: 'ac', title: '🔍 Görüntüle' }, { action: 'kapat', title: '✕' }]
        }
      );
    });

    if (bildirilenler.length > 3) {
      self.registration.showNotification('ARAÇRADAR — ' + bildirilenler.length + ' değişim', {
        body: bildirilenler.length - 3 + ' ilan daha değişti. Tümünü görmek için tıklayın.',
        icon: './icon192.svg',
        badge: './icon96.svg',
        tag: 'aracradar-ozet',
        data: { url: './' }
      });
    }
  } catch(err) {
    console.error('SW arka plan kontrol hatası:', err);
  }
}
