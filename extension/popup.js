// Chrome/Edge cross-browser uyumluluk
if (typeof globalThis !== 'undefined' && typeof globalThis.chrome === 'undefined' && typeof browser !== 'undefined') { globalThis.chrome = browser; }

var toggle = document.getElementById('toggle-aktif');
var durumEl = document.getElementById('durum');
var progressEl = document.getElementById('progress');
var progTxt = document.getElementById('prog-txt');
var progBar = document.getElementById('prog-bar');
var btnTarama = document.getElementById('btn-tarama');
var btnDur = document.getElementById('btn-dur');
var otDurumEl = document.getElementById('otarama-durum');

function guncelle() {
  chrome.runtime.sendMessage({ action: 'veriAl' }, function(r) {
    if (chrome.runtime.lastError) return;
    var veri = (r && r.veri) ? r.veri : [];
    var ayarlar = (r && r.ayarlar) ? r.ayarlar : { aktif: true };
    var tarama = (r && r.tarama) ? r.tarama : { aktif: false };
    var ot = (r && r.otarama) ? r.otarama : {};

    toggle.checked = ayarlar.aktif !== false;

    // Otomatik tarama durumu
    if (ot && ot.baseUrl) {
      otDurumEl.style.display = 'block';
      otDurumEl.innerHTML = '⏰ Saatlik tarama aktif: <b>' + (ot.etiket||'') + '</b> · ' + (ot.toplamSayfa||0) + ' sayfa';
      // Eski tek URL alanı yerine yeni 3 site alanları
      var urls = ot.urls || [];
      var sb = urls.find(function(u){ return u && u.site==='sahibinden'; }) || {};
      var ar = urls.find(function(u){ return u && u.site==='arabam'; }) || {};
      var lg = urls.find(function(u){ return u && u.site==='letgo'; }) || {};
      function _sv(id, v) { var el=document.getElementById(id); if(el&&v!==undefined) el.value=v; }
      _sv('ot-url-sb',       sb.url   || ot.baseUrl || '');
      _sv('ot-sayfa-sb',     sb.sayfa || ot.toplamSayfa || 100);
      _sv('ot-url-ar',       ar.url   || '');
      _sv('ot-url-ar-sayfa', ar.sayfa || 50);
      _sv('ot-url-lg',       lg.url   || '');
      _sv('ot-url-lg-sayfa', lg.sayfa || 50);
      _sv('ot-etiket',       ot.etiket || '');
    } else {
      otDurumEl.style.display = 'none';
    }

    if (tarama.aktif) {
      var pct = tarama.toplamSayfa > 0 ? Math.round((tarama.sayfa / tarama.toplamSayfa) * 100) : 0;
      var tip = tarama.tip === 'otomatik' ? '🔄 Otomatik' : '▶ Manuel';
      durumEl.className = 'durum tarama';
      durumEl.innerHTML = tip + ' tarama: <b>' + (tarama.etiket||'') + '</b><br>' + tarama.sayfa + '/' + tarama.toplamSayfa + ' sayfa · +' + tarama.eklenen + ' yeni · ' + tarama.guncellenen + ' güncellendi';
      progressEl.style.display = 'block';
      progTxt.textContent = tarama.sayfa + '/' + tarama.toplamSayfa + ' · Toplam ' + veri.length + ' ilan';
      progBar.style.width = pct + '%';
      btnTarama.style.display = 'none';
      btnDur.style.display = 'block';
    } else {
      progressEl.style.display = 'none';
      btnTarama.style.display = 'block';
      btnDur.style.display = 'none';

      if (!ayarlar.aktif) {
        durumEl.className = 'durum kapali';
        durumEl.innerHTML = '⏸ Tarama durduruldu · ' + veri.length + ' ilan';
      } else {
        var dt=0, dy=0;
        veri.forEach(function(i) {
          if(i.gecmis.length<2) return;
          var f = i.gecmis[i.gecmis.length-1].fiyat - i.gecmis[i.gecmis.length-2].fiyat;
          if(f<0) dt++; else if(f>0) dy++;
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

// Toggle
toggle.addEventListener('change', function() {
  chrome.runtime.sendMessage({ action: 'ayarKaydet', ayarlar: { aktif: toggle.checked } });
  setTimeout(guncelle, 100);
});

// Otomatik tarama kaydet & başlat
document.getElementById('btn-ot-kaydet').addEventListener('click', function() {
  function _gv(id){ var el=document.getElementById(id); return el?el.value.trim():''; }
  function _gi(id,def){ return parseInt(_gv(id))||def; }
  var urlSb = _gv('ot-url-sb'), urlAr = _gv('ot-url-ar'), urlLg = _gv('ot-url-lg');
  var etiket = _gv('ot-etiket') || 'Genel';
  var aralik = _gi('ot-aralik', 5);
  var periyot = _gi('ot-periyot', 30);
  if (!urlSb && !urlAr && !urlLg) { alert('En az bir URL girin.'); return; }
  var urls = [];
  if (urlSb) urls.push({ url:urlSb, sayfa:_gi('ot-sayfa-sb',100),     site:'sahibinden' });
  if (urlAr) urls.push({ url:urlAr, sayfa:_gi('ot-url-ar-sayfa',50),  site:'arabam' });
  if (urlLg) urls.push({ url:urlLg, sayfa:_gi('ot-url-lg-sayfa',50),  site:'letgo' });
  var ayarlar = { baseUrl: urlSb||urlAr||urlLg, urls: urls, etiket: etiket, toplamSayfa: _gi('ot-sayfa-sb',100), aralik: aralik*1000, periyot: periyot };
  chrome.runtime.sendMessage({ action: 'otaramaKaydet', ayarlar: ayarlar }, function() {
    chrome.runtime.sendMessage({ action: 'otaramaBaslat', ayarlar: ayarlar });
    setTimeout(guncelle, 500);
  });
});

// Otomatik taramayı sil
document.getElementById('btn-ot-sil').addEventListener('click', function() {
  if (!confirm('Saatlik otomatik tarama iptal edilsin mi?')) return;
  chrome.runtime.sendMessage({ action: 'otaramaKaydet', ayarlar: {} });
  otDurumEl.style.display = 'none';
  setTimeout(guncelle, 100);
});

// Manuel tarama
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
      basSayfa: bas, bitisSayfa: bitis, toplamSayfa: bitis-bas+1, aralik: aralikSn*1000
    });
    var tahmini = Math.round(((bitis-bas+1)*aralikSn)/60);
    progTxt.textContent = 'Başlıyor... ~' + tahmini + ' dakika';
    progressEl.style.display = 'block';
    setTimeout(function(){ var iv=setInterval(guncelle,2000); setTimeout(function(){clearInterval(iv);},600000); }, 500);
  }

  if (!url) {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      var tu=tabs&&tabs[0]?tabs[0].url:'';
      if(tu.indexOf('sahibinden.com')!==-1||tu.indexOf('arabam.com')!==-1||tu.indexOf('letgo.com')!==-1){baslatTarama(tu.split('?')[0]);}else{alert('URL girin veya Sahibinden/Arabam.com/Letgo sayfasını açın.');}
    });
  } else { baslatTarama(url); }
});

document.getElementById('btn-dur').addEventListener('click', function() {
  chrome.runtime.sendMessage({ action: 'taramaDurdur' });
  setTimeout(guncelle, 300);
});

document.getElementById('btn-panel').addEventListener('click', function() {
  chrome.tabs.create({ url: chrome.runtime.getURL('panel.html') });
});

// Son aralik değerini hatırla
chrome.storage.local.get(['sb_aralik'], function(r) {
  if (r.sb_aralik) {
    var sel = document.getElementById('inp-aralik');
    for (var i=0; i<sel.options.length; i++) {
      if (parseInt(sel.options[i].value) === r.sb_aralik) { sel.selectedIndex=i; break; }
    }
  }
});

// Bildirim sesi toggle
var sesToggle = document.getElementById('toggle-bildirim-ses');
if (sesToggle) {
  chrome.storage.local.get(['bildirim_ses'], function(r) {
    sesToggle.checked = r.bildirim_ses !== false; // varsayılan: açık
  });
  sesToggle.addEventListener('change', function() {
    chrome.storage.local.set({ bildirim_ses: sesToggle.checked });
    chrome.runtime.sendMessage({ action: 'bildirimSesAyarla', aktif: sesToggle.checked });
  });
}

guncelle();
setInterval(guncelle, 3000);
