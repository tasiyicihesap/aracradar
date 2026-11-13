
// ── Anti-bot: Human-like random delays ──────────────────────────────────────
function humanBekle(ms, cb) {
  // Random jitter: ±%30
  var jitter = ms * 0.3;
  var gercekMs = ms + (Math.random() * jitter * 2 - jitter);
  // Ara sıra ekstra bekleme (gerçek insanlar gibi)
  if (Math.random() < 0.08) gercekMs += Math.random() * 20000 + 10000;
  setTimeout(cb, Math.max(1000, gercekMs));
}

function randomUA() {
  var uaList = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  ];
  return uaList[Math.floor(Math.random() * uaList.length)];
}

// Bot tespiti sayfası mı kontrol et
function botYakalandimMi(html) {
  var lower = (html||'').toLowerCase();
  return lower.indexOf('captcha') !== -1 ||
         lower.indexOf('robot') !== -1 ||
         lower.indexOf('bot detection') !== -1 ||
         lower.indexOf('access denied') !== -1 ||
         lower.indexOf('too many requests') !== -1 ||
         lower.indexOf('engellendi') !== -1 ||
         lower.indexOf('doğrulama') !== -1;
}



// ── Tarama Durumu — Supabase'e Yaz ──────────────────────────────────────────
var _sonDurumYazmasi = 0;
function taramaDurumYaz(durum) {
  // Çok sık yazma (min 30 saniye aralık)
  var simdi = Date.now();
  // Panel polling yapıyor, rate limit gerekmiyor
  _sonDurumYazmasi = simdi;

  // Aktif site bilgilerini topla
  var siteler = [];
  if (tarama.siteSayac) {
    Object.keys(tarama.siteSayac).forEach(function(site) {
      var s = tarama.siteSayac[site];
      if (s) siteler.push({
        site: site,
        sayfa: s.sayfa || 0,
        toplamSayfa: s.toplamSayfa || 0,
        eklenen: s.eklenen || 0,
        guncellenen: s.guncellenen || 0,
        bitti: s.bitti || false,
        url: s.url || ''
      });
    });
  }

  var veri = {
    id: 'tarama_durum',
    durum: durum,
    aktif: tarama.aktif || false,
    toplam_eklenen: tarama.eklenen || 0,
    toplam_guncellenen: tarama.guncellenen || 0,
    siteler: JSON.stringify(siteler),
    baslangic: tarama._baslangic || simdi,
    guncelleme: simdi,
    aralik_ms: tarama.aralik || 0
  };
  // db_toplam: panel ayrıca dbSayisiAl ile alıyor

  // Panel polling ile durumu kendi alıyor

  // Anlık GitHub sync — her 60sn bir (çok sık olmasın)
  clearTimeout(self._durumSyncTimer);
  self._durumSyncTimer = setTimeout(function(){
    if (durum === 'devam' || durum === 'basladi') return; // Tarama devam ediyorsa yükleme
    tamSync(function(){ console.log('[ARAÇRADAR] GitHub anlık sync tamamlandı'); });
  }, 60000);
}

// ── Supabase Sync ─────────────────────────────────────────────────────────────
var SUPABASE_URL = 'https://nnwbdmlqelbadavoslxf.supabase.co';
var SUPABASE_KEY = 'sb_publishable_tuG1PYIy0m5fOgnjaFpV9A_trDSYIsg';
var SYNC_ZAMANLAYICI = null;

var _sonSyncZamani = 0;

// ── TAM SYNC — Tüm IndexedDB ilanlarını Supabase'e gönder ────────────────────
var _tamSyncCalisiyor = false;
// GitHub yazma için token — panel Ayarlar sekmesinden kaydedilir
var GH_TOKEN = '';
chrome.storage.local.get(['gh_token'], function(r){ if(r.gh_token) GH_TOKEN = r.gh_token; });
var GH_REPO  = 'tasiyicihesap/aracradar';
var GH_API   = 'https://api.github.com';

// ── GitHub'dan veri çek ve DB'ye yaz ────────────────────────────────────────
function ghdenYukle(cb) {
  console.log('[ARAÇRADAR] GitHub\'dan veri çekiliyor...');
  fetch('https://raw.githubusercontent.com/' + GH_REPO + '/main/data/meta.json?t=' + Date.now())
    .then(function(r){ return r.json(); })
    .then(function(meta) {
      var parcalar = meta.parcalar || [];
      if (!parcalar.length) { if(cb) cb(0); return; }
      var tumIlanlar = [];
      var tamamlanan = 0;
      parcalar.forEach(function(yol) {
        var fname = yol.split('/').pop();
        fetch('https://raw.githubusercontent.com/' + GH_REPO + '/main/data/' + fname + '?t=' + Date.now())
          .then(function(r){ return r.json(); })
          .then(function(parca) {
            tumIlanlar = tumIlanlar.concat(parca);
            tamamlanan++;
            if (tamamlanan === parcalar.length) {
              // DB'ye yaz
              dbEkle(tumIlanlar, '', function(r) {
                console.log('[ARAÇRADAR] GitHub\'dan yüklendi:', r.yeni, 'yeni');
                if(cb) cb(r.yeni);
              });
            }
          })
          .catch(function() {
            tamamlanan++;
            if (tamamlanan === parcalar.length && cb) cb(0);
          });
      });
    })
    .catch(function(e) {
      console.warn('[ARAÇRADAR] GitHub\'dan çekme hatası:', e.message);
      if(cb) cb(0);
    });
}

// firebaseCek → ghdenYukle alias (eski kod uyumluluğu)
function firebaseCek(cb) { ghdenYukle(cb); }

// ── GitHub'a ayarları otomatik yükle ─────────────────────────────────────

function ghAyarCek() {
  fetch('https://raw.githubusercontent.com/' + GH_REPO + '/main/data/ayarlar.json?t=' + Date.now())
    .then(function(r) { if(!r.ok) throw new Error('404'); return r.json(); })
    .then(function(ayarlar) {
      var set = {};
      if (ayarlar.sb_ayarlar) set[AYAR_KEY] = ayarlar.sb_ayarlar;
      if (ayarlar.ot_ayarlar) set[OTARAMA_KEY] = ayarlar.ot_ayarlar;
      if (Object.keys(set).length) {
        chrome.storage.local.set(set, function() {
          console.log('[ARAÇRADAR] Ayarlar GitHub\'dan yüklendi');
          alarmKur(); // Otomatik tarama ayarlarını uygula
        });
      }
    })
    .catch(function() {
      // Dosya yoksa sessizce geç
    });
}

var _ghAyarTimer = null;
function ghAyarYukle() {
  clearTimeout(_ghAyarTimer);
  _ghAyarTimer = setTimeout(function() {
    // Tüm ayarları topla
    chrome.storage.local.get(null, function(items) {
      var ayarlar = {
        versiyon: 1,
        tarih: Date.now(),
        sb_ayarlar: items['sb_ayarlar'] || null,
        ot_ayarlar: items[OTARAMA_KEY] || null,
      };
      var icerik = JSON.stringify(ayarlar, null, 2);
      // GitHub'a yükle
      ghGetSha('data/ayarlar.json', function(sha) {
        ghPut('data/ayarlar.json', icerik, 'AraçRadar ayarlar güncellendi', sha, function(ok) {
          if (ok) console.log('[ARAÇRADAR] Ayarlar GitHub\'a yüklendi');
          else console.warn('[ARAÇRADAR] Ayarlar yüklenemedi');
        });
      });
    });
  }, 3000); // 3sn debounce
}



function ghGetSha(path, cb) {
  fetch(GH_API+'/repos/'+GH_REPO+'/contents/'+path, {
    headers: {'Authorization':'token '+GH_TOKEN}
  }).then(function(r){ return r.json(); })
  .then(function(d){ cb(d.sha||null); })
  .catch(function(){ cb(null); });
}

function ghPut(path, contentStr, message, sha, cb) {
  var body = {
    message: message,
    content: btoa(unescape(encodeURIComponent(contentStr))),
    branch: 'main'
  };
  if (sha) body.sha = sha;
  fetch(GH_API+'/repos/'+GH_REPO+'/contents/'+path, {
    method: 'PUT',
    headers: {'Authorization':'token '+GH_TOKEN, 'Content-Type':'application/json'},
    body: JSON.stringify(body)
  }).then(function(r){ cb(r.ok || r.status===201); })
  .catch(function(){ cb(false); });
}


// ── Fiyatı sıfır ve çok eski ilanları temizle ────────────────────────────────
function dbTemizle(cb) {
  var ESIK_GUN = 60; // 60 günden eski ilanları sil
  var ESIK_TS  = Date.now() - (ESIK_GUN * 24 * 60 * 60 * 1000);
  dbOku(function(veri) {
    if (!veri || !veri.length) { if(cb) cb(0); return; }
    var onceki = veri.length;
    var temiz = veri.filter(function(il) {
      // Fiyatı sıfır olan
      var fiyat = il.fiyat || 0;
      if (!fiyat && il.gecmis && il.gecmis.length) {
        fiyat = parseInt(il.gecmis[il.gecmis.length-1].fiyat) || 0;
      }
      if (!fiyat) return false;
      // Çok eski olan
      if (il.guncelleme) {
        var ts = new Date(il.guncelleme).getTime();
        if (ts < ESIK_TS) return false;
      }
      return true;
    });
    var silinen = onceki - temiz.length;
    if (silinen === 0) { if(cb) cb(0); return; }
    // Temiz listeyi kaydet
    var tx = _db.transaction(['ilanlar'], 'readwrite');
    tx.objectStore('ilanlar').clear();
    var yazma = 0;
    temiz.forEach(function(il) {
      tx.objectStore('ilanlar').put(il);
      yazma++;
    });
    tx.oncomplete = function() {
      console.log('[ARAÇRADAR] Temizlik: ' + silinen + ' ilan silindi');
      if(cb) cb(silinen);
    };
  });
}

function tamSync(cb) {
  if (_tamSyncCalisiyor) { if(cb) cb(); return; }
  _tamSyncCalisiyor = true;
  console.log('[ARAÇRADAR] GitHub sync başladı...');

  dbOku(function(veri) {
    if (!veri || !veri.length) { _tamSyncCalisiyor=false; if(cb) cb(); return; }

    var ilanlar = veri.map(function(il) {
      var gecmis = (il.gecmis||[]).slice(-5);
      var temiz = [];
      gecmis.forEach(function(g) {
        if (!temiz.length || temiz[temiz.length-1].fiyat !== g.fiyat) temiz.push(g);
      });
      var sonFiyat = temiz.length ? (parseInt(temiz[temiz.length-1].fiyat)||0) : 0;
      return {
        id:il.id, ad:(il.ad||'').substring(0,120), url:il.url||'',
        marka:il.marka||'', seri:il.seri||'', model:il.model||'',
        yil:il.yil||0, km:il.km||'', yakit:il.yakit||'', vites:il.vites||'',
        sehir:il.sehir||'', etiket:il.etiket||'', kaynak:il.kaynak||'',
        kasa:il.kasa||'', fiyat:sonFiyat, gecmis:temiz,
        guncelleme:new Date().toISOString()
      };
    });

    // 5000'erlik parçalara böl
    var PARCA = 5000;
    var parcalar = [];
    for (var i=0; i<ilanlar.length; i+=PARCA) parcalar.push(ilanlar.slice(i,i+PARCA));

    var meta = {
      toplam: ilanlar.length,
      guncelleme: Date.now(),
      versiyon: 3,
      parca_sayisi: parcalar.length,
      parcalar: parcalar.map(function(_,i){ return 'data/ilanlar_'+i+'.json'; })
    };

    var tamamlanan = 0;
    var hata = 0;

    function parcaYukle(idx) {
      if (idx >= parcalar.length) {
        // Meta güncelle
        ghGetSha('data/meta.json', function(sha) {
          ghPut('data/meta.json', JSON.stringify(meta), 'AraçRadar meta güncellendi', sha, function(ok) {
            _tamSyncCalisiyor = false;
            console.log('[ARAÇRADAR] GitHub sync tamamlandı: '+ilanlar.length+' ilan, '+hata+' hata');
            if(cb) cb();
          });
        });
        return;
      }
      var path = 'data/ilanlar_'+idx+'.json';
      var icerik = JSON.stringify(parcalar[idx]);
      ghGetSha(path, function(sha) {
        ghPut(path, icerik, 'AraçRadar veri parça '+idx, sha, function(ok) {
          if(ok) tamamlanan++; else hata++;
          setTimeout(function(){ parcaYukle(idx+1); }, 500);
        });
      });
    }
    parcaYukle(0);
  });
}

function firebaseSync(il, cb) {
  // GitHub modunda bu fonksiyon devre dışı — tamSync kullanılıyor
  if(cb) cb();
}

function firebaseCek(cb) {
  // GitHub'dan tüm ilanları çek ve IndexedDB'ye kaydet
  var GH_RAW = 'https://raw.githubusercontent.com/tasiyicihesap/aracradar/main';
  
  fetch(GH_RAW + '/data/meta.json?t=' + Date.now())
    .then(function(r) { return r.json(); })
    .then(function(meta) {
      var parcalar = meta.parcalar || [];
      var tumIlanlar = [];
      var tamamlanan = 0;

      if (!parcalar.length) { if(cb) cb([]); return; }

      parcalar.forEach(function(parcaYol) {
        var dosyaAdi = parcaYol.replace('data/', '');
        fetch(GH_RAW + '/data/' + dosyaAdi + '?t=' + Date.now())
          .then(function(r) { return r.json(); })
          .then(function(parca) {
            tumIlanlar = tumIlanlar.concat(parca);
            tamamlanan++;
            if (tamamlanan === parcalar.length) {
              // IndexedDB'ye kaydet
              dbYaz(tumIlanlar, function() {
                var toplam = tumIlanlar.length;
                console.log('[ARAÇRADAR] GitHub\'dan ' + toplam + ' ilan alındı');
                if (cb) cb({ok: true, yeni: toplam, toplam: toplam});
              });
            }
          })
          .catch(function(e) {
            tamamlanan++;
            console.warn('[ARAÇRADAR] Parça yüklenemedi:', parcaYol, e.message);
            if (tamamlanan === parcalar.length) {
              dbYaz(tumIlanlar, function() {
                if (cb) cb({ok: true, yeni: tumIlanlar.length, toplam: tumIlanlar.length});
              });
            }
          });
      });
    })
    .catch(function(e) {
      console.error('[ARAÇRADAR] GitHub meta yüklenemedi:', e.message);
      if (cb) cb({ok: false, yeni: 0});
    });
}

// Chrome/Edge cross-browser uyumluluk
if (typeof globalThis.chrome === 'undefined' && typeof browser !== 'undefined') {
  globalThis.chrome = browser;
}

// ── ARAÇRADAR Background ──────────────────────────────────────────────────────
var AYAR_KEY='sb_ayarlar', BLD_KEY='sb_bildirimler', OTARAMA_KEY='sb_otarama';

// ── IndexedDB ─────────────────────────────────────────────────────────────────
var _db=null;
function dbAc(cb){
  if(_db){cb(_db);return;}
  var req=indexedDB.open('aracradar_db',1);
  req.onupgradeneeded=function(e){var db=e.target.result;if(!db.objectStoreNames.contains('ilanlar'))db.createObjectStore('ilanlar',{keyPath:'url'});};
  req.onsuccess=function(e){_db=e.target.result;cb(_db);};
  req.onerror=function(){cb(null);};
}
function dbOku(cb){
  dbAc(function(db){
    if(!db){cb([]);return;}
    var req=db.transaction('ilanlar','readonly').objectStore('ilanlar').getAll();
    req.onsuccess=function(e){cb(e.target.result||[]);};
    req.onerror=function(){cb([]);};
  });
}
function dbYaz(ilanlar,cb){
  dbAc(function(db){
    if(!db){if(cb)cb();return;}
    var tx=db.transaction('ilanlar','readwrite');
    var st=tx.objectStore('ilanlar');
    st.clear();
    ilanlar.forEach(function(il){if(il.url)st.put(il);});
    tx.oncomplete=function(){if(cb)cb();};
    tx.onerror=function(){if(cb)cb();};
  });
}
function dbEkle(ilanlar,etiket,cb){
  if(!ilanlar||!ilanlar.length){if(cb)cb({yeni:0,guncellenen:0});return;}
  dbAc(function(db){
    if(!db){if(cb)cb({yeni:0,guncellenen:0});return;}
    var tx=db.transaction('ilanlar','readwrite');
    var st=tx.objectStore('ilanlar');
    var yeni=0,guncellenen=0,dusanlar=[],kalan=ilanlar.length;
    ilanlar.forEach(function(ilan){
      if(!ilan.url){kalan--;if(!kalan&&cb)cb({yeni:yeni,guncellenen:guncellenen});return;}
      // Geçersiz URL'leri engelle
      if(ilan.url.includes('redirectedItem=true') ||
         ilan.url.includes('_c157') ||
         ilan.url.includes('help.letgo') ||
         ilan.url.includes('/hc/tr/') ||
         ilan.url.includes('/hc/en/') ||
         ilan.url.includes('letgo.com/hc') ||
         ilan.url.includes('letgo.com/sohbet') ||
         ilan.url.includes('letgo.com/profil') ||
         ilan.url.includes('letgo.com/kampanya') ||
         !ilan.fiyat || ilan.fiyat < 1000) {
        kalan--;if(!kalan&&cb)cb({yeni:yeni,guncellenen:guncellenen});return;
      }
      var g=st.get(ilan.url);
      g.onsuccess=function(e){
        var m=e.target.result;
        if(m){
          var son=m.gecmis[m.gecmis.length-1].fiyat;
          if(son!==ilan.fiyat){
            m.gecmis.push({fiyat:ilan.fiyat,tarih:Date.now()});
            if(m.gecmis.length>5)m.gecmis=m.gecmis.slice(-5);
            if(ilan.fiyat<son){
              console.log('[ARAÇRADAR] Fiyat dustu:', (m.ad||'?').substring(0,30), son, '->', ilan.fiyat);
              dusanlar.push({ad:m.ad,url:m.url,eskiFiyat:son,yeniFiyat:ilan.fiyat,kaynak:m.kaynak||'sahibinden'});
            }
            guncellenen++;
          }
          if(etiket&&!m.etiket)m.etiket=etiket;
          st.put(m);
        }else{
          st.put({id:Date.now()+'_'+Math.random().toString(36).substr(2,6),url:ilan.url,ad:(ilan.ad||'').substring(0,120),marka:ilan.marka||'',seri:ilan.seri||'',model:ilan.model||'',yil:ilan.yil||0,km:String(ilan.km||'').substring(0,20),etiket:(etiket||ilan.etiket||'').substring(0,50),kaynak:ilan.kaynak||'sahibinden',gecmis:[{fiyat:ilan.fiyat,tarih:Date.now()}],ilkEkleme:Date.now()});
          yeni++;
        }
        kalan--;
        if(kalan===0){
          tx.oncomplete=function(){
            bildirimGoster(dusanlar);
            tarama.eklenen+=yeni;tarama.guncellenen+=guncellenen;
            taramaDurumYaz('devam');
            // siteKey: siteSayac içinde .site alanı eşleşen ilk key'i bul
            var _kaynak=(ilanlar[0]&&ilanlar[0].kaynak)||'sahibinden';
            var sk=null;
            Object.keys(tarama.siteSayac||{}).forEach(function(k){
              if((tarama.siteSayac[k].site||k)=== _kaynak && !tarama.siteSayac[k].bitti) sk=k;
            });
            if(!sk) sk=_kaynak; // fallback
            if(tarama.siteSayac&&tarama.siteSayac[sk]){
              tarama.siteSayac[sk].eklenen=(tarama.siteSayac[sk].eklenen||0)+yeni;
              tarama.siteSayac[sk].guncellenen=(tarama.siteSayac[sk].guncellenen||0)+guncellenen;
            }
            console.log('[ARAÇRADAR] DB:',sk,'+'+yeni,'yeni, toplam:',tarama.eklenen);
            if(cb)cb({yeni:yeni,guncellenen:guncellenen});
            // Her 5 dakikada bir veya 200+ yeni ilan birikince GitHub'a yükle
            if(yeni > 0 || guncellenen > 0) {
              if (!self._ghSonYukleme) self._ghSonYukleme = 0;
              if (!self._ghBekleyenYeni) self._ghBekleyenYeni = 0;
              self._ghBekleyenYeni += (yeni + guncellenen);
              var simdi = Date.now();
              var bekleyenYeter = self._ghBekleyenYeni >= 100;
              var zamanYeter = (simdi - self._ghSonYukleme) > 3 * 60 * 1000;
              if (bekleyenYeter || zamanYeter) {
                self._ghBekleyenYeni = 0;
                self._ghSonYukleme = simdi;
                clearTimeout(self._ghSyncTimer);
                self._ghSyncTimer = setTimeout(function(){
                  if (!_tamSyncCalisiyor) {
                    tamSync(function(){ console.log('[ARAÇRADAR] GitHub anlık yüklendi'); });
                  }
                }, 2000);
              }
            }
          };
          tx.onerror=function(){if(cb)cb({yeni:0,guncellenen:0});};
        }
      };
      g.onerror=function(){kalan--;if(!kalan&&cb)cb({yeni:yeni,guncellenen:guncellenen});};
    });
  });
}

// ── Alarm ─────────────────────────────────────────────────────────────────────
function alarmKur(){
  chrome.storage.local.get([OTARAMA_KEY],function(r){
    var ot={};try{if(r[OTARAMA_KEY])ot=JSON.parse(r[OTARAMA_KEY]);}catch(e){}
    chrome.alarms.clear('saatlikTarama',function(){chrome.alarms.create('saatlikTarama',{periodInMinutes:ot.periyot||60});});
    // SW'yi uyanık tutmak için 1dk'da bir ping alarmı
    chrome.alarms.create('swPing',{periodInMinutes:1});
  });
}
chrome.runtime.onInstalled.addListener(function(){
  alarmKur();
  setTimeout(function(){chrome.notifications.create('hazir_'+Date.now(),{type:'basic',iconUrl:chrome.runtime.getURL('icon48.png'),title:'ARAÇRADAR Hazır',message:'Araç fiyat takibi aktif.',priority:0});},1000);
  // Kurulumda GitHub'dan veri çek
  setTimeout(function(){
    ghAyarCek();
    ghdenYukle(function(yeni) {
      console.log('[ARAÇRADAR] Kurulum/Güncelleme: ' + yeni + ' ilan alındı');
    });
  }, 3000);
});
;

chrome.runtime.onStartup.addListener(function(){
  alarmKur();
  // Her açılışta GitHub'dan güncel veriyi al
  setTimeout(function(){
    ghAyarCek(); // Ayarları GitHub'dan yükle

  // Tek seferlik: ilkEkleme alanı olmayan ilanları güncelle
  var _ilkEklemeGuncellendi = false;
  try { _ilkEklemeGuncellendi = localStorage.getItem('ar_ilkEkleme_v1') === '1'; } catch(e) {}
  if (!_ilkEklemeGuncellendi) {
    setTimeout(function() {
      dbOku(function(veri) {
        if (!veri || !veri.length) return;
        var guncellenenSay = 0;
        dbAc(function(db) {
          if (!db) return;
          var tx = db.transaction('ilanlar', 'readwrite');
          var st = tx.objectStore('ilanlar');
          veri.forEach(function(il) {
            if (!il.ilkEkleme) {
              var t = 0;
              if (il.gecmis && il.gecmis.length && il.gecmis[0].tarih) {
                t = typeof il.gecmis[0].tarih === 'string'
                  ? new Date(il.gecmis[0].tarih).getTime()
                  : parseInt(il.gecmis[0].tarih) || 0;
              }
              il.ilkEkleme = t || Date.now();
              st.put(il);
              guncellenenSay++;
            }
          });
          tx.oncomplete = function() {
            console.log('[ARAÇRADAR] ilkEkleme güncellendi:', guncellenenSay, 'ilan');
            try { localStorage.setItem('ar_ilkEkleme_v1', '1'); } catch(e) {}
          };
        });
      });
    }, 15000); // 15sn sonra — startup yüküne binmesin
  }

    // Günlük temizlik
    var sonTemizlik = parseInt('0' /* chrome.storage async — başlangıçta 0 */);
    if (Date.now() - sonTemizlik > 24*3600*1000) {
      setTimeout(function(){
        dbTemizle(function(silinen){
          try{ chrome.storage.local.set({'ar_son_temizlik': String(Date.now())}); }catch(e){}
          if (silinen > 0) console.log('[ARAÇRADAR] Temizlik: '+silinen+' ilan silindi');
        });
      }, 10000);
    }
    ghdenYukle(function(yeni){
      if(yeni>0){
        chrome.notifications.create('gh_'+Date.now(),{type:'basic',iconUrl:chrome.runtime.getURL('icon48.png'),
          title:'☁️ Buluttan Güncellendi',message:'+'+yeni+' yeni ilan buluttan alındı.',priority:1});
      }
    });
  }, 3000);
});
// ── Otomatik Günlük Yedek ─────────────────────────────────────────────────────
function otomatikYedekAl() {
  chrome.storage.local.get(['sonOtYedek', 'yedekKlasor'], function(r) {
    var simdi = Date.now();
    var gun24 = 24 * 60 * 60 * 1000;
    var sonYedek = r.sonOtYedek || 0;
    if (simdi - sonYedek < gun24) return; // 24 saatten az geçmiş
    
    dbOku(function(veri) {
      if (!veri || !veri.length) return;
      var ts = new Date().toISOString().slice(0,10);
      var ic = JSON.stringify({veri:veri, yedekTarihi:simdi, versiyon:2, otomatik:true});
      var klasor = r.yedekKlasor || 'AracRadar-Yedek';
      chrome.downloads.download({
        url: 'data:application/json;charset=utf-8,' + encodeURIComponent(ic),
        filename: klasor + '/aracradar-oto-' + new Date().toLocaleDateString('tr-TR',{weekday:'long'}).split(' ')[0] + '.json',
        saveAs: false
      }, function(id) {
        if (!chrome.runtime.lastError) {
          chrome.storage.local.set({sonOtYedek: simdi});
          console.log('[ARAÇRADAR] Otomatik yedek alındı:', veri.length, 'ilan');
          chrome.notifications.create('yedek_'+Date.now(), {
            type:'basic', iconUrl: chrome.runtime.getURL('icon48.png'),
            title: '💾 Otomatik Yedek Alındı',
            message: veri.length.toLocaleString('tr-TR') + ' ilan → ' + klasor,
            priority: 1
          });
        }
      });
    });
  });
}


chrome.alarms.onAlarm.addListener(function(alarm){
  // SW uyanık tut
  if(alarm.name==='swPing'){
    // Otomatik sync tetikle (2dk throttle zaten var)
    if(tarama.aktif) firebaseSync();
    return;
  }
  // Günlük otomatik yedek kontrolü — her alarm tetiklendiğinde kontrol et
  otomatikYedekAl();
  if(alarm.name!=='saatlikTarama'||tarama.aktif)return;
  chrome.storage.local.get([OTARAMA_KEY,AYAR_KEY],function(r){
    var ay={};try{if(r[AYAR_KEY])ay=JSON.parse(r[AYAR_KEY]);}catch(e){}
    if(ay.aktif===false)return;
    var ot={};try{if(r[OTARAMA_KEY])ot=JSON.parse(r[OTARAMA_KEY]);}catch(e){}
    baslatTarama(ot);
  });
});

// ── Yardımcı ─────────────────────────────────────────────────────────────────
function siteAlgila(url){
  if(!url)return 'sahibinden';
  if(url.indexOf('arabam.com')!==-1)return 'arabam';
  if(url.indexOf('letgo.com')!==-1)return 'letgo';
  return 'sahibinden';
}
function sayfaUrl(baseUrl,sayfa,site){
  if(site==='arabam'){var u=baseUrl.replace(/[?&]page=\d+/,'').replace(/[?&]take=\d+/,'');return u+(u.indexOf('?')!==-1?'&':'?')+'page='+sayfa+'&take=50';}
  if(site==='letgo'){
    // Letgo: tek URL, buton tıklamayla ilerliyor
    // Her turda aynı URL açılır, content.js "Daha Fazla Yükle" butonuna basar
    // Sayfa sayısını sayaç olarak kullanıyoruz — her bası bir "sayfa"
    if(sayfa>50)return null; // Max 50 tıklama yeterli
    var u=baseUrl.replace(/[?&]page=\d+/,'');
    return u; // Her seferinde aynı URL — content.js buton basacak
  }
  var u=baseUrl.replace(/[?&]pagingOffset=\d+/,'').replace(/[?&]pagingSize=\d+/,'');
  return u+(u.indexOf('?')!==-1?'&':'?')+'pagingOffset='+((sayfa-1)*50)+'&pagingSize=50';
}

// ── Bildirim ──────────────────────────────────────────────────────────────────
if(!self._bUrller)self._bUrller={};
function bildirimGoster(dusanlar){
  if(!dusanlar||!dusanlar.length)return;
  chrome.storage.local.get([BLD_KEY],function(r){
    var bld=[];try{if(r[BLD_KEY])bld=JSON.parse(r[BLD_KEY]);}catch(e){}
    dusanlar.forEach(function(d){bld.push({ad:d.ad,url:d.url,eskiFiyat:d.eskiFiyat,yeniFiyat:d.yeniFiyat,tarih:Date.now(),kaynak:d.kaynak,okundu:false});});
    if(bld.length>200)bld=bld.slice(-200);
    chrome.storage.local.set({[BLD_KEY]:JSON.stringify(bld)});
  });
  dusanlar.forEach(function(d){
    var fark=d.eskiFiyat-d.yeniFiyat;
    var pct=((fark/d.eskiFiyat)*100).toFixed(1);
    var nid='f_'+Date.now()+'_'+Math.random().toString(36).substr(2,4);
    self._bUrller[nid]=d.url;
    if(!self._bFiyatlar) self._bFiyatlar={};
    self._bFiyatlar[nid]=d.yeniFiyat||0;
    var adStr = d.ad && d.ad.length > 3 ? d.ad : (function(){
      var url = d.url || '';
      if(url.includes('arabam.com')){var m=url.match(/satilik-([a-z0-9-]+?)\/[a-z0-9]/);return m?m[1].replace(/-/g,' '):'Araç';}
      if(url.includes('letgo.com')){var m=url.match(/item\/([a-z0-9-]+?)-iid-/);return m?m[1].replace(/-/g,' '):'Araç';}
      return 'Araç';
    })();
    var yilStr = d.yil ? ' · ' + d.yil : '';
    var title = '📉 ' + adStr.substring(0,40) + yilStr;
    var msg = d.eskiFiyat.toLocaleString('tr-TR') + ' ₺ → ' + d.yeniFiyat.toLocaleString('tr-TR') + ' ₺  (▼%' + pct + ')';
    chrome.notifications.create(nid,{
      type:'basic',
      iconUrl:chrome.runtime.getURL('icon48.png'),
      title:title,
      message:msg,
      priority:2,
      silent: self._bildirimSessiz === true
    }, function(id){
      if(chrome.runtime.lastError) console.warn('[ARAÇRADAR] Bildirim hatası:', chrome.runtime.lastError.message);
      else console.log('[ARAÇRADAR] Bildirim gönderildi:', id, title);
    });
  });
}
chrome.notifications.onClicked.addListener(function(nid){
  chrome.notifications.clear(nid);
  var url=self._bUrller[nid];
  var fiyat=self._bFiyatlar&&self._bFiyatlar[nid]?self._bFiyatlar[nid]:0;
  if(url){
    // Panel'e mesaj gönder — Benzer Bul sekmesini aç
    chrome.runtime.sendMessage({action:'benzerSekmeAc', url:url, fiyat:fiyat}, function(){
      if(chrome.runtime.lastError){
        // Panel kapalıysa direkt ilan aç
        chrome.tabs.create({url:url,active:true});
      }
    });
    delete self._bUrller[nid];
    if(self._bFiyatlar) delete self._bFiyatlar[nid];
  }
});

// ── Tarama durumu ─────────────────────────────────────────────────────────────
var tarama={aktif:false,eklenen:0,guncellenen:0,siteSayac:{},aralik:15000,bekliyor:false,sonSonraki:0,_devamCbList:[]};
var siteBekleme={}; // site adı → true/false

// Tarama durumunu storage'a kaydet — SW yeniden başlasa bile devam et
function taramaStorageKaydet(){
  try{
    chrome.storage.local.set({
      tarama_aktif: tarama.aktif,
      tarama_aralik: tarama.aralik,
      tarama_sc: JSON.stringify(tarama.siteSayac||{}),
      tarama_ul: JSON.stringify(tarama.urlListesi||[]),
      tarama_ek: tarama.eklenen||0,
      tarama_gn: tarama.guncellenen||0
    });
  }catch(e){}
}

// SW yeniden başladığında tarama durumunu kontrol et
function taramaDurumKontrol(cb){
  try{
    chrome.storage.local.get(['tarama_aktif','tarama_aralik','tarama_sc','tarama_ul','tarama_ek','tarama_gn'], function(r){
      if(r.tarama_aktif) tarama.aktif = r.tarama_aktif;
      if(r.tarama_aralik) tarama.aralik = r.tarama_aralik;
      if(r.tarama_ek) tarama.eklenen = r.tarama_ek;
      if(r.tarama_gn) tarama.guncellenen = r.tarama_gn;
      try{if(r.tarama_sc) tarama.siteSayac=JSON.parse(r.tarama_sc);}catch(e){}
      try{if(r.tarama_ul) tarama.urlListesi=JSON.parse(r.tarama_ul);}catch(e){}
      if(cb) cb();
    });
  }catch(e){ if(cb) cb(); }
}

// ── Tek site tarama ───────────────────────────────────────────────────────────

// ── Letgo Tek Sekme Döngüsü ──────────────────────────────────────────────────
var _letgoGoruldu = {};
function letgoButonBasDongu(tabId, etiket, tamamCb, kontrol, _siteKey) {
  var sk = _siteKey || 'letgo'; // siteKey parametresi
  if(!tarama.aktif){
    clearInterval(kontrol);
    try{chrome.tabs.remove(tabId);}catch(e){}
    tamamCb&&tamamCb();return;
  }
  chrome.tabs.sendMessage(tabId,{action:'letgoButonTikla'},function(resp){
    if(chrome.runtime.lastError){
      if (!self._letgoInjectSay) self._letgoInjectSay = {};
      var tabKey = 'tab_' + tabId;
      self._letgoInjectSay[tabKey] = (self._letgoInjectSay[tabKey] || 0) + 1;
      if (self._letgoInjectSay[tabKey] > 1) { // Letgo 1 denemeden fazla yapma
        console.log('[ARAÇRADAR] Letgo max inject deneme aşıldı, durduruluyor');
        clearInterval(kontrol);
        try{chrome.tabs.remove(tabId);}catch(e){}
        if(tarama.siteSayac[sk]) tarama.siteSayac[sk].bitti = true;
        _letgoGoruldu = {};
        tamamCb && tamamCb();
        return;
      }
      console.log('[ARAÇRADAR] Letgo inject deneme:', self._letgoInjectSay[tabKey]);
      try{
        chrome.scripting.executeScript({target:{tabId:tabId},files:['content.js']},function(){
          setTimeout(function(){letgoButonBasDongu(tabId,etiket,tamamCb,kontrol,sk);},4000);
        });
      }catch(e){
        clearInterval(kontrol);
        try{chrome.tabs.remove(tabId);}catch(e2){}
        tamamCb&&tamamCb();
      }
      return;
    }
    var ilanlar = resp && resp.ilanlar ? resp.ilanlar : [];
    var bitti   = resp && resp.bitti;
    var yeniIlanlar = ilanlar.filter(function(il){ return il.url && !_letgoGoruldu[il.url]; });
    yeniIlanlar.forEach(function(il){ _letgoGoruldu[il.url]=true; });
    
    if (yeniIlanlar.length > 0) {
      if (tarama.siteSayac[sk]) {
        tarama.siteSayac[sk].sayfa   = (tarama.siteSayac[sk].sayfa||0) + 1;
        tarama.siteSayac[sk].eklenen = (tarama.siteSayac[sk].eklenen||0) + yeniIlanlar.length;
      }
      dbEkle(yeniIlanlar, etiket, function(r){
        console.log('[ARAÇRADAR] Letgo DB eklendi:', r.yeni, 'yeni');
        taramaDurumYaz('devam');
      });
    }
    
    console.log('[ARAÇRADAR] Letgo tur:', ilanlar.length, 'toplam,', yeniIlanlar.length, 'yeni, bitti:', bitti);
    taramaDurumYaz('devam');
    
    if (bitti || !tarama.aktif) {
      clearInterval(kontrol);
      try{chrome.tabs.remove(tabId);}catch(e){}
      if (tarama.siteSayac[sk]) tarama.siteSayac[sk].bitti = true;
      _letgoGoruldu = {};
      tamamCb && tamamCb();
      return;
    }
    setTimeout(function(){letgoButonBasDongu(tabId,etiket,tamamCb,kontrol,sk);}, 15000);
  });
}

function siteTara(baseUrl,etiket,maxSayfa,aralik,maxIlan,tamamCb,siteKeyOverride){
  var site=siteAlgila(baseUrl);
  var siteKey=siteKeyOverride||site;

  // LETGO: tek sekme, tüm butonları tıkla
  if(site==='letgo'){
    tarama.siteSayac[siteKey]={sayfa:0,eklenen:0,guncellenen:0,toplamSayfa:1,bitti:false,aralik:aralik,site:site,url:baseUrl};
    console.log('[ARAÇRADAR] Başladı: letgo (tek sekme modu)');
    var letgoUrl = baseUrl.replace(/[?&]page=\d+/,'');
    chrome.tabs.create({url:letgoUrl,active:false},function(tab){
      if(chrome.runtime.lastError||!tab){tamamCb&&tamamCb();return;}
      var letgoTabId = tab.id;
      // Sayfa yüklensin bekle
      var letgoYuklendi = false;
      var letgoKontrol = setInterval(function(){
        if(!tarama.aktif){
          clearInterval(letgoKontrol);
          try{chrome.tabs.remove(letgoTabId);}catch(e){}
          tamamCb&&tamamCb();return;
        }
        chrome.tabs.get(letgoTabId,function(t){
          if(chrome.runtime.lastError||!t){
            clearInterval(letgoKontrol);
            tamamCb&&tamamCb();return;
          }
          if(t.status!=='complete')return;
          if(!letgoYuklendi){
            letgoYuklendi=true;
            // Content script inject et, 5sn bekle
            try{
              chrome.scripting.executeScript({target:{tabId:letgoTabId},files:['content.js']},function(){
                setTimeout(function(){letgoButonBasDongu(letgoTabId,etiket,tamamCb,letgoKontrol,siteKey);},5000);
              });
            }catch(e){
              setTimeout(function(){letgoButonBasDongu(letgoTabId,etiket,tamamCb,letgoKontrol,siteKey);},5000);
            }
          }
        });
      },1000);
    });
    return;
  }

  var sayfa=1;
  var bosCount=0;
  var toplamHata=0;
  var yavaslama=0;
  tarama.siteSayac[siteKey]={sayfa:0,eklenen:0,guncellenen:0,toplamSayfa:maxSayfa,bitti:false,aralik:aralik,site:site,url:baseUrl};
  tarama._baslangic = tarama._baslangic || Date.now();
  console.log('[ARAÇRADAR] Başladı:',site,baseUrl.substring(0,60));

  // Tek sekme key'leri — sahibinden ve letgo için kalıcı sekme takibi
  var _sbTabKey = 'sb_tab_' + siteKey;
  var _lgTabKey = 'lg_tab_' + siteKey;
  taramaDurumYaz('basladi');

  function sonraki(){
    chrome.storage.local.get(['tarama_aktif'], function(r){
      if(r && r.tarama_aktif === true) tarama.aktif = true;
      if(!tarama.aktif){ bitis('Durduruldu'); return; }
      _sonraki();
    });
  }
  function _sonraki(){
    if(!tarama.aktif){bitis('Durduruldu');return;}
    // Site bazlı bekleme — siteKey parametreden geliyor (siteKeyOverride||site)
    var _skBekle = site==='sahibinden'?'sb':site==='arabam'?'ar':'lg';
    if(siteBekleme[_skBekle]){
      setTimeout(function(){ _sonraki(); }, 2000); // 2sn'de bir tekrar kontrol
      return;
    }
    if(sayfa>maxSayfa){bitis('Tamamlandı');return;}
    if(maxIlan>0&&(tarama.siteSayac[siteKey]&&tarama.siteSayac[siteKey].eklenen||0)>=maxIlan){bitis('MaxIlan');return;}

    // Sahibinden: her 25 sayfada 2dk mola (tarama.aktif kontrolü molada da devam et)
    if(site==='sahibinden'&&sayfa>1&&(sayfa-1)%25===0){
      console.log('[ARAÇRADAR] Sahibinden mola, sayfa:',sayfa);
      tarama.siteSayac[siteKey].mola=true;
      var molaMs = 2*60*1000;
      var molaTimer = setTimeout(function(){
        if(!tarama.aktif){bitis('Durduruldu');return;}
        tarama.siteSayac[siteKey].mola=false;
        _tara();
      }, molaMs);
      // tarama durdurulursa timer'ı iptal et
      var molaKontrol = setInterval(function(){
        if(!tarama.aktif){clearInterval(molaKontrol);clearTimeout(molaTimer);}
      }, 5000);
      return;
    }
    _tara();
  }

  function _tara(){
    if(!tarama.aktif){bitis('Durduruldu');return;}
    tarama.siteSayac[siteKey].sayfa=sayfa;
    var url=sayfaUrl(baseUrl,sayfa,site);
    if(url===null){bitis('Tamamlandı');return;}
    var guncelAralik=(tarama.siteSayac[siteKey]&&tarama.siteSayac[siteKey].aralik)||aralik;

    // LETGO — tek kalıcı sekme (URL güncelle, kapatma/açma yok)
    if(site==='letgo'){
      function _lgSayfaTara(tabId){
        if(!tarama.aktif){bitis('Durduruldu');try{chrome.tabs.remove(tabId);}catch(e){}return;}
        chrome.tabs.update(tabId,{url:url},function(){
          if(chrome.runtime.lastError){toplamHata++;humanBekle(guncelAralik,sonraki);return;}
          var deneme=0,tamam=false;
          function oku(){
            if(tamam)return;
            if(deneme++>45){tamam=true;bosCount++;if(bosCount>=15){try{chrome.tabs.remove(tabId);}catch(e){}bitis('ListeBitti');return;}sayfa++;taramaStorageKaydet();humanBekle(guncelAralik,function(){_lgSayfaTara(tabId);});return;}
            chrome.tabs.get(tabId,function(t){
              if(chrome.runtime.lastError||!t){tamam=true;try{chrome.tabs.remove(tabId);}catch(e){}self[_lgTabKey]=null;humanBekle(guncelAralik,sonraki);return;}
              if(t.status!=='complete'){setTimeout(oku,1000);return;}
              try{chrome.scripting.executeScript({target:{tabId:tabId},files:['content.js']},function(){
                setTimeout(function(){
                  if(tamam)return;
                  chrome.tabs.sendMessage(tabId,{action:'ilanlarAl',etiket:etiket},function(resp){
                    if(tamam)return;
                    if(chrome.runtime.lastError){setTimeout(oku,1000);return;}
                    tamam=true;
                    var ilanlar=resp&&resp.ilanlar?resp.ilanlar:[];
                    if(!ilanlar.length){bosCount++;if(bosCount>=15){try{chrome.tabs.remove(tabId);}catch(e){}bitis('ListeBitti');}else{sayfa++;taramaStorageKaydet();humanBekle(guncelAralik,function(){_lgSayfaTara(tabId);});}return;}
                    bosCount=0;
                    dbEkle(ilanlar,etiket,function(){tarama.siteSayac[siteKey].sayfa=sayfa;sayfa++;taramaStorageKaydet();firebaseSync();humanBekle(guncelAralik,function(){_lgSayfaTara(tabId);});});
                  });
                },500);
              });}catch(e){setTimeout(oku,500);}
            });
          }
          setTimeout(oku,3000);
        });
      }
      if(self[_lgTabKey]){
        chrome.tabs.get(self[_lgTabKey],function(t){
          if(chrome.runtime.lastError||!t){
            self[_lgTabKey]=null;
            chrome.tabs.create({url:'about:blank',active:false,pinned:true},function(tab){
              if(!tab){humanBekle(guncelAralik,sonraki);return;}
              self[_lgTabKey]=tab.id;
              _lgSayfaTara(tab.id);
            });
          } else { _lgSayfaTara(self[_lgTabKey]); }
        });
      } else {
        chrome.tabs.create({url:'about:blank',active:false,pinned:true},function(tab){
          if(!tab){humanBekle(guncelAralik,sonraki);return;}
          self[_lgTabKey]=tab.id;
          _lgSayfaTara(tab.id);
        });
      }
      return;
    }

    // SAHİBİNDEN — tek kalıcı sekme (her sayfa için ayrı sekme açmak yerine URL güncelle)
    if (site==='sahibinden') {
      function _sbSayfaTara(tabId) {
        if(!tarama.aktif){bitis('Durduruldu');try{chrome.tabs.remove(tabId);}catch(e){}return;}
        // Sekmeyi hedef URL'ye yönlendir
        chrome.tabs.update(tabId,{url:url},function(){
          if(chrome.runtime.lastError){toplamHata++;humanBekle(guncelAralik,sonraki);return;}
          var deneme=0,tamam=false;
          function oku(){
            if(tamam)return;
            if(deneme++>45){tamam=true;bosCount++;if(bosCount>=10){try{chrome.tabs.remove(tabId);}catch(e){}bitis('ListeBitti');return;}sayfa++;taramaStorageKaydet();humanBekle(guncelAralik,sonraki);return;}
            chrome.tabs.get(tabId,function(t){
              if(chrome.runtime.lastError||!t){tamam=true;try{chrome.tabs.remove(tabId);}catch(e){}humanBekle(guncelAralik,sonraki);return;}
              if(t.status!=='complete'){setTimeout(oku,1000);return;}
              try{chrome.scripting.executeScript({target:{tabId:tabId},files:['content.js']},function(){
                setTimeout(function(){
                  if(tamam)return;
                  chrome.tabs.sendMessage(tabId,{action:'ilanlarAl',etiket:etiket},function(resp){
                    if(tamam)return;
                    if(chrome.runtime.lastError){setTimeout(oku,1000);return;}
                    tamam=true;
                    var ilanlar=resp&&resp.ilanlar?resp.ilanlar:[];
                    if(!ilanlar.length){bosCount++;if(bosCount>=10){try{chrome.tabs.remove(tabId);}catch(e){}bitis('ListeBitti');}else{sayfa++;taramaStorageKaydet();humanBekle(guncelAralik,function(){_sbSayfaTara(tabId);});}return;}
                    bosCount=0;
                    dbEkle(ilanlar,etiket,function(){tarama.siteSayac[siteKey].sayfa=sayfa;sayfa++;taramaStorageKaydet();firebaseSync();humanBekle(guncelAralik,function(){_sbSayfaTara(tabId);});});
                  });
                },2000);
              });}catch(e){setTimeout(oku,1000);}
            });
          }
          setTimeout(oku,4000);
        });
      }
      // Mevcut açık SHB sekmesi varsa kullan, yoksa yeni aç
      if(self[_sbTabKey]){
        chrome.tabs.get(self[_sbTabKey],function(t){
          if(chrome.runtime.lastError||!t){
            self[_sbTabKey]=null;
            chrome.tabs.create({url:'about:blank',active:false,pinned:true},function(tab){
              if(chrome.runtime.lastError||!tab){humanBekle(guncelAralik,sonraki);return;}
              self[_sbTabKey]=tab.id;
              setTimeout(function(){_sbSayfaTara(tab.id);},1000);
            });
          } else {
            _sbSayfaTara(self[_sbTabKey]);
          }
        });
      } else {
        chrome.tabs.create({url:'about:blank',active:false,pinned:true},function(tab){
          if(chrome.runtime.lastError||!tab){humanBekle(guncelAralik,sonraki);return;}
          self[_sbTabKey]=tab.id;
          setTimeout(function(){_sbSayfaTara(tab.id);},1000);
        });
      }
      return;
    }

    // ARABAM — fetch tabanlı (sekme açmadan)
    var rastgeleBekle = Math.floor(Math.random()*3000)+1000;
    setTimeout(function(){
      if(!tarama.aktif){bitis('Durduruldu');return;}
      fetch(url,{
        method:'GET',
        credentials:'include',
        redirect:'follow',
        headers:{
          'Accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language':'tr-TR,tr;q=0.9',
          'Cache-Control':'no-cache',
          'Upgrade-Insecure-Requests':'1'
        }
      })
      .then(function(r){
        // Login sayfasına yönlendirildiyse (CORS/redirect sorunu)
        if(r.type==='opaqueredirect'||r.url.indexOf('giris')!==-1||r.url.indexOf('login')!==-1){
          console.warn('[ARAÇRADAR]',site,'giriş gerekiyor — tarayıcıda oturum açın');
          chrome.notifications.create('login_'+Date.now(),{
            type:'basic',iconUrl:chrome.runtime.getURL('icon48.png'),
            title:'⚠️ '+site+' Giriş Gerekiyor',
            message:'Tarayıcıda '+site+'.com adresine giriş yapın, sonra devam eder.',
            priority:2
          });
          bitis('GirisGerekiyor');return;
        }
        if(!r.ok){
          console.warn('[ARAÇRADAR]',site,'HTTP',r.status,'sayfa',sayfa);
          bosCount++;
          if(bosCount>=10){bitis('Engellendi');return;}
          var bekleSure=r.status===429?60000:15000;
          sayfa++;taramaStorageKaydet();setTimeout(sonraki,bekleSure);return;
        }
        return r.text();
      })
      .then(function(html){
        if(!html){bosCount++;sayfa++;taramaStorageKaydet();humanBekle(guncelAralik,sonraki);return;}

        // Captcha/bot kontrolü (regex — DOMParser service worker'da yok)
        var hasIlan = html.indexOf('data-id=') !== -1 ||
                      html.indexOf('searchResultsItem') !== -1 ||
                      html.indexOf('listing-list-item') !== -1;
        var isCaptcha = !hasIlan && (
          html.indexOf('checkLoading') !== -1 ||
          html.indexOf('g-recaptcha') !== -1
        );

        if(isCaptcha){
          console.warn('[ARAÇRADAR]',site,'captcha sayfa',sayfa);
          bosCount=0;
          chrome.notifications.create('cap_'+Date.now(),{type:'basic',iconUrl:chrome.runtime.getURL('icon48.png'),
            title:'\u26a0\ufe0f '+site+' Bot Koruması',message:'3 dk bekleniyor...',priority:2});
          sayfa++;taramaStorageKaydet();setTimeout(sonraki,3*60*1000);return;
        }

        // Regex ile parse — DOMParser yok (service worker kısıtı)
        var ilanlar=[];
        if(site==='sahibinden'){
          // data-id="12345" olan satırları bul
          var rowRe = /data-id="(\d+)"[^]*?<\/tr>/g, rowM;
          while((rowM=rowRe.exec(html))!==null){
            var row=rowM[0];
            // Link
            var linkM=row.match(/href="(https?:\/\/[^"]*\/ilan\/[^"?#]*)/);
            if(!linkM)linkM=row.match(/href="(\/ilan\/[^"?#]*)"/);
            if(!linkM)continue;
            var ilanUrl=linkM[1].startsWith('http')?linkM[1]:'https://www.sahibinden.com'+linkM[1];
            ilanUrl=ilanUrl.split('?')[0];
            if(ilanlar.some(function(x){return x.url===ilanUrl;}))continue;
            // Fiyat
            var fM=row.match(/(\d{1,3}(?:[.]\d{3})+)\s*TL/);
            if(!fM)fM=row.match(/(\d{1,3}(?:[,]\d{3})+)\s*TL/);
            var fiyat=fM?parseInt(fM[1].replace(/[.,]/g,'')):0;
            if(!fiyat||fiyat<50000)continue;
            // Başlık
            var titleM=row.match(/title="([^"]+)"/)||row.match(/<a[^>]+>([^<]{5,80})<\/a>/);
            var ad=titleM?titleM[1].trim().substring(0,200):'';
            // Yıl ve KM — td içerikleri
            var tdler=row.match(/<td[^>]*>([^<]*)<\/td>/g)||[];
            var yil=0,km='',sehir='';
            // Önce searchResultsLocationValue class'ından şehir çek
            var locM=row.match(/searchResultsLocationValue[^>]*>([^<]{3,40})</);
            if(locM)sehir=locM[1].trim().split('/')[0].trim();
            tdler.forEach(function(td){
              var v=td.replace(/<[^>]+>/g,'').trim();
              if(/^(19|20)\d{2}$/.test(v))yil=parseInt(v);
              else if(/\d+[.,]\d+ km/i.test(v)||/^\d{1,3}([.,]\d{3})+ km$/i.test(v))km=v;
              // Şehir class bulunamadıysa fallback: Türkçe kelime
              else if(!sehir&&v.length>=3&&v.length<=30&&/^[A-Za-zÇçĞğİiÖöŞşÜü\s\/\-]+$/.test(v)&&!/^(sahibinden|otomatik|manuel|benzin|dizel|lpg|hibrit|sedan|hatchback|suv|pickup|minivan|coupe|cabriolet|station)$/i.test(v.toLowerCase()))sehir=v;
            });
            ilanlar.push({url:ilanUrl,fiyat:fiyat,ad:ad,marka:'',seri:'',yil:yil,km:km,sehir:sehir,kaynak:'sahibinden'});
          }
          // Fallback: link + fiyat regex
          if(!ilanlar.length){
            var linkRe=/href="(https?:\/\/www\.sahibinden\.com\/ilan\/[^"?#]*)"/g,lM;
            while((lM=linkRe.exec(html))!==null){
              var u=lM[1].split('?')[0];
              if(ilanlar.some(function(x){return x.url===u;}))continue;
              // Yakınındaki fiyatı ara
              var slice=html.substring(Math.max(0,lM.index-200),lM.index+200);
              var fM2=slice.match(/(\d{1,3}(?:[.,]\d{3})+)\s*TL/);
              var f2=fM2?parseInt(fM2[1].replace(/[.,]/g,'')):0;
              if(!f2||f2<50000)continue;
              ilanlar.push({url:u,fiyat:f2,ad:'',marka:'',seri:'',yil:0,km:'',kaynak:'sahibinden'});
            }
          }
        } else { // arabam — regex
          var arbRe=/class="listing-list-item[^"]*"[^]*?<\/tr>/g,arbM;
          while((arbM=arbRe.exec(html))!==null){
            var row2=arbM[0];
            var lM2=row2.match(/href="(\/ilan\/[^"?#]*)"/);
            if(!lM2)continue;
            var u2='https://www.arabam.com'+lM2[1].split('?')[0];
            if(ilanlar.some(function(x){return x.url===u2;}))continue;
            var vals=[];var re2=/(\d{1,3}(?:[.,]\d{3})+)\s*TL/g,fM3;
            while((fM3=re2.exec(row2))!==null){var v2=parseInt(fM3[1].replace(/[.,]/g,''));if(v2>=50000)vals.push(v2);}
            var f3=vals.length?Math.max.apply(null,vals):0;
            if(!f3)continue;
            // Yıl
            var yM=row2.match(/>(19|20)(\d{2})</);
            var yil2=yM?parseInt(yM[1]+yM[2]):0;
            ilanlar.push({url:u2,fiyat:f3,ad:'',marka:'',seri:'',yil:yil2,km:'',kaynak:'arabam'});
          }
          // Fallback arabam
          if(!ilanlar.length){
            var arbLinkRe=/href="(\/ilan\/[^"?#]*)"/g,alM;
            while((alM=arbLinkRe.exec(html))!==null){
              var u3='https://www.arabam.com'+alM[1].split('?')[0];
              if(ilanlar.some(function(x){return x.url===u3;}))continue;
              var sl=html.substring(Math.max(0,alM.index-300),alM.index+300);
              var fM4=sl.match(/(\d{1,3}(?:[.,]\d{3})+)\s*TL/);
              var f4=fM4?parseInt(fM4[1].replace(/[.,]/g,'')):0;
              if(!f4||f4<50000)continue;
              ilanlar.push({url:u3,fiyat:f4,ad:'',marka:'',seri:'',yil:0,km:'',kaynak:'arabam'});
            }
          }
        }

        console.log('[ARAÇRADAR]',site,'sayfa',sayfa,':',ilanlar.length,'ilan (fetch)');

        if(!ilanlar.length){
          bosCount++;
          if(bosCount>=15){bitis('ListeBitti');return;}
          sayfa++;taramaStorageKaydet();humanBekle(guncelAralik,sonraki);return;
        }
        bosCount=0;
        dbEkle(ilanlar,etiket,function(){
          tarama.siteSayac[siteKey].sayfa=sayfa;
          sayfa++;taramaStorageKaydet();firebaseSync();
          // Paneldeki aralik ayarını kullan + küçük rastgele ek
          var rastgeleEk = Math.floor(Math.random()*3000);
          setTimeout(sonraki, guncelAralik + rastgeleEk);
        });
      })
      .catch(function(e){
        console.warn('[ARAÇRADAR]',site,'fetch hata:',e.message);
        bosCount++;sayfa++;taramaStorageKaydet();humanBekle(guncelAralik,sonraki);
      });
    },rastgeleBekle);
  } // _tara

  var bitis = function(neden){
    console.log('[ARAÇRADAR] Bitti:',site,neden,'sayfa:',sayfa-1);
    if(tarama.siteSayac[siteKey])tarama.siteSayac[siteKey].bitti=true;
    taramaDurumYaz(neden==='Durduruldu'?'durduruldu':neden==='Hata'?'hata':'bitti');
    // Tek sekme varsa kapat
    var _tKey = site==='sahibinden' ? _sbTabKey : site==='letgo' ? _lgTabKey : null;
    if(_tKey && self[_tKey]){try{chrome.tabs.remove(self[_tKey]);}catch(e){}self[_tKey]=null;}
    // Tarama bitince hemen GitHub'a yükle
    setTimeout(function(){
      console.log('[ARAÇRADAR] Tarama bitti, GitHub\'a yükleniyor...');
      tamSync(function(){ console.log('[ARAÇRADAR] Tarama sonrası GitHub sync tamamlandı'); });
    }, 2000);
    if(tamamCb)tamamCb();
  };
  sonraki();
}

// ── Çoklu site ────────────────────────────────────────────────────────────────

// ── MV3 Service Worker Keep-Alive (Alarm tabanlı — en güvenilir yöntem) ─────
var _keepAliveInterval = null;

var _syncInterval = null;
function keepAliveBaslat() {
  // Her 5 dakikada zorla Netlify sync — timer sıfırlanma sorununu önler
  if (_syncInterval) clearInterval(_syncInterval);
  _syncInterval = setInterval(function() {
    if (tarama.aktif) {
      if (SYNC_ZAMANLAYICI) clearTimeout(SYNC_ZAMANLAYICI);
      SYNC_ZAMANLAYICI = null;
      firebaseSync();
    }
  }, 5 * 60 * 1000); // 5dk

  // setInterval ile her 20sn ping
  if (_keepAliveInterval) clearInterval(_keepAliveInterval);
  _keepAliveInterval = setInterval(function() {
    if (!tarama.aktif) { keepAliveDurdur(); return; }
    chrome.runtime.getPlatformInfo(function(info) {
      // SW uyanık kaldı
    });
  }, 20000);

  // Alarm ile de destekle — SW uyusa bile alarm onu uyandırır
  try {
    chrome.alarms.create('taramaKeepalive', { periodInMinutes: 0.4 }); // ~24sn
  } catch(e) {}
}

function keepAliveDurdur() {
  if (_keepAliveInterval) { clearInterval(_keepAliveInterval); _keepAliveInterval = null; }
  try { chrome.alarms.clear('taramaKeepalive'); } catch(e) {}
  if (_syncInterval) { clearInterval(_syncInterval); _syncInterval = null; }
  // Tarama bitince bir kez sync yap
  setTimeout(function(){ if(SYNC_ZAMANLAYICI){clearTimeout(SYNC_ZAMANLAYICI);SYNC_ZAMANLAYICI=null;} firebaseSync(); }, 2000);
}

// Alarm tetiklenince SW uyanır ve tarama durumunu restore eder
chrome.alarms.onAlarm.addListener(function(alarm) {
  if (alarm.name === 'taramaKeepalive') {
    if (!tarama.aktif) {
      // SW yeniden başlamış olabilir — storage'dan kontrol et
      chrome.storage.local.get(['tarama_aktif', 'tarama_aralik', 'tarama_ayarlar'], function(r) {
        if (r && r.tarama_aktif === true) {
          console.log('[ARAÇRADAR] Alarm: SW uyandı, tarama yeniden başlatılıyor...');
          // SW uyuduğunda tüm döngüler kaybolur — ayarları alıp taramayı baştan başlat
          var ayarlar = null;
          try { ayarlar = r.tarama_ayarlar ? JSON.parse(r.tarama_ayarlar) : null; } catch(e) {}
          if (ayarlar && !tarama.aktif) {
            tarama.aktif = false; // sıfırla
            tarama.siteSayac = {};
            tarama.eklenen = 0;
            tarama.guncellenen = 0;
            setTimeout(function() {
              baslatTarama(ayarlar);
              console.log('[ARAÇRADAR] Tarama yeniden başlatıldı');
            }, 2000);
          } else if (tarama.aktif) {
            console.log('[ARAÇRADAR] Tarama zaten aktif');
          } else {
            keepAliveDurdur();
          }
        } else {
          keepAliveDurdur();
        }
      });
    }
  }
});

function baslatTarama(ot){
  if(!ot)return;
  var urls=ot.urls&&ot.urls.length?ot.urls:(ot.baseUrl?[{url:ot.baseUrl,sayfa:ot.toplamSayfa||9999,maxIlan:0}]:[]);
  if(!urls.length)return;
  tarama.aktif=true;tarama.eklenen=0;tarama.guncellenen=0;tarama.siteSayac={};tarama.aralik=ot.aralik||15000;
  // SW uykuya geçerse ayarları koru
  chrome.storage.local.set({tarama_aktif:true, tarama_aralik:ot.aralik||15000, tarama_ayarlar:JSON.stringify(ot)});
  taramaStorageKaydet();
  keepAliveBaslat();
  chrome.notifications.create('bas_'+Date.now(),{type:'basic',iconUrl:chrome.runtime.getURL('icon48.png'),title:'🔍 Tarama Başladı',message:urls.length+' site'+(ot.etiket?' · '+ot.etiket:''),priority:1});
  
  // TÜM siteler AYNI ANDA başlar — her biri kendi sırasını bekler
  // Kasma yok çünkü her site kendi aralik'ını bekliyor (aynı anda max 1-2 sekme açık)
  tarama.urlListesi = urls.map(function(s,i){return {url:s.url||'',idx:i};});
  var biten = 0;
  // Site sayacını takip et — aynı site 2. kez gelirse _2 suffix ekle
  var _siteKeyIdx = {};
  urls.forEach(function(s, idx){
    if(!s||!s.url){biten++;return;}
    var _siteName = siteAlgila(s.url); // 'sahibinden' | 'arabam' | 'letgo'
    _siteKeyIdx[_siteName] = (_siteKeyIdx[_siteName] || 0) + 1;
    var siteKey = _siteName + (_siteKeyIdx[_siteName] > 1 ? '_'+_siteKeyIdx[_siteName] : '');
    setTimeout(function(){
      if(!tarama.aktif)return;
      siteTara(s.url,s.etiket||ot.etiket||'',s.sayfa||9999,s.aralik||ot.aralik||15000,s.maxIlan||0,function(){
        biten++;
        if(biten>=urls.length){
          tarama.aktif=false;
          keepAliveDurdur();
          taramaStorageKaydet();
          try{chrome.notifications.create('bit_'+Date.now(),{type:'basic',iconUrl:chrome.runtime.getURL('icon48.png'),title:'✅ Tarama Tamamlandı',message:urls.length+' site · +'+tarama.eklenen+' yeni · '+tarama.guncellenen+' güncellendi',priority:1});}catch(e){}
        }
      }, siteKey);
    }, idx * 3000);
  });
}

// ── Mesajlar ──────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function(msg,sender,sendResponse){
      if (msg.action === 'ilanSil') {
    var gun = msg.gun || 0;
    var sifirSil = msg.sifirSil || false;
    var esik = gun > 0 ? Date.now() - (gun * 24 * 60 * 60 * 1000) : 0;
    dbOku(function(veri) {
      if (!veri) { sendResponse({ok:true, silinen:0}); return; }
      var temiz = veri.filter(function(il) {
        // Fiyatı sıfır kontrolü
        var fiyat = il.fiyat || 0;
        if (!fiyat && il.gecmis && il.gecmis.length)
          fiyat = parseInt(il.gecmis[il.gecmis.length-1].fiyat) || 0;
        if (sifirSil && !fiyat) return false;
        // Gün kontrolü
        if (esik > 0) {
          var ts = 0;
          // ilkEkleme — ilanın ilk eklendiği tarih (en güvenilir)
          if (il.ilkEkleme) {
            ts = parseInt(il.ilkEkleme) || 0;
          }
          // Yoksa gecmis'in ilk kaydının tarihi
          if (!ts && il.gecmis && il.gecmis.length) {
            var ilkG = il.gecmis[0];
            if (ilkG.tarih) {
              ts = typeof ilkG.tarih === 'string'
                ? new Date(ilkG.tarih).getTime()
                : parseInt(ilkG.tarih) || 0;
            }
          }
          // Hiç tarih yoksa eski say
          if (!ts || ts < esik) return false;
        }
        return true;
      });
      var silinen = veri.length - temiz.length;
      if (silinen === 0) { sendResponse({ok:true, silinen:0}); return; }
      var tx = _db.transaction(['ilanlar'], 'readwrite');
      var store = tx.objectStore('ilanlar');
      store.clear();
      temiz.forEach(function(il){ store.put(il); });
      tx.oncomplete = function() {
        console.log('[ARAÇRADAR] Silindi:', silinen, 'ilan');
        sendResponse({ok:true, silinen:silinen, kalan:temiz.length});
        // GitHub'a yükle
        setTimeout(function(){
          tamSync(function(){ console.log('[ARAÇRADAR] Silme sonrası GitHub sync'); });
        }, 2000);
      };
    });
    return true;
  }
  if (msg.action === 'aktifKontrol') {
    dbOku(function(veri) {
      if (!veri || !veri.length) { sendResponse({ok:true, silinen:0, toplam:0}); return; }

      var silincek_urls = {};
      // Önce URL'den tespit edilebilenleri işaretle
      veri.forEach(function(il) {
        if (!il.url) return;
        if (il.url.includes('redirectedItem=true') || il.url.includes('_c157')) {
          silincek_urls[il.url] = true;
        }
      });

      var kontrol_edilecek = veri.filter(function(il) {
        return il.url && !silincek_urls[il.url];
      });

      var toplam = kontrol_edilecek.length;
      var tamamlanan = 0;

      function ilerlemeBildir() {
        try {
          chrome.runtime.sendMessage({
            action: 'aktifKontrolIlerleme',
            tamamlanan: tamamlanan,
            toplam: toplam,
            silinen: Object.keys(silincek_urls).length
          });
        } catch(e) {}
      }

      // Tab açarak content script ile kontrol et
      function tabKontrol(ilanlar, idx, tabId, cb) {
        if (idx >= ilanlar.length) { 
          try { chrome.tabs.remove(tabId); } catch(e) {}
          cb();
          return; 
        }
        var il = ilanlar[idx];
        chrome.tabs.update(tabId, {url: il.url}, function() {
          // Sayfa yüklensin bekle
          var bekle = setInterval(function() {
            chrome.tabs.get(tabId, function(tab) {
              if (chrome.runtime.lastError || !tab) {
                clearInterval(bekle);
                tamamlanan++;
                tabKontrol(ilanlar, idx+1, tabId, cb);
                return;
              }
              if (tab.status !== 'complete') return;
              clearInterval(bekle);
              // Content script ile kontrol
              chrome.tabs.sendMessage(tabId, {action:'ilanAktifMi'}, function(r) {
                if (!r || !r.aktif) {
                  silincek_urls[il.url] = true;
                }
                tamamlanan++;
                if (tamamlanan % 20 === 0) ilerlemeBildir();
                setTimeout(function(){ tabKontrol(ilanlar, idx+1, tabId, cb); }, 500);
              });
            });
          }, 1000);
        });
      }

      // Tek tab aç, sırayla kontrol et
      var KONTROL_MAX = msg.max || kontrol_edilecek.length;
      var kontrol_listesi = kontrol_edilecek.slice(0, KONTROL_MAX);

      chrome.tabs.create({url: kontrol_listesi[0] ? kontrol_listesi[0].url : 'about:blank', active: false}, function(tab) {
        if (chrome.runtime.lastError || !tab) {
          sendResponse({ok:true, silinen:Object.keys(silincek_urls).length});
          return;
        }
        tabKontrol(kontrol_listesi, 0, tab.id, function() {
          ilerlemeBildir();
          _aktifKontrolSil(veri, silincek_urls, sendResponse, toplam);
        });
      });
    });
    return true;
  }

function _aktifKontrolSil(veri, silincek_urls, sendResponse) {
  var temiz = veri.filter(function(il) { return !silincek_urls[il.url]; });
  var silinen = veri.length - temiz.length;
  if (silinen === 0) { sendResponse({ok:true, silinen:0}); return; }
  dbAc(function(db) {
    if (!db) { sendResponse({ok:true, silinen:0}); return; }
    var tx = db.transaction('ilanlar', 'readwrite');
    var st = tx.objectStore('ilanlar');
    st.clear();
    temiz.forEach(function(il){ st.put(il); });
    tx.oncomplete = function() {
      console.log('[ARAÇRADAR] Aktif kontrol: ' + silinen + ' ilan silindi');
      sendResponse({ok:true, silinen:silinen, kalan:temiz.length});
      setTimeout(function(){
        tamSync(function(){ console.log('[ARAÇRADAR] Aktif kontrol sonrası sync'); });
      }, 2000);
    };
  });
}

  if (msg.action === 'tumunuSil') {
    // Hemen cevap ver — GitHub işlemi arka planda devam eder
    sendResponse({ok:true});
    dbAc(function(db) {
      if (!db) return;
      var tx = db.transaction('ilanlar', 'readwrite');
      tx.objectStore('ilanlar').clear();
      tx.oncomplete = function() {
        console.log('[ARACRADAR] Tum ilanlar silindi');
        // GitHub sıfırla
        var bosData = {toplam:0, guncelleme:Date.now(), versiyon:3, parca_sayisi:1, parcalar:['data/ilanlar_0.json']};
        ghGetSha('data/ilanlar_0.json', function(sha) {
          ghPut('data/ilanlar_0.json', '[]', 'Veri sifirlandı', sha, function(ok) {
            console.log('[ARAÇRADAR] ilanlar_0.json sıfırlandı:', ok);
            ghGetSha('data/meta.json', function(sha2) {
              ghPut('data/meta.json', JSON.stringify(bosData,null,2), 'Meta sifirlandı', sha2, function(ok2) {
                console.log('[ARAÇRADAR] GitHub tamamen sıfırlandı:', ok2);
              });
            });
          });
        });
      };
    });
    return false;
  }
  if (msg.action === 'gecersizSil') {
    dbOku(function(veri) {
      if (!veri) { sendResponse({ok:true, silinen:0}); return; }
      var temiz = veri.filter(function(il) {
        var url = il.url || '';
        if (url.includes('help.letgo') || url.includes('/hc/tr/') || url.includes('/hc/en/')) return false;
        if (url.includes('redirectedItem=true') || url.includes('_c157')) return false;
        if (!il.fiyat || il.fiyat < 1000) return false;
        return true;
      });
      var silinen = veri.length - temiz.length;
      if (!silinen) { sendResponse({ok:true, silinen:0}); return; }
      dbAc(function(db) {
        var tx = db.transaction('ilanlar','readwrite');
        var st = tx.objectStore('ilanlar');
        st.clear();
        temiz.forEach(function(il){ st.put(il); });
        tx.oncomplete = function() {
          console.log('[ARAÇRADAR] Geçersiz silindi:', silinen);
          sendResponse({ok:true, silinen:silinen});
          setTimeout(function(){ tamSync(function(){}); }, 2000);
        };
      });
    });
    return true;
  }
if(msg.action==='durumAl'){
    var sc = tarama.siteSayac || {};
    sendResponse({
      aktif: tarama.aktif || false,
      eklenen: tarama.eklenen || 0,
      guncellenen: tarama.guncellenen || 0,
      siteSayac: sc,
      dbToplam: 0 // panel ayrıca güncelleyecek
    });
    return true;
  }
if(msg.action==='veriAl'){
    chrome.storage.local.get([AYAR_KEY,BLD_KEY,OTARAMA_KEY],function(r){
      dbOku(function(veri){
        var ay={};try{if(r[AYAR_KEY])ay=JSON.parse(r[AYAR_KEY]);}catch(e){}
        var bld=[];try{if(r[BLD_KEY])bld=JSON.parse(r[BLD_KEY]);}catch(e){}
        var ot={};try{if(r[OTARAMA_KEY])ot=JSON.parse(r[OTARAMA_KEY]);}catch(e){}
        sendResponse({veri:veri,ayarlar:ay,tarama:tarama,bildirimSayisi:bld.filter(function(b){return !b.okundu;}).length,otarama:ot});
      });
    });
    return true;
  }
  if(msg.action==='taramaDurumu'){
    if(tarama.aktif && !Object.keys(tarama.siteSayac||{}).length){
      chrome.storage.local.get(['tarama_sc','tarama_ul'],function(r){
        try{if(r.tarama_sc)tarama.siteSayac=JSON.parse(r.tarama_sc);}catch(e){}
        try{if(r.tarama_ul)tarama.urlListesi=JSON.parse(r.tarama_ul);}catch(e){}
        sendResponse({tarama:tarama});
      });
      return true;
    }
    sendResponse({tarama:tarama});return true;
  }
  if(msg.action==='firebaseCek'){
    firebaseCek(function(r){
      var yeni = r && r.yeni ? r.yeni : 0;
      sendResponse({ok: r && r.ok, yeni: yeni});
    });
    return true;
  }
  if(msg.action==='dbSayisiAl'){
    dbAc(function(db){
      if(!db){sendResponse({sayi:0});return;}
      var tx=db.transaction('ilanlar','readonly');
      var st=tx.objectStore('ilanlar');
      var req=st.count();
      req.onsuccess=function(){sendResponse({sayi:req.result||0});};
      req.onerror=function(){sendResponse({sayi:0});};
    });
    return true;
  }
  if(msg.action==='bildirimSesAyarla'){
    self._bildirimSessiz = !msg.aktif;
    chrome.storage.local.set({bildirim_ses: msg.aktif});
    sendResponse({ok:true}); return true;
  }
  if(msg.action==='taramaDurdur'){tarama.aktif=false;taramaStorageKaydet();taramaDurumYaz('durduruldu');keepAliveDurdur();
  chrome.storage.local.remove(['tarama_aktif','tarama_ayarlar']);sendResponse({ok:true});return true;}
  if(msg.action==='taramaAralikGuncelle'){tarama.aralik=msg.aralik||tarama.aralik;sendResponse({ok:true});return true;}
  if(msg.action==='siteDurdur'){
    // Tek bir sitenin taramasını bitmiş say — döngüsü kendinilkinleştirir
    var _sd=msg.site;
    if(tarama.siteSayac){
      Object.keys(tarama.siteSayac).forEach(function(k){
        if((tarama.siteSayac[k].site||k)===_sd) tarama.siteSayac[k].bitti=true;
      });
    }
    taramaStorageKaydet();
    sendResponse({ok:true});return true;
  }
  if(msg.action==='siteBeklet'){siteBekleme[msg.site]=true;sendResponse({ok:true});return true;}
  if(msg.action==='siteAralikGuncelle'){
    if(tarama.siteSayac&&tarama.siteSayac[msg.site]){
      tarama.siteSayac[msg.site].aralik=msg.aralik;
    }
    sendResponse({ok:true});return true;
  }
  if(msg.action==='siteDevam'){siteBekleme[msg.site]=false;sendResponse({ok:true});return true;}
  if(msg.action==='devamEt'){
    if(tarama.aktif && tarama.bekliyor){
      tarama.bekliyor=false;
      var cbs = tarama._devamCbList || [];
      tarama._devamCbList = [];
      cbs.forEach(function(cb){ try{cb();}catch(e){} });
    }
    sendResponse({ok:true,aktif:tarama.aktif});
    return true;
  }
  if(msg.action==='otaramaBaslat'){if(tarama.aktif){sendResponse({ok:false});return true;}baslatTarama(msg.ayarlar);sendResponse({ok:true});return true;}
  if(msg.action==='topluTaramaBaslat'){if(tarama.aktif){sendResponse({ok:false});return true;}baslatTarama({urls:[{url:msg.baseUrl,sayfa:msg.bitisSayfa||9999,maxIlan:0}],etiket:msg.etiket||'',aralik:msg.aralik||15000});sendResponse({ok:true});return true;}
  if(msg.action==='ilanlarKaydet'){dbEkle(msg.ilanlar||[],msg.etiket||'',function(r){sendResponse(r);});return true;}
  if(msg.action==='ayarKaydet'){chrome.storage.local.set({[AYAR_KEY]:JSON.stringify(msg.ayarlar)},function(){ghAyarYukle();sendResponse({ok:true});});return true;}
  if(msg.action==='otaramaKaydet'){chrome.storage.local.set({[OTARAMA_KEY]:JSON.stringify(msg.ayarlar)},function(){alarmKur();ghAyarYukle();sendResponse({ok:true});});return true;}
  if(msg.action==='veriIndir'){
    dbOku(function(veri){
      var ts=new Date().toISOString().slice(0,10);
      var ic=JSON.stringify({veri:veri,yedekTarihi:Date.now(),versiyon:2},null,2);
      // Kaydedilmiş klasörü kontrol et
      chrome.storage.local.get(['yedekKlasor'], function(r){
        var klasor = r.yedekKlasor || 'AracRadar-Yedek';
        var dosyaAdi = klasor + '/aracradar-yedek.json';
        chrome.downloads.download({
          url:'data:application/json;charset=utf-8,'+encodeURIComponent(ic),
          filename: dosyaAdi,
          saveAs: false
        }, function(id){
          if(chrome.runtime.lastError){
            // Klasör bulunamazsa masaüstüne kaydet
            chrome.downloads.download({url:'data:application/json;charset=utf-8,'+encodeURIComponent(ic),filename:'aracradar-yedek-'+ts+'.json',saveAs:true},function(){});
          }
          sendResponse({ok:true,sayi:veri.length});
        });
      });
    });
    return true;
  }
  if(msg.action==='yedekKlasorAyarla'){
    chrome.storage.local.set({yedekKlasor: msg.klasor}, function(){
      sendResponse({ok:true});
    });
    return true;
  }
  if(msg.action==='veriyukle'){dbYaz(msg.veri||[],function(){sendResponse({ok:true});});return true;}
  if(msg.action==='veriTemizle'){dbYaz([],function(){sendResponse({ok:true});});return true;}
  if(msg.action==='tamSync'){tamSync(function(){sendResponse({ok:true});});return true;}
  if(msg.action==='listeyiGetir'){dbOku(function(veri){sendResponse({ok:true,veri:veri});});return true;}

  if(msg.action==='karsilastirmaAra'){
    var araUrl=msg.url;
    if(!araUrl){sendResponse({ok:false,ilanlar:[]});return true;}
    chrome.tabs.create({url:araUrl,active:false},function(tab){
      if(chrome.runtime.lastError||!tab){sendResponse({ok:false,ilanlar:[]});return;}
      var tabId=tab.id;
      function bekle(d){
        if(d>20){try{chrome.tabs.remove(tabId);}catch(e){}sendResponse({ok:false,ilanlar:[]});return;}
        chrome.tabs.get(tabId,function(t){
          if(chrome.runtime.lastError||!t){sendResponse({ok:false,ilanlar:[]});return;}
          if(t.status!=='complete'){setTimeout(function(){bekle(d+1);},800);return;}
          chrome.tabs.sendMessage(tabId,{action:'ilanlarAl',etiket:'karsilastirma'},function(resp){
            try{chrome.tabs.remove(tabId);}catch(e){}
            if(chrome.runtime.lastError||!resp){sendResponse({ok:false,ilanlar:[]});return;}
            sendResponse({ok:true,ilanlar:resp.ilanlar||[]});
          });
        });
      }
      setTimeout(function(){bekle(0);},3000);
    });
    return true;
  }

  if(msg.action==='ilanDetayCek'){
    var url=msg.url;
    if(!url){sendResponse({ok:false});return true;}
    // Önce IndexedDB'de ara — ama marka+model ikisi de doluysa kullan, yoksa siteye git
    dbOku(function(veri){
      var mevcut=veri.find(function(i){return i.url===url||url.indexOf(i.url)!==-1||i.url.indexOf(url)!==-1;});
      var dbYeterli = mevcut && (mevcut.marka||'').length>1 && ((mevcut.seri||mevcut.model||'').length>1);
      if(dbYeterli){
        var fiyat=mevcut.gecmis&&mevcut.gecmis.length?mevcut.gecmis[mevcut.gecmis.length-1].fiyat:0;
        // seri öncelikli — Sahibinden'de gerçek model adı seri alanında
        var modelAd = mevcut.seri||mevcut.model||'';
        sendResponse({ok:true,detay:{marka:mevcut.marka||'',model:modelAd,seri:mevcut.seri||'',yil:mevcut.yil||0,km:mevcut.km||'',fiyat:fiyat,kaynak:mevcut.kaynak||'',yakit:'',vites:''}});
        return;
      }
      // Bulunamadı - sekme aç, ilanı oku
      chrome.tabs.create({url:url,active:false,pinned:false},function(tab){
        if(chrome.runtime.lastError||!tab){sendResponse({ok:false});return;}
        var tabId=tab.id;
        function bekle(deneme){
          if(deneme>15){try{chrome.tabs.remove(tabId);}catch(e){}sendResponse({ok:false});return;}
          chrome.tabs.get(tabId,function(t){
            if(chrome.runtime.lastError||!t){sendResponse({ok:false});return;}
            if(t.status!=='complete'){setTimeout(function(){bekle(deneme+1);},800);return;}
            // Önce content.js inject et, sonra mesaj gönder
            chrome.scripting.executeScript({target:{tabId:tabId},files:['content.js']},function(){
              if(chrome.runtime.lastError){
                // Inject başarısız — doğrudan DOM'dan oku
                chrome.scripting.executeScript({
                  target:{tabId:tabId},
                  func: function(){
                    // Sayfadaki tüm dl/dt/dd ve li/span çiftlerini tara
                    var detay = {marka:'',model:'',yil:0,km:0,fiyat:0,yakit:'',vites:'',sehir:'',renk:'',motor:''};
                    var normalizeYakit = function(r){ var l=r.toLowerCase();
                      if(l.indexOf('benzin')>-1&&l.indexOf('lpg')>-1) return 'Benzin+LPG';
                      if(l.indexOf('dizel')>-1||l.indexOf('diesel')>-1) return 'Dizel';
                      if(l.indexOf('benzin')>-1) return 'Benzin';
                      if(l.indexOf('lpg')>-1) return 'LPG';
                      if(l.indexOf('hibrit')>-1||l.indexOf('hybrid')>-1) return 'Hibrit';
                      if(l.indexOf('elektrik')>-1||l.indexOf('electric')>-1) return 'Elektrik';
                      return r; };
                    var normalizeVites = function(r){ var l=r.toLowerCase();
                      if(l.indexOf('otomatik')>-1||l.indexOf('automatic')>-1) return 'Otomatik';
                      if(l.indexOf('manuel')>-1||l.indexOf('manual')>-1) return 'Manuel';
                      if(l.indexOf('yar')>-1||l.indexOf('semi')>-1) return 'Yarı Otomatik';
                      return r; };
                    // Tüm element çiftlerini tara
                    var all = document.querySelectorAll('*');
                    all.forEach(function(el){
                      var ch = el.children;
                      if(ch.length>=2){
                        var k=ch[0].textContent.trim().toLowerCase();
                        var v=ch[ch.length-1].textContent.trim();
                        if(!v||v.length>80) return;
                        if(k.indexOf('yakıt')>-1||k.indexOf('fuel')>-1) detay.yakit=normalizeYakit(v);
                        else if(k.indexOf('vites')>-1||k.indexOf('gear')>-1||k.indexOf('şanzıman')>-1) detay.vites=normalizeVites(v);
                        else if(k.indexOf('renk')>-1||k.indexOf('color')>-1) detay.renk=v;
                        else if(!detay.sehir&&(k.indexOf('şehir')>-1||k.indexOf('konum')>-1||k.indexOf('il ')===0)) detay.sehir=v;
                      }
                    });
                    // __NEXT_DATA__ de dene
                    try{
                      var nd=document.querySelector('#__NEXT_DATA__');
                      if(nd){
                        var d=JSON.parse(nd.textContent);
                        // Tüm string değerleri recursive tara
                        function taraObj(obj,depth){
                          if(!obj||depth>5) return;
                          if(typeof obj==='object'){
                            Object.keys(obj).forEach(function(k){
                              var kl=k.toLowerCase();
                              var v=obj[k];
                              if(typeof v==='string'&&v.length>0&&v.length<50){
                                if((kl.indexOf('fuel')>-1||kl.indexOf('yakit')>-1||kl.indexOf('yakıt')>-1)&&!detay.yakit) detay.yakit=normalizeYakit(v);
                                if((kl.indexOf('gear')>-1||kl.indexOf('vites')>-1||kl.indexOf('transmission')>-1)&&!detay.vites) detay.vites=normalizeVites(v);
                                if((kl.indexOf('color')>-1||kl.indexOf('renk')>-1)&&!detay.renk) detay.renk=v;
                              }
                              if(typeof v==='object') taraObj(v,depth+1);
                            });
                          }
                        }
                        taraObj(d,0);
                      }
                    }catch(e){}
                    return detay;
                  }
                },function(results){
                  try{chrome.tabs.remove(tabId);}catch(e){}
                  if(chrome.runtime.lastError||!results||!results[0]){sendResponse({ok:false});return;}
                  sendResponse({ok:true,detay:results[0].result||{}});
                });
                return;
              }
              // content.js inject edildi — mesaj gönder
              setTimeout(function(){
                chrome.tabs.sendMessage(tabId,{action:'ilanDetayAl'},function(resp){
                  try{chrome.tabs.remove(tabId);}catch(e){}
                  if(chrome.runtime.lastError||!resp){sendResponse({ok:false});return;}
                  sendResponse({ok:true,detay:resp});
                });
              },1500);
            });
          });
        }
        setTimeout(function(){bekle(0);},3000);
      });
    });
    return true;
  }
});

// ── Benzer İlan Ara ───────────────────────────────────────────────────────────
// msg.action === 'benzerAra'
// msg.kriterler = { marka, model, yilMin, yilMax, kmMin, kmMax, yakit, vites, sehir, siteler:['sahibinden','arabam','letgo'] }
// Sonuç: { ok, ilanlar: [{url,ad,fiyat,yil,km,kaynak}] }
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse){
  if(msg.action !== 'benzerAra') return;
  var k = msg.kriterler || {};
  var siteler = k.siteler && k.siteler.length ? k.siteler : ['sahibinden','arabam'];
  var sonuclar = [];
  var biten = 0;

  function siteUrlOlustur(site){
    var marka = (k.marka||'').toLowerCase().replace(/\s+/g,'-').replace(/[çÇ]/g,'c').replace(/[şŞ]/g,'s').replace(/[ğĞ]/g,'g').replace(/[üÜ]/g,'u').replace(/[öÖ]/g,'o').replace(/[ıİ]/g,'i');
    var model = (k.model||'').toLowerCase().replace(/\s+/g,'-').replace(/[çÇ]/g,'c').replace(/[şŞ]/g,'s').replace(/[ğĞ]/g,'g').replace(/[üÜ]/g,'u').replace(/[öÖ]/g,'o').replace(/[ıİ]/g,'i');
    if(site==='sahibinden'){
      // https://www.sahibinden.com/satilik-toyota-corolla?query_city_ids=&a17_min=2018&a17_max=2022
      var base = 'https://www.sahibinden.com/satilik';
      if(marka) base += '-'+marka;
      if(model) base += '-'+model;
      base += '?';
      if(k.yilMin) base += 'a17_min='+k.yilMin+'&';
      if(k.yilMax) base += 'a17_max='+k.yilMax+'&';
      if(k.kmMin)  base += 'a8_min='+k.kmMin+'&';
      if(k.kmMax)  base += 'a8_max='+k.kmMax+'&';
      if(k.yakit){
        var yakitMap={'Benzin':'1','Dizel':'3','LPG':'2','Hibrit':'8','Elektrik':'5'};
        if(yakitMap[k.yakit]) base += 'a4='+yakitMap[k.yakit]+'&';
      }
      return base;
    }
    if(site==='arabam'){
      // https://www.arabam.com/ikinci-el/otomobil/toyota-corolla?minYear=2018&maxYear=2022
      var base2 = 'https://www.arabam.com/ikinci-el/otomobil';
      if(marka) base2 += '/'+marka;
      if(model) base2 += '-'+model;
      base2 += '?';
      if(k.yilMin) base2 += 'minYear='+k.yilMin+'&';
      if(k.yilMax) base2 += 'maxYear='+k.yilMax+'&';
      if(k.kmMin)  base2 += 'minKm='+k.kmMin+'&';
      if(k.kmMax)  base2 += 'maxKm='+k.kmMax+'&';
      return base2;
    }
    if(site==='letgo'){
      var q = [k.marka,k.model].filter(Boolean).join(' ');
      return 'https://www.letgo.com/tr-tr/ilan-liste/otomobiller?q='+encodeURIComponent(q);
    }
    return null;
  }

  function siteTaraVeAl(site, cb){
    var url = siteUrlOlustur(site);
    if(!url){cb([]);return;}
    chrome.tabs.create({url:url, active:false, pinned:true}, function(tab){
      if(chrome.runtime.lastError||!tab){cb([]);return;}
      var tabId = tab.id, deneme=0, tamam=false;
      function bekle(){
        if(tamam) return;
        if(deneme++>30){tamam=true;try{chrome.tabs.remove(tabId);}catch(e){}cb([]);return;}
        chrome.tabs.get(tabId, function(t){
          if(chrome.runtime.lastError||!t){tamam=true;cb([]);return;}
          if(t.status!=='complete'){setTimeout(bekle,1000);return;}
          try{
            chrome.scripting.executeScript({target:{tabId:tabId},files:['content.js']},function(){
              setTimeout(function(){
                if(tamam)return;
                chrome.tabs.sendMessage(tabId,{action:'ilanlarAl',etiket:'benzer'},function(resp){
                  tamam=true;
                  try{chrome.tabs.remove(tabId);}catch(e){}
                  if(chrome.runtime.lastError||!resp){cb([]);return;}
                  cb(resp.ilanlar||[]);
                });
              },2000);
            });
          }catch(e){setTimeout(bekle,1000);}
        });
      }
      setTimeout(bekle,4000);
    });
  }

  siteler.forEach(function(site, idx){
    setTimeout(function(){
      siteTaraVeAl(site, function(ilanlar){
        ilanlar.forEach(function(il){
          il.kaynak = il.kaynak || site;
          sonuclar.push(il);
        });
        biten++;
        if(biten >= siteler.length){
          // Fiyata göre sırala
          sonuclar.sort(function(a,b){return (a.fiyat||0)-(b.fiyat||0);});
          sendResponse({ok:true, ilanlar:sonuclar});
        }
      });
    }, idx * 3000);
  });
  return true; // async
});
