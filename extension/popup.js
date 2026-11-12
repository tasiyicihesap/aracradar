// Chrome/Edge cross-browser uyumluluk
if (typeof globalThis !== 'undefined' && typeof globalThis.chrome === 'undefined' && typeof browser !== 'undefined') { globalThis.chrome = browser; }

var toggle = document.getElementById('toggle-aktif');
var durumEl = document.getElementById('durum');
var btnTarama = document.getElementById('btn-tarama');
var btnDur = document.getElementById('btn-dur');
var otDurumEl = document.getElementById('otarama-durum');

// ——— Ayarları yükle ———
function ayarlariYukle() {
  chrome.storage.local.get(['ot_urls', 'ot_etiket', 'ot_periyot', 'ot_aralik_sb', 'ot_aralik_ar', 'ot_aralik_lg', 'sb_aralik', 'bildirim_ses'], function(r) {
    // Site URL'leri
    var urls = r.ot_urls || {};
    _sv('ot-url-sb',  urls.sb_url  || 'https://www.sahibinden.com/kategori/otomobil');
    _sv('ot-sayfa-sb', urls.sb_sayfa || 100);
    _sv('ot-url-ar',  urls.ar_url  || 'https://www.arabam.com/ikinci-el/otomobil');
    _sv('ot-sayfa-ar', urls.ar_sayfa || 50);
    _sv('ot-url-lg',  urls.lg_url  || 'https://www.letgo.com/arabalar_c15706');
    _sv('ot-sayfa-lg', urls.lg_sayfa || 50);
    // Aralıklar
    _selectVal('ot-aralik-sb', r.ot_aralik_sb || 210);
    _selectVal('ot-aralik-ar', r.ot_aralik_ar || 90);
    _selectVal('ot-aralik-lg', r.ot_aralik_lg || 90);
    // Ortak
    _sv('ot-etiket', r.ot_etiket || 'Otomobil');
    _selectVal('ot-periyot', r.ot_periyot || 30);
    // Manuel aralik
    _selectVal('inp-aralik', r.sb_aralik || 10);
    // Bildirim sesi toggle
    var sesToggle = document.getElementById('toggle-bildirim-ses');
    if (sesToggle) sesToggle.checked = r.bildirim_ses !== false; // varsayılan: açık
  });
}

function _sv(id, v) { var el = document.getElementById(id); if (el && v !== undefined) el.value = v; }
function _gv(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
function _gi(id, def) { return parseInt(_gv(id)) || def; }
function _selectVal(id, v) {
  var sel = document.getElementById(id);
  if (!sel) return;
  for (var i = 0; i < sel.options.length; i++) {
    if (parseInt(sel.options[i].value) === parseInt(v)) { sel.selectedIndex = i; break; }
  }
}

// ——— İlerleme güncelle (site bazlı) ———
function progGuncelle(tarama) {
  if (!tarama || !tarama.aktif) {
    ['sb','ar','lg','manuel'].forEach(function(k){
      var w = document.getElementById('prog-'+k+'-wrap');
      if (w) w.style.display = 'none';
    });
    return;
  }
  var site = tarama.site || (tarama.tip === 'otomatik' ? 'sb' : 'manuel');
  var pct = tarama.toplamSayfa > 0 ? Math.round((tarama.sayfa / tarama.toplamSayfa) * 100) : 0;
  var wrap = document.getElementById('prog-'+site+'-wrap');
  var pctEl = document.getElementById('prog-'+site+'-pct');
  var txtEl = document.getElementById('prog-'+site+'-txt');
  var barEl = document.getElementById('prog-'+site+'-bar');
  if (wrap) wrap.style.display = 'block';
  if (pctEl) pctEl.textContent = pct + '%';
  if (txtEl) txtEl.textContent = tarama.sayfa + '/' + tarama.toplamSayfa + ' sayfa · +' + (tarama.eklenen||0) + ' yeni';
  if (barEl) barEl.style.width = pct + '%';
}

// ——— Ana güncelleme ———
function guncelle() {
  chrome.runtime.sendMessage({ action: 'veriAl' }, function(r) {
    if (chrome.runtime.lastError) return;
    var veri = (r && r.veri) ? r.veri : [];
    var ayarlar = (r && r.ayarlar) ? r.ayarlar : { aktif: true };
    var tarama = (r && r.tarama) ? r.tarama : { aktif: false };

    toggle.checked = ayarlar.aktif !== false;
    progGuncelle(tarama);

    if (tarama.aktif) {
      var tip = tarama.tip === 'otomatik' ? '🔄 Otomatik' : '▶ Manuel';
      durumEl.className = 'durum tarama';
      durumEl.innerHTML = tip + ' tarama: <b>' + (tarama.etiket||'') + '</b><br>' + tarama.sayfa + '/' + tarama.toplamSayfa + ' sayfa · +' + (tarama.eklenen||0) + ' yeni · ' + (tarama.guncellenen||0) + ' güncellendi';
      btnTarama.style.display = 'none';
      btnDur.style.display = 'block';
    } else {
      btnTarama.style.display = 'block';
      btnDur.style.display = 'none';

      if (!ayarlar.aktif) {
        durumEl.className = 'durum kapali';
        durumEl.innerHTML = '⏸ Tarama durduruldu · ' + veri.length + ' ilan';
      } else {
        var dt=0, dy=0;
        veri.forEach(function(i) {
          if(i.gecmis&&i.gecmis.length>=2) {
            var f = i.gecmis[i.gecmis.length-1].fiyat - i.gecmis[i.gecmis.length-2].fiyat;
            if(f<0) dt++; else if(f>0) dy++;
          }
        });
        durumEl.className = 'durum ok';
        var html = '<b>' + veri.length + ' ilan</b> takip ediliyor';
        if (dt) html += ' · 🟢 ' + dt + ' düştü';
        if (dy) html += ' · 🔴 ' + dy + ' arttı';
        if (r && r.bildirimSayisi) html += '<br><span id="bld-link" style="color:#0C447C;font-size:11px;cursor:pointer">🔔 ' + r.bildirimSayisi + ' yeni fiyat düşüşü →</span>';
        if (!veri.length) html = 'Sahibinden.com\'u açın veya toplu tara.';
        durumEl.innerHTML = html;
        var bldLink = document.getElementById('bld-link');
        if (bldLink) bldLink.addEventListener('click', function(){
          chrome.windows.create({ url: chrome.runtime.getURL('bildirim.html'), type:'popup', width:400, height:500, focused:true });
        });
      }
    }
  });
}

// ——— Toggle ———
toggle.addEventListener('change', function() {
  chrome.runtime.sendMessage({ action: 'ayarKaydet', ayarlar: { aktif: toggle.checked } });
  setTimeout(guncelle, 100);
});

// ——— Bireysel Tara butonları ———
function tekSiteTara(site) {
  var urlId = 'ot-url-' + site;
  var sayfaId = 'ot-sayfa-' + site;
  var aralikId = 'ot-aralik-' + site;
  var siteSiteler = { sb: 'sahibinden', ar: 'arabam', lg: 'letgo' };
  var url = _gv(urlId);
  if (!url) { alert('URL boş!'); return; }
  var sayfa = _gi(sayfaId, 50);
  var aralikSn = _gi(aralikId, 90);
  var etiket = _gv('ot-etiket') || 'Otomobil';
  var siteName = siteSiteler[site] || site;
  chrome.runtime.sendMessage({
    action: 'topluTaramaBaslat',
    baseUrl: url,
    etiket: etiket,
    basSayfa: 1,
    bitisSayfa: sayfa,
    toplamSayfa: sayfa,
    aralik: aralikSn * 1000,
    site: site
  }, function() {
    var wrap = document.getElementById('prog-'+site+'-wrap');
    if (wrap) {
      wrap.style.display = 'block';
      var txt = document.getElementById('prog-'+site+'-txt');
      if (txt) txt.textContent = 'Başlatılıyor...';
    }
  });
  // Kaydet
  chrome.storage.local.get(['ot_urls'], function(r) {
    var urls = r.ot_urls || {};
    urls[site+'_url'] = url;
    urls[site+'_sayfa'] = sayfa;
    var saveObj = { ot_urls: urls };
    saveObj['ot_aralik_' + site] = aralikSn;
    chrome.storage.local.set(saveObj);
  });
  setTimeout(function(){ var iv=setInterval(guncelle,2000); setTimeout(function(){clearInterval(iv);},600000); }, 500);
}

document.getElementById('btn-tara-sb').addEventListener('click', function() { tekSiteTara('sb'); });
document.getElementById('btn-tara-ar').addEventListener('click', function() { tekSiteTara('ar'); });
document.getElementById('btn-tara-lg').addEventListener('click', function() { tekSiteTara('lg'); });

// ——— Toplu Tara (3 Site) ———
document.getElementById('btn-toplu-tara').addEventListener('click', function() {
  var urlSb = _gv('ot-url-sb'), urlAr = _gv('ot-url-ar'), urlLg = _gv('ot-url-lg');
  var etiket = _gv('ot-etiket') || 'Otomobil';
  if (!urlSb && !urlAr && !urlLg) { alert('En az bir URL girin.'); return; }
  var sites = [];
  if (urlSb) sites.push({ url: urlSb, sayfa: _gi('ot-sayfa-sb',100), aralik: _gi('ot-aralik-sb',210)*1000, site:'sb' });
  if (urlAr) sites.push({ url: urlAr, sayfa: _gi('ot-sayfa-ar',50),  aralik: _gi('ot-aralik-ar',90)*1000,  site:'ar' });
  if (urlLg) sites.push({ url: urlLg, sayfa: _gi('ot-sayfa-lg',50),  aralik: _gi('ot-aralik-lg',90)*1000,  site:'lg' });
  // İlk siteyi hemen başlat, diğerlerini sıraya al
  chrome.runtime.sendMessage({
    action: 'topluTaramaBaslat',
    baseUrl: sites[0].url,
    etiket: etiket,
    basSayfa: 1,
    bitisSayfa: sites[0].sayfa,
    toplamSayfa: sites[0].sayfa,
    aralik: sites[0].aralik,
    site: sites[0].site,
    sraSiteler: sites.slice(1)
  });
  sites.forEach(function(s) {
    var wrap = document.getElementById('prog-'+s.site+'-wrap');
    if (wrap) {
      wrap.style.display = 'block';
      var txt = document.getElementById('prog-'+s.site+'-txt');
      if (txt) txt.textContent = s.site === sites[0].site ? 'Başlatılıyor...' : 'Sırada bekliyor...';
    }
  });
  setTimeout(function(){ var iv=setInterval(guncelle,2000); setTimeout(function(){clearInterval(iv);},1800000); }, 500);
});

// ——— Kaydet & Otarama ———
document.getElementById('btn-ot-kaydet').addEventListener('click', function() {
  var urlSb = _gv('ot-url-sb'), urlAr = _gv('ot-url-ar'), urlLg = _gv('ot-url-lg');
  var etiket = _gv('ot-etiket') || 'Genel';
  var periyot = _gi('ot-periyot', 30);
  if (!urlSb && !urlAr && !urlLg) { alert('En az bir URL girin.'); return; }
  var urls = {};
  if (urlSb) { urls.sb_url = urlSb; urls.sb_sayfa = _gi('ot-sayfa-sb',100); }
  if (urlAr) { urls.ar_url = urlAr; urls.ar_sayfa = _gi('ot-sayfa-ar',50); }
  if (urlLg) { urls.lg_url = urlLg; urls.lg_sayfa = _gi('ot-sayfa-lg',50); }
  chrome.storage.local.set({
    ot_urls: urls,
    ot_etiket: etiket,
    ot_periyot: periyot,
    ot_aralik_sb: _gi('ot-aralik-sb',210),
    ot_aralik_ar: _gi('ot-aralik-ar',90),
    ot_aralik_lg: _gi('ot-aralik-lg',90)
  }, function() {
    // Otarama ayarlarını arka plana ilet
    var urlArr = [];
    if (urlSb) urlArr.push({ url: urlSb, sayfa: _gi('ot-sayfa-sb',100), aralik: _gi('ot-aralik-sb',210)*1000, site:'sb' });
    if (urlAr) urlArr.push({ url: urlAr, sayfa: _gi('ot-sayfa-ar',50),  aralik: _gi('ot-aralik-ar',90)*1000,  site:'ar' });
    if (urlLg) urlArr.push({ url: urlLg, sayfa: _gi('ot-sayfa-lg',50),  aralik: _gi('ot-aralik-lg',90)*1000,  site:'lg' });
    var otAyar = {
      baseUrl: urlSb || urlAr || urlLg,
      urls: urlArr,
      etiket: etiket,
      toplamSayfa: _gi('ot-sayfa-sb',100),
      aralik: _gi('ot-aralik-sb',210) * 1000,
      periyot: periyot
    };
    chrome.runtime.sendMessage({ action: 'otaramaKaydet', ayarlar: otAyar }, function() {
      chrome.runtime.sendMessage({ action: 'otaramaBaslat', ayarlar: otAyar });
      otDurumEl.style.display = 'block';
      otDurumEl.textContent = '✓ Otomatik tarama kaydedildi · ' + periyot + ' dk\'da bir';
      setTimeout(guncelle, 500);
    });
  });
});

// ——— Otaramayı sil ———
document.getElementById('btn-ot-sil').addEventListener('click', function() {
  if (!confirm('Otomatik tarama iptal edilsin mi?')) return;
  chrome.runtime.sendMessage({ action: 'otaramaKaydet', ayarlar: {} });
  otDurumEl.style.display = 'none';
  setTimeout(guncelle, 100);
});

// ——— Manuel Toplu Tara ———
document.getElementById('btn-tarama').addEventListener('click', function() {
  var url = document.getElementById('inp-url').value.trim();
  var etiket = document.getElementById('inp-etiket').value.trim() || 'Genel';
  var bas = parseInt(document.getElementById('inp-bas').value) || 1;
  var bitis = parseInt(document.getElementById('inp-bitis').value) || 10;
  var aralikSn = parseInt(document.getElementById('inp-aralik').value) || 10;
  chrome.storage.local.set({ sb_aralik: aralikSn });

  function baslatTarama(baseUrl) {
    chrome.runtime.sendMessage({
      action: 'topluTaramaBaslat', baseUrl: baseUrl, etiket: etiket,
      basSayfa: bas, bitisSayfa: bitis, toplamSayfa: bitis-bas+1, aralik: aralikSn*1000, site: 'manuel'
    });
    var wrap = document.getElementById('prog-manuel-wrap');
    if (wrap) {
      wrap.style.display = 'block';
      var txt = document.getElementById('prog-manuel-txt');
      if (txt) txt.textContent = 'Başlıyor... ~' + Math.round(((bitis-bas+1)*aralikSn)/60) + ' dk';
    }
    setTimeout(function(){ var iv=setInterval(guncelle,2000); setTimeout(function(){clearInterval(iv);},600000); }, 500);
  }

  if (!url) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      var tu = tabs && tabs[0] ? tabs[0].url : '';
      if (tu.indexOf('sahibinden.com')!==-1||tu.indexOf('arabam.com')!==-1||tu.indexOf('letgo.com')!==-1) {
        baslatTarama(tu.split('?')[0]);
      } else {
        alert('URL girin veya Sahibinden/Arabam.com/Letgo sayfasını açın.');
      }
    });
  } else { baslatTarama(url); }
});

document.getElementById('btn-dur').addEventListener('click', function() {
  chrome.runtime.sendMessage({ action: 'taramaDurdur' });
  setTimeout(guncelle, 300);
});

// ——— Paneli Aç ———
document.getElementById('btn-panel').addEventListener('click', function() {
  // Zaten açık sekme var mı kontrol et
  chrome.tabs.query({}, function(tabs) {
    var panelUrl = chrome.runtime.getURL('panel.html');
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].url && tabs[i].url.indexOf('panel.html') !== -1) {
        chrome.tabs.update(tabs[i].id, { active: true });
        chrome.windows.update(tabs[i].windowId, { focused: true });
        return;
      }
    }
    // Yeni sekme olarak aç (tam ekran, tüm özellikler erişilebilir)
    chrome.tabs.create({ url: panelUrl });
  });
});

// ——— Bildirim sesi toggle ———
var sesToggle = document.getElementById('toggle-bildirim-ses');
if (sesToggle) {
  sesToggle.addEventListener('change', function() {
    chrome.storage.local.set({ bildirim_ses: sesToggle.checked }, function() {
      // Background'a da haber ver
      chrome.runtime.sendMessage({ action: 'bildirimSesAyarla', aktif: sesToggle.checked });
    });
  });
}

// ——— Başlangıç ———
ayarlariYukle();
guncelle();
setInterval(guncelle, 3000);
