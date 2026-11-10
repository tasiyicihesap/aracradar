// Türkiye 81 ili
var _ILLER = [
  'Adana','Adıyaman','Afyonkarahisar','Ağrı','Amasya','Ankara','Antalya','Artvin',
  'Aydın','Balıkesir','Bilecik','Bingöl','Bitlis','Bolu','Burdur','Bursa',
  'Çanakkale','Çankırı','Çorum','Denizli','Diyarbakır','Edirne','Elazığ','Erzincan',
  'Erzurum','Eskişehir','Gaziantep','Giresun','Gümüşhane','Hakkari','Hatay','Isparta',
  'Mersin','İstanbul','İzmir','Kars','Kastamonu','Kayseri','Kırklareli','Kırşehir',
  'Kocaeli','Konya','Kütahya','Malatya','Manisa','Kahramanmaraş','Mardin','Muğla',
  'Muş','Nevşehir','Niğde','Ordu','Rize','Sakarya','Samsun','Siirt','Sinop',
  'Sivas','Tekirdağ','Tokat','Trabzon','Tunceli','Şanlıurfa','Uşak','Van',
  'Yozgat','Zonguldak','Aksaray','Bayburt','Karaman','Kırıkkale','Batman',
  'Şırnak','Bartın','Ardahan','Iğdır','Yalova','Karabük','Kilis','Osmaniye','Düzce'
];
window._ILLER = _ILLER;

// Chrome/Edge cross-browser uyumluluk
if (typeof globalThis !== 'undefined' && typeof globalThis.chrome === 'undefined' && typeof browser !== 'undefined') { globalThis.chrome = browser; }


// ── Site algıla (content.js içi) ─────────────────────────────────────────────
function siteAlgila() {
  var h = location.hostname || '';
  if (h.indexOf('arabam.com') !== -1) return 'arabam';
  if (h.indexOf('letgo.com')  !== -1) return 'letgo';
  if (h.indexOf('sahibinden.com') !== -1) return 'sahibinden';
  return null;
}

// ── İlan topla - site'ye göre yönlendir ───────────────────────────────────────
function ilanTopla() {
  var site = siteAlgila();
  var sonuc = [];
  if (site === 'sahibinden') sonuc = ilanTopla_sahibinden();
  else if (site === 'arabam')  sonuc = ilanTopla_arabam();
  else if (site === 'letgo')   sonuc = ilanTopla_letgo();
  var s = siteAlgila();
  console.log('[ARAÇRADAR]', s||'?', '→', sonuc.length, 'ilan');
  return sonuc;
}

var AYAR_KEY = 'sb_ayarlar';

function siteAlgila() {
  var h = location.hostname;
  if (h.indexOf('arabam.com') !== -1) return 'arabam';
  if (h.indexOf('letgo.com')  !== -1) return 'letgo';
  return 'sahibinden';
}

// ── SAHİBİNDEN ────────────────────────────────────────────────────────────────
// Gerçek DOM yapısı:
// <tr data-id="XXXX" class="searchResultsItem ...">
//   <td>foto</td>        [0]
//   <td>marka</td>       [1]
//   <td>seri</td>        [2]
//   <td>model</td>       [3]
//   <td>başlık</td>      [4]
//   <td>yıl</td>         [5]
//   <td>km</td>          [6]
//   <td>fiyat</td>       [7]  ← "1.250.000 TL" metni burada
//   <td>tarih</td>       [8]
// </tr>
function ilanTopla_sahibinden() {
  var ilanlar = [];

  // Captcha veya engel tespiti
  var bodyText = document.body.innerText || '';
  // checkLoading = Sahibinden bot koruması devreye girdi
  var isCheckLoading = location.href.indexOf('checkLoading') !== -1 || location.href.indexOf('/cs/') !== -1;
  // Gerçek ilan varsa captcha değil
  var hasIlanlar = document.querySelectorAll('tr[data-id]').length > 0 || 
                   document.querySelectorAll('tr.searchResultsItem').length > 0;
  var isCaptcha = !hasIlanlar && (isCheckLoading ||
                  bodyText.indexOf('id="g-recaptcha"') !== -1 ||
                  document.querySelector('iframe[src*="captcha"]') !== null);
  
  if (isCaptcha) {
    console.warn('[ARAÇRADAR] Sahibinden: Captcha/engel tespit edildi. URL:', location.href);
    // captcha:true ile bildir — background sekmeyi açık tutacak
    return { captcha: true, ilanlar: [], sayi: 0 };
  }

  // data-id'li TR'leri seç — bunlar ilan satırları
  var trler = document.querySelectorAll('tr[data-id]');
  if (!trler.length) {
    trler = document.querySelectorAll('tr.searchResultsItem, tr[class*="classified"], tr[id*="classified"]');
  }
  // Hâlâ bulunamadıysa tüm linkleri dene
  if (!trler.length) {
    // Link bazlı fallback
    var linkler = document.querySelectorAll('a[href*="/ilan/vasita"]');
    linkler.forEach(function(a) {
      var url = a.href.split('?')[0];
      if (!url || url.indexOf('sahibinden.com') === -1) return;
      if (ilanlar.some(function(x){ return x.url === url; })) return;
      var parent = a.closest('tr') || a.parentElement;
      var txt = (parent||a).textContent || '';
      var fm = txt.match(/(\d{1,3}(?:\.\d{3})+)\s*TL/);
      var fiyat = fm ? parseInt(fm[1].replace(/\./g,'')) : 0;
      if (!fiyat || fiyat < 50000) return;
      ilanlar.push({url:url, fiyat:fiyat, ad:a.title||a.textContent.trim().substring(0,100)||'İlan',
        marka:'', seri:'', model:'', yil:0, km:'', sehir:'', kaynak:'sahibinden'});
    });
    return ilanlar;
  }

  for (var i = 0; i < trler.length; i++) {
    var tr = trler[i];

    // URL
    var linkEl = tr.querySelector('a[href*="/ilan/"]');
    if (!linkEl) continue;
    var url = linkEl.href.split('?')[0];
    if (!url || url.indexOf('sahibinden.com') === -1) continue;
    if (ilanlar.some(function(x){ return x.url === url; })) continue;

    var tdler = tr.querySelectorAll('td');
    // TD sayısı az olabilir — esnek ol, min 4 yeterli
    if (tdler.length < 4) continue;

    // Fiyat: Sahibinden yapısı TD[7] = "685.000 TL"
    var fiyat = 0;
    
    // Yöntem 1: TD[7] direkt (en güvenilir)
    if (tdler.length > 7) {
      var td7 = tdler[7].textContent.trim();
      var m1 = td7.match(/(\d[\d.]*)/);
      if (m1) fiyat = parseInt(m1[1].replace(/\./g, ''));
    }
    
    // Yöntem 2: TL/₺ içeren herhangi bir TD
    if (!fiyat || fiyat < 50000) {
      for (var t = tdler.length - 1; t >= 5; t--) {
        var tdT = tdler[t].textContent.trim();
        if (tdT.indexOf('TL') !== -1 || tdT.indexOf('₺') !== -1) {
          var mT = tdT.match(/(\d[\d.]*)/);
          if (mT) {
            var vT = parseInt(mT[1].replace(/\./g, ''));
            if (vT >= 50000 && vT <= 200000000) { fiyat = vT; break; }
          }
        }
      }
    }

    // Yöntem 3: TR metninde "X.XXX.XXX TL" pattern
    if (!fiyat || fiyat < 50000) {
      var trT = tr.textContent || '';
      var mR = trT.match(/(\d{1,3}(?:\.\d{3})+)\s*TL/);
      if (mR) fiyat = parseInt(mR[1].replace(/\./g, ''));
    }

    if (!fiyat || fiyat < 50000) continue;

    // Sahibinden TD yapısı: [0]foto [1]başlık [2]marka [3]seri [4]model [5]yıl [6]km [7]fiyat [8]şehir
    // TD sayısına göre esnek oku
    var n = tdler.length;
    var marka='', seri='', model='', yil=0, kmText='', baslik='';

    if(n >= 9) {
      // Tam yapı
      baslik = tdler[1] ? tdler[1].textContent.trim().substring(0,150) : '';
      marka  = tdler[2] ? tdler[2].textContent.trim() : '';
      seri   = tdler[3] ? tdler[3].textContent.trim() : '';
      model  = tdler[4] ? tdler[4].textContent.trim() : '';
      yil    = parseInt(tdler[5] ? tdler[5].textContent.trim() : '') || 0;
      kmText = tdler[6] ? tdler[6].textContent.trim() : '';
    } else if(n >= 7) {
      // Kısa yapı
      baslik = tdler[1] ? tdler[1].textContent.trim().substring(0,150) : '';
      marka  = tdler[2] ? tdler[2].textContent.trim() : '';
      seri   = tdler[3] ? tdler[3].textContent.trim() : '';
      yil    = parseInt(tdler[4] ? tdler[4].textContent.trim() : '') || 0;
      kmText = tdler[5] ? tdler[5].textContent.trim() : '';
    } else {
      baslik = tr.textContent.trim().substring(0,150);
    }

    // Link title'dan da dene
    if(!baslik || baslik.length < 5) {
      baslik = linkEl.title || linkEl.textContent.trim().substring(0,150) || '';
    }

    var ad = '';
    if(marka || seri || model) {
      ad = [marka, seri, model].filter(Boolean).join(' ');
    }
    if(!ad || ad.length < 3) ad = baslik;
    if(!ad) ad = 'İlan #' + (tr.getAttribute('data-id')||'?');

        // Şehir: Önce Sahibinden class'ından, sonra TD'den
    var sehir = '';
    // Yöntem 1: Sahibinden class tabanlı (en güvenilir)
    var sehirEl = tr.querySelector('.searchResultsLocationValue, [class*="location"], [class*="Location"]');
    if (sehirEl) {
      sehir = sehirEl.textContent.trim().split('/')[0].trim();
    }
    // Yöntem 2: TD'lerden tara
    if (!sehir) {
      for (var ti = tdler.length-1; ti >= 4; ti--) {
        var tdTxt = tdler[ti] ? tdler[ti].textContent.trim() : '';
        if (!tdTxt || tdTxt.length < 2 || tdTxt.length > 40) continue;
        if (tdTxt.match(/^[\d]/) || tdTxt.match(/TL|km|₺|\.|,/i)) continue;
        if (_ILLER.some(function(il){ return tdTxt.toLowerCase().indexOf(il.toLowerCase()) !== -1; })) {
          sehir = tdTxt.split('/')[0].trim();
          break;
        }
      }
    }
    ilanlar.push({
      url: url, fiyat: fiyat,
      ad: ad.substring(0, 200),
      marka: marka, seri: seri, model: model,
      yil: yil, km: kmText,
      sehir: sehir,
      kaynak: 'sahibinden'
    });
  }

  return ilanlar;
}

// ── ARABAM.COM ────────────────────────────────────────────────────────────────
// Next.js app — DOM'da veri var ama klasik selector çalışmaz
// data-testid veya class-based selector dene
function ilanTopla_arabam() {
  var ilanlar = [];

  // Arabam tablo yapısı: tr.listing-list-item
  // TD[1]=başlık, TD[3]=yıl, TD[4]=km, TD[5]=renk, TD[6]=fiyat
  var trler = document.querySelectorAll('tr.listing-list-item');
  console.log('[ARAÇRADAR] Arabam TR sayısı:', trler.length);

  trler.forEach(function(tr) {
    var tdler = tr.querySelectorAll('td');
    if (tdler.length < 7) return;

    // Link
    var linkEl = tr.querySelector('a[href*="/ilan/"]');
    if (!linkEl) return;
    var url = linkEl.href.split('?')[0];
    if (!url) return;

    // Başlık TD[1] — genellikle "Marka Seri Model Özellikler" şeklinde
    var adRaw = (tdler[1] ? tdler[1].textContent.trim() : '') ||
               (tdler[2] ? tdler[2].textContent.trim() : '');
    if (!adRaw) adRaw = linkEl.textContent.trim() || url.split('/').pop().replace(/-/g,' ');
    var ad = adRaw.substring(0, 200);

    // Marka/seri/model — URL'den çıkar: /ilan/sahibinden-satilik-{marka}-{seri}-{model}-...
    var marka='', seri='', model='';
    var urlSlug = url.split('/ilan/').pop() || '';
    var slugParts = urlSlug.split('-');
    // İlk 2-3 parça genellikle marka-seri-model
    if(slugParts.length >= 3) {
      // "sahibinden-satilik-renault-megane-..." gibi yapılar
      var idx = slugParts.indexOf('satilik') !== -1 ? slugParts.indexOf('satilik')+1 : 0;
      if(slugParts[idx]) marka = slugParts[idx].charAt(0).toUpperCase()+slugParts[idx].slice(1);
      if(slugParts[idx+1]) seri = slugParts[idx+1].charAt(0).toUpperCase()+slugParts[idx+1].slice(1);
    }

    // Yıl TD[3]
    var yil = parseInt(tdler[3] ? tdler[3].textContent.trim() : '') || 0;

    // KM TD[4]
    var kmText = tdler[4] ? tdler[4].textContent.trim() : '';

    // Fiyat: TR içindeki TÜM fiyatları bul, en büyüğünü al
    // (Arabam liste sayfasında bazen eski/indirimli fiyat daha küçük gösterilir)
    var fiyat = 0;
    var trTxt = tr.textContent || '';
    var tumFiyatlar = [];
    var fiyatRegex = /(\d{1,3}(?:\.\d{3})+)\s*TL/g;
    var fm3;
    while ((fm3 = fiyatRegex.exec(trTxt)) !== null) {
      var val = parseInt(fm3[1].replace(/\./g,''));
      if (val >= 50000) tumFiyatlar.push(val);
    }
    // En büyük fiyatı al (liste sayfasında gerçek fiyat genellikle en büyük)
    if (tumFiyatlar.length) fiyat = Math.max.apply(null, tumFiyatlar);
    if (!fiyat || fiyat < 50000) return;

    if (ilanlar.some(function(x){ return x.url===url; })) return;
    ilanlar.push({
      url: url, fiyat: fiyat,
      ad: ad.substring(0,200),
      marka: marka, seri: seri, model: model,
      yil: yil, km: kmText,
      kaynak: 'arabam'
    });
  });

  // Fallback: /ilan/ linkleri + fiyat ara
  if (!ilanlar.length) {
    var goruldu = {};
    var linkler = document.querySelectorAll('a[href*="/ilan/"]');
    linkler.forEach(function(a) {
      var url = a.href.split('?')[0];
      if (!url || url.indexOf('arabam.com') === -1 || goruldu[url]) return;
      if (a.textContent.trim().length < 3) return;
      goruldu[url] = true;
      var container = a.closest('tr,li,article') || a.parentElement;
      var txt = container.textContent;
      // Tüm fiyatları bul, en büyüğünü al
      var fiyatlar2 = [];
      var rx2 = /(\d{1,3}(?:\.\d{3})+)\s*TL/g;
      var m2;
      while ((m2 = rx2.exec(txt)) !== null) {
        var v2 = parseInt(m2[1].replace(/\./g,''));
        if (v2 >= 50000) fiyatlar2.push(v2);
      }
      var fiyat = fiyatlar2.length ? Math.max.apply(null, fiyatlar2) : 0;
      if (!fiyat || fiyat < 50000) return;
      ilanlar.push({ url:url, fiyat:fiyat, ad:a.textContent.trim().substring(0,200), marka:'', seri:'', model:'', yil:0, km:'', kaynak:'arabam' });
    });
  }

  console.log('[ARAÇRADAR] Arabam toplam:', ilanlar.length, 'ilan');
  return ilanlar;
}


// Letgo'nun tüm muhtemel veri kaynaklarını dene

function ilanTopla_letgo() {
  var ilanlar = []; var goruldu = {};
  function temizFiyat(txt) {
    if(!txt) return 0;
    var m=String(txt).replace(/\s/g,'').replace(/\./g,'').replace(',','.').match(/(\d+)/);
    return m?parseInt(m[1]):0;
  }
  function ekle(url,fiyat,ad,marka,yil,km,vites,yakit,sehir) {
    if(!url||goruldu[url]||!fiyat||fiyat<10000||!ad||ad.length<3) return;
    url=url.split('?')[0]; goruldu[url]=true;
    ilanlar.push({url:url,fiyat:fiyat,ad:ad.substring(0,200),marka:marka||'',seri:'',model:'',
      yil:parseInt(yil)||0,km:String(km||'').replace(/\D/g,''),vites:vites||'',yakit:yakit||'',sehir:sehir||'',kaynak:'letgo'});
  }
  // __NEXT_DATA__ ile çek
  try {
    var nextEl=document.querySelector('script#__NEXT_DATA__');
    if(nextEl) {
      var data=JSON.parse(nextEl.textContent);
      var listings=[];
      function deepFind(obj,d) {
        if(!obj||d>12||typeof obj!=='object') return;
        if(Array.isArray(obj)) {
          if(obj.length>0&&obj[0]&&(obj[0].price!==undefined||obj[0].title||obj[0].id)) {listings=listings.concat(obj);return;}
          obj.forEach(function(v){deepFind(v,d+1);}); return;
        }
        ['listings','ads','items','products','results','vehicles','cars','data','nodes','hits','list','searchResults'].forEach(function(k){if(obj[k])deepFind(obj[k],d+1);});
        Object.keys(obj).forEach(function(k){if(typeof obj[k]==='object')deepFind(obj[k],d+1);});
      }
      deepFind(data,0);
      listings.forEach(function(item) {
        var url=item.url||item.webLink||item.link||'';
        if(!url&&(item.id||item.slug)) url='https://www.letgo.com/ilan/'+(item.slug||item.id);
        if(url&&url[0]==='/') url='https://www.letgo.com'+url;
        if(!url) return;
        var p=item.price||{}; var fiyat=typeof p==='number'?p:typeof p==='string'?temizFiyat(p):temizFiyat(p.value||p.amount||p.formatted||'');
        var ad=item.title||item.subject||item.name||'';
        var attrs=item.attributes||item.specs||{};
        ekle(url,fiyat,ad,item.brand||attrs.brand||'',item.year||attrs.year||item.modelYear||0,item.km||attrs.km||'',item.transmission||attrs.transmission||'',item.fuel||attrs.fuel||'',item.city||(item.location&&item.location.city)||'');
      });
      if(ilanlar.length>0) return ilanlar;
    }
  } catch(e){console.log('[ARAÇRADAR] Letgo NEXT_DATA:',e.message);}
  // DOM tarama
  var kartlar=[];
  ['[data-testid="srp-list-item"]','[class*="ListingCard"]','article[class]','[data-listing-id]'].forEach(function(sel){
    if(!kartlar.length){var f=Array.from(document.querySelectorAll(sel));if(f.length>=2)kartlar=f;}
  });
  kartlar.forEach(function(kart) {
    var linkEl=kart.tagName==='A'?kart:kart.querySelector('a[href]');
    var url=linkEl?linkEl.href:'';
    if(!url||url.includes('filter=')) return;
    var txt=kart.textContent||'';
    var fEl=kart.querySelector('[class*="price"],[class*="Price"]');
    var fiyat=fEl?temizFiyat(fEl.textContent):0;
    if(!fiyat){var fm=txt.match(/(\d{1,3}(?:[.,]\d{3})*)\s*(?:TL|₺)/);if(fm)fiyat=parseInt(fm[1].replace(/[.,]/g,''));}
    if(!fiyat||fiyat<10000) return;
    var ad=''; kart.querySelectorAll('h1,h2,h3,[class*="title"],[class*="Title"]').forEach(function(el){if(!ad&&el.textContent.trim().length>3)ad=el.textContent.trim();});
    if(!ad)ad=(linkEl&&linkEl.textContent.trim())||'Letgo İlanı';
    var yilM=txt.match(/(20\d{2}|19[89]\d)/);
    var kmM=txt.match(/(\d{1,3}(?:[.,]\d{3})*)\s*[Kk][Mm]/);
    ekle(url,fiyat,ad,'',yilM?yilM[1]:0,kmM?kmM[1].replace(/[.,]/g,''):'');
  });
  console.log('[ARAÇRADAR] Letgo:',ilanlar.length);
  return ilanlar;
}

// ── Mesaj dinleyici ───────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {

  if (msg.action === 'ilanAktifMi') {
    var kalkmis = false;
    var txt = document.body ? document.body.innerText || '' : '';
    var url = window.location.href;

    // Sahibinden yayından kalkmış
    if (url.includes('sahibinden.com')) {
      kalkmis = txt.includes('yayından kaldırıldı') ||
                txt.includes('ilan bulunamadı') ||
                txt.includes('İlan Bulunamadı') ||
                txt.includes('kaldırılmıştır') ||
                document.querySelector('.error-page, .not-found, [class*="expired"]') !== null;
    }
    // Arabam yayından kalkmış
    else if (url.includes('arabam.com')) {
      kalkmis = txt.includes('İlan Bulunamadı') ||
                txt.includes('ilan bulunamadı') ||
                txt.includes('Aradığınız ilan') ||
                txt.includes('kaldırılmış') ||
                document.querySelector('.error-page, .not-found-page, [class*="notFound"]') !== null ||
                document.title.includes('Bulunamadı') ||
                document.title.includes('404');
    }
    // Letgo redirect
    else if (url.includes('letgo.com')) {
      kalkmis = url.includes('redirectedItem=true') ||
                url.includes('_c157') ||
                txt.includes('Bu ilan artık mevcut değil') ||
                txt.includes('ilan kaldırıldı');
    }

    sendResponse({ aktif: !kalkmis, url: url });
    return true;
  }


  if (msg.action === 'ilanDetayAl') {
    var site = siteAlgila();
    var detay = {marka:'', model:'', yil:'', km:'', fiyat:0, motor:'', yakit:'', vites:'', renk:'', kaynak:site||''};

    // Sahibinden detay sayfası
    if (site === 'sahibinden') {
      // ── Tüm özellik satırlarından değer oku ──────────────────────────
      function sbVal(label) {
        // Sahibinden yeni yapı: li içinde strong/span çifti
        var selectors = [
          '.classifiedInfoList li',
          '.technical-specs li',
          '[class*="classifiedInfo"] li',
          '[class*="detail-list"] li',
          '[class*="detailList"] li',
          'ul li'
        ];
        var els = [];
        selectors.forEach(function(s) {
          try { Array.from(document.querySelectorAll(s)).forEach(function(e){ els.push(e); }); } catch(e){}
        });
        for (var i = 0; i < els.length; i++) {
          var txt = els[i].textContent || '';
          if (txt.toLowerCase().indexOf(label.toLowerCase()) !== -1) {
            // Değer genellikle son span veya strong'da
            var spans = els[i].querySelectorAll('span, strong, b');
            if (spans.length >= 2) return spans[spans.length-1].textContent.trim();
            if (spans.length === 1) return spans[0].textContent.trim();
            // Yoksa li'nin tüm metninden label kısmını çıkar
            var val = txt.replace(label, '').replace(/[:*]/g,'').trim();
            if (val) return val;
          }
        }
        return '';
      }

      // ── Temel bilgiler ────────────────────────────────────────────────
      // Sahibinden'de: Marka=Renault, Seri=Megane (gerçek model), Model=trim (1.5 Blue DCI Touch)
      detay.marka = sbVal('Marka') || sbVal('Araç Markası');
      detay.model = sbVal('Seri') || sbVal('Model');  // Seri = gerçek model adı (Megane)
      detay.trim  = sbVal('Model');  // trim bilgisi ayrıca sakla
      detay.yil   = parseInt(sbVal('Yıl') || sbVal('Model Yılı')) || 0;
      var kmStr   = sbVal('Kilometre');
      detay.km    = parseInt((kmStr||'').replace(/\D/g,'')) || 0;
      detay.motor = sbVal('Motor Hacmi') || sbVal('Motor Gücü') || sbVal('Motor');
      // Yakıt Tipi: Sahibinden'de "Yakıt Tipi" veya sadece "Yakıt"
      var yakitRaw = sbVal('Yakıt Tipi') || sbVal('Yakıt') || '';
      var yrL = yakitRaw.toLowerCase();
      // Benzin+LPG kombinasyonu — önce kontrol et
      if (yrL.indexOf('benzin') !== -1 && yrL.indexOf('lpg') !== -1) detay.yakit = 'Benzin+LPG';
      else if (yrL.indexOf('dizel') !== -1)  detay.yakit = 'Dizel';
      else if (yrL.indexOf('benzin') !== -1) detay.yakit = 'Benzin';
      else if (yrL.indexOf('lpg') !== -1)    detay.yakit = 'LPG';
      else if (yrL.indexOf('hibrit') !== -1 || yrL.indexOf('hybrid') !== -1) detay.yakit = 'Hibrit';
      else if (yrL.indexOf('elektrik') !== -1) detay.yakit = 'Elektrik';
      else detay.yakit = yakitRaw;
      // Şehir — Sahibinden detay sayfasında da al
      detay.sehir = sbVal('Şehir') || sbVal('İl') || detay.sehir || '';
      // Vites Tipi
      var vitesRaw = sbVal('Vites Tipi') || sbVal('Vites') || '';
      if (vitesRaw.toLowerCase().indexOf('otomatik') !== -1) detay.vites = 'Otomatik';
      else if (vitesRaw.toLowerCase().indexOf('manuel') !== -1) detay.vites = 'Manuel';
      else if (vitesRaw.toLowerCase().indexOf('yar') !== -1) detay.vites = 'Yarı Otomatik';
      else detay.vites = vitesRaw;
      detay.renk  = sbVal('Renk');

      // ── Sahibinden fallback: meta/title/h1'den marka-model-yıl çek ──
      if (!detay.marka) {
        // Sayfa başlığından: "2007 Kia Sorento 2.5 CRDi..."
        var pgTitle = document.title || '';
        var titleM = pgTitle.match(/^(\d{4})\s+([A-ZÇŞĞÜÖİa-zçşğüöı]+)\s+([A-ZÇŞĞÜÖİa-zçşğüöı0-9]+)/);
        if (titleM) {
          if (!detay.yil)  detay.yil   = parseInt(titleM[1]) || 0;
          if (!detay.marka) detay.marka = titleM[2];
          if (!detay.model) detay.model = titleM[3];
        }
        // h1 ve h2'den dene
        var h1El = document.querySelector('h1,h2,[class*="title"],[class*="Title"]');
        if (h1El && !detay.marka) {
          var h1Txt = h1El.textContent.trim();
          var h1M = h1Txt.match(/(\d{4})\s+([A-ZÇŞĞÜÖİa-zçşğüöı]+)\s+([A-ZÇŞĞÜÖİa-zçşğüöı0-9]+)/);
          if (h1M) {
            if (!detay.yil)   detay.yil   = parseInt(h1M[1]) || 0;
            if (!detay.marka) detay.marka = h1M[2];
            if (!detay.model) detay.model = h1M[3];
          }
        }
      }
      // URL'den marka/model çıkar (son Sahibinden fallback)
      // /ilan/vasita-arazi-suv-pickup-kia-dusuk-km-temiz-4x4-2007-model-...-kia-sorento-ID/detay
      if (!detay.marka) {
        var sbSkip = ['vasita','arazi','suv','pickup','otomobil','satilik','sahibinden','dusuk','km','temiz','model','ilan','detay','hatasiz','boyasiz','ikinci','el'];
        var sbSlug = location.pathname.split('/').reduce(function(a,b){ return b.length>a.length&&b.indexOf('-')!==-1?b:a; },'');
        var sbWords = sbSlug.split('-').filter(function(w){ return w.length>1 && sbSkip.indexOf(w)===-1 && isNaN(w) && !/^\d{4}$/.test(w); });
        if (sbWords.length>=1) detay.marka = sbWords[0].charAt(0).toUpperCase()+sbWords[0].slice(1);
        if (sbWords.length>=2) detay.model = sbWords[1].charAt(0).toUpperCase()+sbWords[1].slice(1);
        // Yıl URL'den
        if (!detay.yil) { var yrM = location.pathname.match(/(20\d{2}|19[89]\d)/); if(yrM) detay.yil = parseInt(yrM[1]); }
      }
      // KM URL'den (örn: "dusuk-km" → regex ile sayısal km ara)
      if (!detay.km) {
        var kmUrlM = location.pathname.match(/(\d{2,3})[.-]?(?:bin|000)[.-]?km/i) || location.pathname.match(/(\d{3,6})-km/i);
        if (kmUrlM) detay.km = parseInt(kmUrlM[1]) * (kmUrlM[0].toLowerCase().indexOf('bin')!==-1 ? 1000 : 1);
      }

      // ── Sahibinden JSON veri kaynağı (window.__classified__ veya script[type=application/ld+json]) ──
      if (!detay.marka || !detay.yil) {
        try {
          // LD+JSON schema.org/Car
          var ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
          ldScripts.forEach(function(sc) {
            try {
              var obj = JSON.parse(sc.textContent);
              var car = obj['@type']==='Car' ? obj : (obj['@graph']||[]).find(function(x){return x['@type']==='Car';});
              if (car) {
                if (!detay.marka && car.brand) detay.marka = car.brand.name || String(car.brand);
                if (!detay.model && car.model) detay.model = String(car.model);
                if (!detay.yil  && car.productionDate) detay.yil = parseInt(car.productionDate) || 0;
                if (!detay.km   && car.mileageFromOdometer) detay.km = parseInt(String(car.mileageFromOdometer.value||car.mileageFromOdometer).replace(/\D/g,'')) || 0;
                if (!detay.fiyat && car.offers && car.offers.price) detay.fiyat = parseInt(String(car.offers.price).replace(/\D/g,'')) || 0;
                if (!detay.yakit && car.fuelType) detay.yakit = String(car.fuelType);
              }
            } catch(e2) {}
          });
        } catch(e) {}
      }

      // ── Fiyat ─────────────────────────────────────────────────────────
      var fiyatSelectors = [
        '[class*="price"]', '.price', 'h3.pretty-price-value',
        '[itemprop="price"]', '[class*="Price"]', '[class*="fiyat"]'
      ];
      for (var fi = 0; fi < fiyatSelectors.length; fi++) {
        var fEl = document.querySelector(fiyatSelectors[fi]);
        if (fEl) {
          var fm = fEl.textContent.match(/([\d.]+)/);
          if (fm) { detay.fiyat = parseInt(fm[1].replace(/\./g,'')); break; }
        }
      }

      // ── Ağır hasar ────────────────────────────────────────────────────
      var hasarTxt = (sbVal('Ağır Hasar') || sbVal('Hasar') || '').toLowerCase();
      if      (hasarTxt.indexOf('yok') !== -1) detay.hasar = 'yok';
      else if (hasarTxt.indexOf('var') !== -1) detay.hasar = 'var';
      // hasarKaydi class ile de kontrol et
      var hasarKaydi = document.querySelector('[class*="hasarKaydi"],[class*="hasar-kaydi"],[class*="damageRecord"]');
      if (hasarKaydi) {
        var hk = hasarKaydi.textContent.toLowerCase();
        if (hk.indexOf('yok') !== -1) detay.hasar = 'yok';
        else if (hk.indexOf('var') !== -1) detay.hasar = 'var';
      }

      // ── Tramer ────────────────────────────────────────────────────────
      var tramerTxt = sbVal('Tramer');
      if (tramerTxt) {
        if (tramerTxt.toLowerCase() === 'yok' || tramerTxt === '0') {
          detay.tramer = 0;
        } else {
          detay.tramer = parseInt(tramerTxt.replace(/\D/g,'')) || 0;
        }
      }

      // ── BOYALI / DEĞİŞEN PARÇA — Sahibinden hasar şeması ─────────────
      // Yöntem 1: "Boyalı Parçalar" ve "Değişen Parçalar" liste başlıkları
      var boyaliSayac = 0;
      var degisenSayac = 0;

      // Sahibinden hasar şeması bölümü
      var hasarBolum = document.querySelector(
        '[class*="damage"],[class*="Damage"],[class*="hasar"],[class*="Hasar"],' +
        '[class*="painted"],[class*="changed"],[class*="body-damage"]'
      );

      // Boyalı parçalar listesi
      var boyaliListeEl = null;
      var degisenListeEl = null;

      // Başlık tabanlı arama: "Boyalı Parçalar" başlığının yanındaki liste
      var tumBasliklar = document.querySelectorAll('h2,h3,h4,h5,strong,b,span,div');
      for (var bi = 0; bi < tumBasliklar.length; bi++) {
        var bTxt = (tumBasliklar[bi].textContent || '').trim();
        if (bTxt === 'Boyalı Parçalar' || bTxt === 'Boyalı veya Değişen Parça') {
          // Kardeş veya ebeveyn içindeki ul/li'leri say
          var parent = tumBasliklar[bi].parentElement;
          var listItems = parent ? parent.querySelectorAll('li') : [];
          // Boyalı ve Değişen ayrımı: ayrı kolonlarda gösteriliyor
          // "Boyalı Parçalar" kolonundaki li'ler
          var kolonlar = parent ? parent.querySelectorAll('[class*="col"],[class*="Col"],ul') : [];
          if (kolonlar.length >= 2) {
            boyaliSayac  = kolonlar[0].querySelectorAll('li').length;
            degisenSayac = kolonlar[1].querySelectorAll('li').length;
          } else if (listItems.length) {
            boyaliSayac = listItems.length;
          }
          break;
        }
      }

      // Yöntem 2: Direkt "Boyalı Parçalar" ve "Değişen Parçalar" span/div başlıklarını ara
      if (boyaliSayac === 0 && degisenSayac === 0) {
        var tumEls = document.querySelectorAll('*');
        var boyaliBulundu = false;
        var degisenBulundu = false;
        for (var ei = 0; ei < tumEls.length; ei++) {
          var eTxt = (tumEls[ei].childNodes.length === 1 && tumEls[ei].firstChild.nodeType === 3)
                     ? tumEls[ei].textContent.trim() : '';
          if (!boyaliBulundu && eTxt === 'Boyalı Parçalar') {
            boyaliBulundu = true;
            var nextEl = tumEls[ei].nextElementSibling;
            if (nextEl) boyaliSayac = nextEl.querySelectorAll('li').length;
            if (!boyaliSayac) {
              var parentUl = tumEls[ei].closest('div,section');
              if (parentUl) boyaliSayac = parentUl.querySelectorAll('li').length;
            }
          }
          if (!degisenBulundu && eTxt === 'Değişen Parçalar') {
            degisenBulundu = true;
            var nextEl2 = tumEls[ei].nextElementSibling;
            if (nextEl2) degisenSayac = nextEl2.querySelectorAll('li').length;
          }
          if (boyaliBulundu && degisenBulundu) break;
        }
      }

      // Yöntem 3: page kaynağından regex ile çek (en güvenilir fallback)
      if (boyaliSayac === 0 && degisenSayac === 0) {
        // SVG üzerindeki "B" (Boyalı) ve "D" (Değişen) etiketli parçaları say
        var svgTexts = document.querySelectorAll('svg text, [class*="damage-label"],[class*="partLabel"]');
        var bSayac = 0, dSayac = 0;
        svgTexts.forEach(function(t) {
          var v = (t.textContent||'').trim();
          if (v === 'B' || v === 'LB') bSayac++;
          else if (v === 'D') dSayac++;
        });
        if (bSayac > 0 || dSayac > 0) {
          boyaliSayac  = bSayac;
          degisenSayac = dSayac;
        }
      }

      // Yöntem 4: data-part-status attribute'ları
      if (boyaliSayac === 0 && degisenSayac === 0) {
        var partEls = document.querySelectorAll('[data-part-status],[class*="partStatus"],[class*="part-status"]');
        partEls.forEach(function(p) {
          var st = (p.getAttribute('data-part-status') || p.className || '').toLowerCase();
          if (st.indexOf('painted') !== -1 || st.indexOf('boyali') !== -1 || st === 'b') boyaliSayac++;
          else if (st.indexOf('changed') !== -1 || st.indexOf('degisen') !== -1 || st === 'd') degisenSayac++;
        });
      }

      detay.boya    = boyaliSayac;
      detay.degisen = degisenSayac;

      console.log('[ARAÇRADAR] Detay:', detay.marka, detay.model, detay.yil,
        'fiyat:', detay.fiyat, 'km:', detay.km,
        'boya:', detay.boya, 'degisen:', detay.degisen,
        'hasar:', detay.hasar, 'tramer:', detay.tramer);
    }

    // Arabam detay sayfası
    if (site === 'arabam') {
      // ── ÖNCE DOM'dan oku — arabam.com artık __NEXT_DATA__ kullanmıyor ──
      // Sayfada "Vites Tipi: Otomatik", "Yakıt Tipi: Dizel" gibi tablo satırları var
      function arNorm2Yakit(raw) {
        if (!raw) return '';
        var rl = raw.toLowerCase();
        if (rl.indexOf('benzin') > -1 && rl.indexOf('lpg') > -1) return 'Benzin+LPG';
        if (rl.indexOf('dizel') > -1 || rl.indexOf('diesel') > -1) return 'Dizel';
        if (rl.indexOf('benzin') > -1) return 'Benzin';
        if (rl.indexOf('lpg') > -1) return 'LPG';
        if (rl.indexOf('hibrit') > -1 || rl.indexOf('hybrid') > -1) return 'Hibrit';
        if (rl.indexOf('elektrik') > -1 || rl.indexOf('electric') > -1) return 'Elektrik';
        return raw;
      }
      function arNorm2Vites(raw) {
        if (!raw) return '';
        var rl = raw.toLowerCase();
        if (rl.indexOf('otomatik') > -1 || rl.indexOf('automatic') > -1) return 'Otomatik';
        if (rl.indexOf('manuel') > -1 || rl.indexOf('manual') > -1) return 'Manuel';
        if (rl.indexOf('yar') > -1 || rl.indexOf('semi') > -1) return 'Yarı Otomatik';
        return raw;
      }

      // Tüm etiket-değer çiftlerini tara
      // Arabam.com'da genellikle: <span>Vites Tipi</span><span>Otomatik</span>
      // veya <td>Yakıt Tipi</td><td>Dizel</td> formatında
      var arEtiketler = {
        'marka': ['marka','brand','make'],
        'seri': ['seri','model adı','series'],
        'model': ['model'],
        'yil': ['yıl','year','model yılı'],
        'km': ['kilometre','km','mileage'],
        'yakit': ['yakıt tipi','yakıt','fuel type','fuel'],
        'vites': ['vites tipi','vites','gear type','şanzıman','transmission'],
        'renk': ['renk','color','colour'],
        'motor': ['motor hacmi','motor gücü','engine'],
        'sehir': ['şehir','il','konum','city','location']
      };

      // Tüm sayfadaki metin çiftlerini tara
      function arDomTara(rootEl) {
        // dt/dd çiftleri
        rootEl.querySelectorAll('dt').forEach(function(dt) {
          var dd = dt.nextElementSibling;
          if (!dd || dd.tagName !== 'DD') return;
          var k = dt.textContent.trim().toLowerCase();
          var v = dd.textContent.trim();
          arSetDetay(k, v);
        });
        // tr > td çiftleri
        rootEl.querySelectorAll('tr').forEach(function(tr) {
          var tds = tr.querySelectorAll('td,th');
          if (tds.length >= 2) {
            arSetDetay(tds[0].textContent.trim().toLowerCase(), tds[1].textContent.trim());
          }
        });
        // Her türlü parent > 2 child yapısı
        var selectors = [
          '[class*="detail"]', '[class*="spec"]', '[class*="property"]',
          '[class*="info"]', '[class*="feature"]', '[class*="attribute"]',
          '[class*="classified"]', '[class*="listing-detail"]'
        ];
        rootEl.querySelectorAll(selectors.join(',')).forEach(function(el) {
          var ch = el.children;
          if (ch.length >= 2) {
            var k = ch[0].textContent.trim().toLowerCase();
            var v = ch[ch.length - 1].textContent.trim();
            if (k && v && v.length < 60) arSetDetay(k, v);
          }
        });
      }

      function arSetDetay(k, v) {
        if (!k || !v || v.length > 60) return;
        if (!detay.yakit  && arEtiketler.yakit.some(function(e){return k.indexOf(e)>-1;}))  detay.yakit  = arNorm2Yakit(v);
        if (!detay.vites  && arEtiketler.vites.some(function(e){return k.indexOf(e)>-1;}))  detay.vites  = arNorm2Vites(v);
        if (!detay.renk   && arEtiketler.renk.some(function(e){return k.indexOf(e)>-1;}))   detay.renk   = v;
        if (!detay.motor  && arEtiketler.motor.some(function(e){return k.indexOf(e)>-1;}))  detay.motor  = v;
        if (!detay.sehir  && arEtiketler.sehir.some(function(e){return k.indexOf(e)>-1;}))  detay.sehir  = v;
        if (!detay.marka  && arEtiketler.marka.some(function(e){return k===e;}))             detay.marka  = v;
        if (!detay.model  && arEtiketler.seri.some(function(e){return k===e;}))              detay.seri   = v;
        if (!detay.yil    && arEtiketler.yil.some(function(e){return k.indexOf(e)>-1;}))    detay.yil    = parseInt(v) || 0;
        if (!detay.km     && arEtiketler.km.some(function(e){return k.indexOf(e)>-1;})) {
          detay.km = parseInt(v.replace(/\./g,'').replace(/\s/g,'').replace(/km/gi,'')) || 0;
        }
        // Fiyat
        if (!detay.fiyat  && (k.indexOf('fiyat')>-1||k.indexOf('price')>-1)) {
          detay.fiyat = parseInt(v.replace(/[^\d]/g,'')) || 0;
        }
      }

      // DOM tara
      arDomTara(document);

      // Fiyat DOM'dan — sayfada kırmızı fiyat elementi
      if (!detay.fiyat) {
        var fiyatEl = document.querySelector('[class*="price"],[class*="Price"],[class*="fiyat"],[class*="Fiyat"]');
        if (!fiyatEl) fiyatEl = document.querySelector('h2,h3');
        if (fiyatEl) {
          var fm = fiyatEl.textContent.replace(/\s/g,'').match(/(\d[\d.]+\d)/);
          if (fm) detay.fiyat = parseInt(fm[1].replace(/\./g,'')) || 0;
        }
      }

      console.log('[ARAÇRADAR] arabam DOM tarama sonuç:', JSON.stringify(detay));

      // 1. URL'den marka/model çıkar — arabam URL formatı:
      // /ilan/sahibinden-satilik-volkswagen-golf-1-6-tdi-.../id
      // Slug: sahibinden-satilik-{MARKA}-{MODEL}-...
      var SKIP_W = ['sahibinden','satilik','ikinci','el','otomatik','manuel','dizel','benzin','ilan','arabam','com','www'];
      // Tüm path segmentlerinden en uzun anlamlı slug bul
      var urlParts = location.pathname.split('/').filter(Boolean);
      var bestSlug = '';
      urlParts.forEach(function(seg) { if(seg.length > bestSlug.length && seg.indexOf('-') !== -1 && isNaN(seg)) bestSlug = seg; });
      if (bestSlug) {
        var words = bestSlug.split('-').filter(function(w){ return w.length>1 && SKIP_W.indexOf(w)===-1 && isNaN(w); });
        // İlk anlamlı kelime = marka, ikincisi = model
        if (words.length >= 1) detay.marka = words[0].charAt(0).toUpperCase()+words[0].slice(1);
        if (words.length >= 2) detay.model = words[1].charAt(0).toUpperCase()+words[1].slice(1);
      }

      // 2. __NEXT_DATA__ — arabam.com Next.js veri yapısı
      var nd = document.querySelector('script#__NEXT_DATA__');
      if (nd) {
        try {
          var ndData = JSON.parse(nd.textContent);
          // Tüm olası path'leri dene
          var pp = (ndData.props&&ndData.props.pageProps) || {};
          console.log('[ARAÇRADAR] arabam pageProps keys:', Object.keys(pp).join(','));
          var ad = pp.adDetail || pp.classifiedDetail || pp.listing || pp.detail || pp.data || {};
          // Nested: ad.ad, ad.listing, ad.vehicle vb.
          if (!ad.make && !ad.year) {
            ['ad','listing','vehicle','car','item','result','advert','classified'].forEach(function(k){ if(pp[k]) { console.log('[ARAÇRADAR] arabam trying key:', k, Object.keys(pp[k]).slice(0,15).join(',')); if(pp[k].make||pp[k].brand||pp[k].year) ad=pp[k]; } });
          }
          console.log('[ARAÇRADAR] arabam ad keys:', Object.keys(ad).slice(0,30).join(','));
          console.log('[ARAÇRADAR] arabam raw values - fuelType:', ad.fuelType, 'fuel:', ad.fuel, 'yakitTipi:', ad.yakitTipi, 'gearType:', ad.gearType, 'gear:', ad.gear, 'transmission:', ad.transmission);
          // Özellikleri doldur
          var getStr = function(obj){ return obj ? String(obj) : ''; };
          if (ad.make||ad.makeName||ad.brand)   detay.marka = getStr(ad.make||ad.makeName||ad.brand);
          if (ad.model||ad.modelName||ad.series) detay.model = getStr(ad.model||ad.modelName||ad.series);
          if (ad.year||ad.modelYear)             detay.yil   = getStr(ad.year||ad.modelYear);
          if (ad.km||ad.mileage||ad.kilometre)   detay.km    = getStr(ad.km||ad.mileage||ad.kilometre);
          if (ad.price||ad.listingPrice||ad.salePrice) detay.fiyat = parseInt(String(ad.price||ad.listingPrice||ad.salePrice).replace(/\D/g,''))||0;
          detay.renk  = getStr(ad.color||ad.colour||ad.renk||'');
          detay.motor = getStr(ad.engineSize||ad.enginePower||ad.motorHacmi||'');
          detay.sehir = getStr(ad.city||ad.cityName||ad.location||ad.sehir||'');

          // ── Arabam.com özellikleri: properties[] veya searchResultItem.properties ──
          // Arabam.com'da yakıt/vites genellikle properties dizisinde gelir:
          // [{name:"Yakıt Tipi", value:"Dizel"}, {name:"Vites", value:"Otomatik"}, ...]
          var props = ad.properties || ad.specs || ad.attributes || ad.features ||
                      (ad.searchResultItem && ad.searchResultItem.properties) ||
                      (ad.advert && ad.advert.properties) || [];

          // Ayrıca pp içinde doğrudan properties olabilir
          if (!props.length) {
            props = pp.properties || pp.specs ||
                    (pp.advert && pp.advert.properties) ||
                    (pp.searchResultItem && pp.searchResultItem.properties) || [];
          }

          // Obje formatı: {name,value} veya {key,value} veya {label,text} vb.
          var arNormYakit = function(raw) {
            if (!raw) return '';
            var rl = String(raw).toLowerCase();
            if (rl.indexOf('benzin')!==-1 && rl.indexOf('lpg')!==-1) return 'Benzin+LPG';
            if (rl.indexOf('dizel')!==-1||rl.indexOf('diesel')!==-1) return 'Dizel';
            if (rl.indexOf('benzin')!==-1||rl.indexOf('gasoline')!==-1) return 'Benzin';
            if (rl.indexOf('lpg')!==-1) return 'LPG';
            if (rl.indexOf('hibrit')!==-1||rl.indexOf('hybrid')!==-1) return 'Hibrit';
            if (rl.indexOf('elektrik')!==-1||rl.indexOf('electric')!==-1) return 'Elektrik';
            return String(raw);
          };
          var arNormVites = function(raw) {
            if (!raw) return '';
            var rl = String(raw).toLowerCase();
            if (rl.indexOf('otomatik')!==-1||rl.indexOf('automatic')!==-1) return 'Otomatik';
            if (rl.indexOf('manuel')!==-1||rl.indexOf('manual')!==-1) return 'Manuel';
            if (rl.indexOf('yar')!==-1||rl.indexOf('semi')!==-1) return 'Yarı Otomatik';
            return String(raw);
          };

          if (Array.isArray(props) && props.length) {
            props.forEach(function(p) {
              var k5 = String(p.name||p.key||p.label||p.title||'').toLowerCase();
              var v5 = String(p.value||p.val||p.text||p.content||'');
              if (!v5 || v5==='null'||v5==='undefined') return;
              if (k5.indexOf('yakıt')!==-1||k5.indexOf('yakit')!==-1||k5.indexOf('fuel')!==-1) detay.yakit = arNormYakit(v5);
              else if (k5.indexOf('vites')!==-1||k5.indexOf('gear')!==-1||k5.indexOf('transmission')!==-1) detay.vites = arNormVites(v5);
              else if (k5.indexOf('renk')!==-1||k5.indexOf('color')!==-1) detay.renk = v5;
              else if (k5.indexOf('motor')!==-1||k5.indexOf('engine')!==-1) detay.motor = v5;
              else if ((k5.indexOf('şehir')!==-1||k5.indexOf('il ')!==-1||k5.indexOf('city')!==-1) && !detay.sehir) detay.sehir = v5;
            });
          }

          // Hâlâ boşsa — doğrudan ad üzerindeki tüm string field'ları tara
          if (!detay.yakit) {
            Object.keys(ad).forEach(function(key) {
              var kl = key.toLowerCase();
              var val = ad[key];
              if (typeof val !== 'string' && typeof val !== 'number') return;
              var vs = String(val);
              if ((kl.indexOf('fuel')!==-1||kl.indexOf('yakit')!==-1||kl.indexOf('yakıt')!==-1) && vs) detay.yakit = arNormYakit(vs);
              if ((kl.indexOf('gear')!==-1||kl.indexOf('vites')!==-1||kl.indexOf('transmission')!==-1) && vs && !detay.vites) detay.vites = arNormVites(vs);
            });
          }

          console.log('[ARAÇRADAR] arabam final:', detay.marka, detay.model, detay.yil, detay.km, detay.fiyat, detay.yakit, detay.vites, '| props.length:', props.length);
        } catch(e) { console.log('[ARAÇRADAR] arabam parse hata:', e.message); }
      }

      // 3. DOM'dan fiyat al
      if (!detay.fiyat) {
        var fiyatEl = document.querySelector('[class*="price"],[class*="Price"],h2,h3');
        if (fiyatEl) {
          var fm = fiyatEl.textContent.match(/(\d{1,3}(?:\.\d{3})+)/);
          if (fm) detay.fiyat = parseInt(fm[1].replace(/\./g,''));
        }
      }

      // 4. LD+JSON schema.org/Car (arabam da kullanıyor)
      if (!detay.marka || !detay.yil || !detay.km) {
        try {
          var ldScripts2 = document.querySelectorAll('script[type="application/ld+json"]');
          ldScripts2.forEach(function(sc) {
            try {
              var obj2 = JSON.parse(sc.textContent);
              var car2 = obj2['@type']==='Car' ? obj2 : ((obj2['@graph']||[]).find(function(x){return x['@type']==='Car';}) || null);
              if (car2) {
                if (!detay.marka && car2.brand) detay.marka = car2.brand.name || String(car2.brand);
                if (!detay.model && car2.model) detay.model = String(car2.model);
                if (!detay.yil  && car2.productionDate) detay.yil = parseInt(car2.productionDate) || 0;
                if (!detay.km   && car2.mileageFromOdometer) detay.km = parseInt(String(car2.mileageFromOdometer.value||car2.mileageFromOdometer).replace(/\D/g,'')) || 0;
                if (!detay.fiyat && car2.offers && car2.offers.price) detay.fiyat = parseInt(String(car2.offers.price).replace(/\D/g,'')) || 0;
                if (!detay.yakit && car2.fuelType) {
                  var ftL = String(car2.fuelType).toLowerCase();
                  if (ftL.indexOf('benzin')!==-1 && ftL.indexOf('lpg')!==-1) detay.yakit='Benzin+LPG';
                  else if (ftL.indexOf('dizel')!==-1) detay.yakit='Dizel';
                  else if (ftL.indexOf('benzin')!==-1) detay.yakit='Benzin';
                  else if (ftL.indexOf('lpg')!==-1) detay.yakit='LPG';
                  else if (ftL.indexOf('hibrit')!==-1||ftL.indexOf('hybrid')!==-1) detay.yakit='Hibrit';
                  else if (ftL.indexOf('elektrik')!==-1||ftL.indexOf('electric')!==-1) detay.yakit='Elektrik';
                  else detay.yakit = String(car2.fuelType);
                }
              }
            } catch(e3) {}
          });
        } catch(e4) {}
      }

      // 5. DOM'dan li/span çiftleri — __NEXT_DATA__ ve LD+JSON boş kalırsa
      if (!detay.marka || !detay.yil || !detay.km) {
        var arNormalizeYakit = function(raw) {
          var rl = raw.toLowerCase();
          if (rl.indexOf('benzin')!==-1 && rl.indexOf('lpg')!==-1) return 'Benzin+LPG';
          if (rl.indexOf('dizel')!==-1) return 'Dizel';
          if (rl.indexOf('benzin')!==-1) return 'Benzin';
          if (rl.indexOf('lpg')!==-1) return 'LPG';
          if (rl.indexOf('hibrit')!==-1||rl.indexOf('hybrid')!==-1) return 'Hibrit';
          if (rl.indexOf('elektrik')!==-1||rl.indexOf('electric')!==-1) return 'Elektrik';
          return raw;
        };
        // Tablo satırları
        var trler = document.querySelectorAll('tr.listing-list-item, tr[class*="detail"], tr');
        trler.forEach(function(tr) {
          var tds = tr.querySelectorAll('td');
          if (tds.length >= 2) {
            var k = tds[0].textContent.trim();
            var v = tds[1].textContent.trim();
            if (!detay.marka  && k.indexOf('Marka')!==-1) detay.marka = v;
            if (!detay.model  && k.indexOf('Model')!==-1) detay.model = v;
            if (!detay.yil    && k.indexOf('Yıl')!==-1) detay.yil = parseInt(v)||0;
            if (!detay.km     && (k.indexOf('Km')!==-1||k.indexOf('Kilometre')!==-1)) detay.km = parseInt(v.replace(/\D/g,''))||0;
            if (!detay.yakit  && k.indexOf('Yakıt')!==-1) detay.yakit = arNormalizeYakit(v);
            if (!detay.vites  && k.indexOf('Vites')!==-1) {
              var vrL2=v.toLowerCase();
              if(vrL2.indexOf('otomatik')!==-1) detay.vites='Otomatik';
              else if(vrL2.indexOf('manuel')!==-1) detay.vites='Manuel';
              else if(vrL2.indexOf('yar')!==-1) detay.vites='Yarı Otomatik';
              else detay.vites=v;
            }
            if (!detay.sehir  && (k.indexOf('Şehir')!==-1||k.indexOf('İl')!==-1||k.indexOf('Konum')!==-1)) detay.sehir = v;
          }
        });
        // Arabam.com'un bilinen CSS class yapısı (2024+)
        // Örn: <div class="classified-properties"> içinde <div class="property-item">
        var arPropEls = document.querySelectorAll(
          '[class*="property"],[class*="Property"],[class*="spec"],[class*="Spec"],' +
          '[class*="detail-row"],[class*="info-row"],[class*="feature"],[class*="Feature"],' +
          '[class*="attribute"],[class*="Attribute"],[class*="classified-prop"]'
        );
        arPropEls.forEach(function(el) {
          var allText = el.querySelectorAll('span,strong,b,p,div,label');
          if (allText.length >= 2) {
            var k6 = allText[0].textContent.trim().toLowerCase();
            var v6 = allText[allText.length-1].textContent.trim();
            if (!v6 || v6 === k6) return;
            if (!detay.yakit && (k6.indexOf('yakıt')!==-1||k6.indexOf('yakit')!==-1||k6.indexOf('fuel')!==-1)) detay.yakit = arNormYakit(v6);
            if (!detay.vites && (k6.indexOf('vites')!==-1||k6.indexOf('gear')!==-1||k6.indexOf('şanzıman')!==-1)) detay.vites = arNormVites(v6);
            if (!detay.renk  && (k6.indexOf('renk')!==-1||k6.indexOf('color')!==-1)) detay.renk = v6;
            if (!detay.sehir && (k6.indexOf('şehir')!==-1||k6.indexOf('konum')!==-1||k6.indexOf('il')===0)) detay.sehir = v6;
          }
        });

        // li içinde span/strong çiftleri (arabam yeni tasarım)
        var liEls = document.querySelectorAll('li, [class*="spec-item"],[class*="detail-item"],[class*="property"]');
        liEls.forEach(function(li) {
          var spans = li.querySelectorAll('span,strong,b,p');
          if (spans.length >= 2) {
            var k2 = spans[0].textContent.trim();
            var v2 = spans[spans.length-1].textContent.trim();
            if (!detay.marka  && k2.indexOf('Marka')!==-1) detay.marka = v2;
            if (!detay.model  && (k2.indexOf('Model')!==-1||k2.indexOf('Seri')!==-1)) detay.model = v2;
            if (!detay.yil    && k2.indexOf('Yıl')!==-1) detay.yil = parseInt(v2)||0;
            if (!detay.km     && (k2.indexOf('Km')!==-1||k2.indexOf('Kilometre')!==-1)) detay.km = parseInt(v2.replace(/\D/g,''))||0;
            if (!detay.yakit  && k2.indexOf('Yakıt')!==-1) detay.yakit = arNormalizeYakit(v2);
            if (!detay.sehir  && (k2.indexOf('Şehir')!==-1||k2.indexOf('İl')!==-1)) detay.sehir = v2;
          }
        });
      }
      console.log('[ARAÇRADAR] arabam detay final:', detay.marka, detay.model, detay.yil, detay.km, detay.fiyat, detay.yakit, detay.vites);
    }

    // Letgo LİSTE TOPLAMA — sadece ilanlarAl aksiyonunda
    if (site === 'letgo' && msg.action === 'ilanlarAl') {
      var baslangic = Date.now();
      var goruldu = {};

      function temizFiyat(txt) {
        if (!txt) return 0;
        var m = String(txt).replace(/\s/g,'').match(/(\d[\d.]+\d)/);
        return m ? parseInt(m[1].replace(/\./g,''))||0 : 0;
      }

      function letgoIlanTopla() {
        var ilanlar = [];
        // Tüm ilan kartlarını bul
        var kartlar = document.querySelectorAll('[class*="ItemCard"],[class*="item-card"],[class*="AdCard"],[class*="ListingCard"],[data-testid*="card"],article[class*="card"]');
        if (!kartlar.length) {
          kartlar = document.querySelectorAll('a[href*="/ilan/"],a[href*="/item/"]');
        }
        kartlar.forEach(function(k) {
          var a = k.tagName === 'A' ? k : k.querySelector('a[href]');
          var url = a ? a.href.split('?')[0] : '';
          if (!url || goruldu[url] || url.length < 20) return;
          var txt = k.textContent || '';
          var fm = txt.match(/(\d{1,3}(?:\.\d{3})+)\s*(?:TL|₺)/);
          var fiyat = fm ? parseInt(fm[1].replace(/\./g,'')) : 0;
          if (!fiyat || fiyat < 10000) return;
          goruldu[url] = true;
          var yilM = txt.match(/(20\d{2}|19[89]\d)/);
          var kmM = txt.match(/(\d{1,3}(?:\.\d{3})*)\s*[Kk][Mm]/);
          var ad = '';
          var titleEl = k.querySelector('h2,h3,[class*="title"],[class*="Title"]');
          if (titleEl) ad = titleEl.textContent.trim();
          if (!ad) ad = url.split('/').slice(-2,-1)[0]||'Letgo İlanı';
          ilanlar.push({
            url: url, fiyat: fiyat,
            ad: ad.substring(0,200),
            marka: '', seri: '', model: '',
            yil: yilM ? parseInt(yilM[1]) : 0,
            km: kmM ? kmM[1].replace(/\./g,'') : '',
            kaynak: 'letgo'
          });
        });
        return ilanlar;
      }

      function dahaFazlaBul() {
        var butonlar = Array.from(document.querySelectorAll('button,a[role="button"]'));
        for (var i = 0; i < butonlar.length; i++) {
          var txt = (butonlar[i].textContent || '').toLowerCase().trim();
          if (txt.indexOf('daha fazla') !== -1 || txt.indexOf('yükle') !== -1 ||
              txt.indexOf('load more') !== -1 || txt.indexOf('show more') !== -1 ||
              txt.indexOf('daha fazla yükle') !== -1) {
            return butonlar[i];
          }
        }
        return null;
      }

      var toplamIlan = 0;
      function letgoTopla() {
        var gecen = Date.now() - baslangic;
        var ilanlar = letgoIlanTopla();

        // Buton tıkla
        var btn = dahaFazlaBul();
        if (btn) {
          btn.click();
          console.log('[ARAÇRADAR] Letgo buton tıklandı, ilan:', ilanlar.length, 'gecen:', gecen+'ms');
        }

        // Yeni ilan var mı?
        if (ilanlar.length > toplamIlan) {
          toplamIlan = ilanlar.length;
        }

        // Bitiş koşulları: buton yok VEYA 30sn geçti
        var bitmeli = (!btn && gecen > 5000) || gecen > 30000;
        if (bitmeli) {
          console.log('[ARAÇRADAR] Letgo bitti:', ilanlar.length, 'ilan');
          sendResponse({ ok: true, ilanlar: ilanlar, sayi: ilanlar.length });
          return;
        }

        setTimeout(letgoTopla, btn ? 2000 : 1000);
      }

      // Sayfa yüklenmesi için bekle
      setTimeout(letgoTopla, 3000);
      return true;
    }

    // Letgo detay sayfası — tek ilan bilgisi
    if (site === 'letgo' && msg.action === 'ilanDetayAl') {
      function letgoNormalizeYakit(raw) {
        var rl = (raw||'').toLowerCase();
        if (rl.indexOf('benzin')!==-1 && rl.indexOf('lpg')!==-1) return 'Benzin+LPG';
        if (rl.indexOf('dizel')!==-1||rl.indexOf('diesel')!==-1) return 'Dizel';
        if (rl.indexOf('benzin')!==-1||rl.indexOf('gasoline')!==-1) return 'Benzin';
        if (rl.indexOf('lpg')!==-1) return 'LPG';
        if (rl.indexOf('hibrit')!==-1||rl.indexOf('hybrid')!==-1) return 'Hibrit';
        if (rl.indexOf('elektrik')!==-1||rl.indexOf('electric')!==-1) return 'Elektrik';
        return raw;
      }
      function letgoNormalizeVites(raw) {
        var rl = (raw||'').toLowerCase();
        if (rl.indexOf('otomatik')!==-1||rl.indexOf('automatic')!==-1) return 'Otomatik';
        if (rl.indexOf('manuel')!==-1||rl.indexOf('manual')!==-1) return 'Manuel';
        if (rl.indexOf('yar')!==-1||rl.indexOf('semi')!==-1) return 'Yarı Otomatik';
        return raw;
      }

      var lgDetay = {marka:'',model:'',yil:0,km:0,fiyat:0,yakit:'',vites:'',sehir:'',kaynak:'letgo'};

      // 1. window.__NEXT_DATA__ veya Redux state
      var lgNd = document.querySelector('script#__NEXT_DATA__');
      if (lgNd) {
        try {
          var lgData = JSON.parse(lgNd.textContent);
          var lgPp = (lgData.props&&lgData.props.pageProps)||{};
          console.log('[ARAÇRADAR] Letgo pageProps keys:', Object.keys(lgPp).join(','));
          var lgAd = lgPp.adDetail||lgPp.listing||lgPp.item||lgPp.product||lgPp.data||lgPp.classified||lgPp.advertisement||{};
          if (!lgAd.title && !lgAd.make) {
            ['ad','item','listing','product','classified','vehicle','car','adDetail','advertisement'].forEach(function(k2){
              if(lgPp[k2]) { console.log('[ARAÇRADAR] Letgo trying:', k2, Object.keys(lgPp[k2]).slice(0,15).join(',')); if(lgPp[k2].make||lgPp[k2].brand||lgPp[k2].title||lgPp[k2].year) lgAd=lgPp[k2]; }
            });
          }
          console.log('[ARAÇRADAR] Letgo lgAd keys:', Object.keys(lgAd).slice(0,30).join(','));
          console.log('[ARAÇRADAR] Letgo raw - fuel:', lgAd.fuelType, lgAd.fuel, 'gear:', lgAd.gearType, lgAd.gear, lgAd.transmission, 'attrs:', JSON.stringify(lgAd.attributes||lgAd.properties||[]).substring(0,200));
          if (!lgAd.title && lgPp.initialProps) lgAd = lgPp.initialProps.adDetail||lgPp.initialProps.listing||lgAd;
          // Kategorik özellikler — Letgo'da attributes[] veya properties[]
          var attrs = lgAd.attributes||lgAd.properties||lgAd.specs||[];
          if (Array.isArray(attrs)) {
            attrs.forEach(function(a) {
              var k3 = (a.name||a.key||a.label||'').toLowerCase();
              var v3 = String(a.value||a.val||'');
              if (k3.indexOf('marka')!==-1||k3.indexOf('brand')!==-1||k3.indexOf('make')!==-1) lgDetay.marka = v3;
              else if (k3.indexOf('model')!==-1||k3.indexOf('seri')!==-1||k3.indexOf('series')!==-1) lgDetay.model = v3;
              else if (k3.indexOf('yıl')!==-1||k3.indexOf('year')!==-1) lgDetay.yil = parseInt(v3)||0;
              else if (k3.indexOf('km')!==-1||k3.indexOf('kilometre')!==-1||k3.indexOf('mileage')!==-1) lgDetay.km = parseInt(v3.replace(/\D/g,''))||0;
              else if (k3.indexOf('yakıt')!==-1||k3.indexOf('fuel')!==-1) lgDetay.yakit = letgoNormalizeYakit(v3);
              else if (k3.indexOf('vites')!==-1||k3.indexOf('gear')!==-1||k3.indexOf('transmission')!==-1) lgDetay.vites = letgoNormalizeVites(v3);
              else if (k3.indexOf('şehir')!==-1||k3.indexOf('city')!==-1||k3.indexOf('location')!==-1) lgDetay.sehir = v3;
            });
          }
          // Doğrudan alanlar
          if (!lgDetay.marka) lgDetay.marka = String(lgAd.make||lgAd.brand||lgAd.marka||'');
          if (!lgDetay.model) lgDetay.model = String(lgAd.model||lgAd.series||lgAd.seri||'');
          if (!lgDetay.yil)   lgDetay.yil   = parseInt(lgAd.year||lgAd.modelYear||0)||0;
          if (!lgDetay.km)    lgDetay.km    = parseInt(String(lgAd.km||lgAd.mileage||'0').replace(/\D/g,''))||0;
          if (!lgDetay.fiyat) lgDetay.fiyat = parseInt(String(lgAd.price||lgAd.listingPrice||0).replace(/\D/g,''))||0;
          if (!lgDetay.yakit) lgDetay.yakit  = letgoNormalizeYakit(String(lgAd.fuelType||lgAd.fuel||''));
          if (!lgDetay.vites) lgDetay.vites  = letgoNormalizeVites(String(lgAd.gearType||lgAd.gear||lgAd.transmission||''));
          if (!lgDetay.sehir) lgDetay.sehir  = String(lgAd.city||lgAd.cityName||lgAd.location||'');
        } catch(e5) { console.log('[ARAÇRADAR] Letgo NEXT_DATA hata:', e5.message); }
      }

      // 2. LD+JSON fallback
      if (!lgDetay.marka || !lgDetay.yil) {
        try {
          document.querySelectorAll('script[type="application/ld+json"]').forEach(function(sc) {
            try {
              var obj3 = JSON.parse(sc.textContent);
              var car3 = obj3['@type']==='Car'||obj3['@type']==='Vehicle' ? obj3 : ((obj3['@graph']||[]).find(function(x){return x['@type']==='Car'||x['@type']==='Vehicle';}) || null);
              if (car3) {
                if (!lgDetay.marka && car3.brand) lgDetay.marka = car3.brand.name||String(car3.brand);
                if (!lgDetay.model && car3.model) lgDetay.model = String(car3.model);
                if (!lgDetay.yil   && car3.productionDate) lgDetay.yil = parseInt(car3.productionDate)||0;
                if (!lgDetay.km    && car3.mileageFromOdometer) lgDetay.km = parseInt(String(car3.mileageFromOdometer.value||car3.mileageFromOdometer).replace(/\D/g,''))||0;
                if (!lgDetay.fiyat && car3.offers&&car3.offers.price) lgDetay.fiyat = parseInt(String(car3.offers.price).replace(/\D/g,''))||0;
                if (!lgDetay.yakit && car3.fuelType) lgDetay.yakit = letgoNormalizeYakit(String(car3.fuelType));
              }
            } catch(e6) {}
          });
        } catch(e7) {}
      }

      // 3. DOM fallback — li/span ve başlık+değer çiftleri
      if (!lgDetay.marka || !lgDetay.yil || !lgDetay.km) {
        var lgLiEls = document.querySelectorAll('li,[class*="spec"],[class*="detail"],[class*="property"],[class*="attribute"],[class*="feature"]');
        lgLiEls.forEach(function(el) {
          var spans2 = el.querySelectorAll('span,strong,b,p,div');
          if (spans2.length >= 2) {
            var k4 = spans2[0].textContent.trim().toLowerCase();
            var v4 = spans2[spans2.length-1].textContent.trim();
            if (!lgDetay.marka && (k4.indexOf('marka')!==-1||k4.indexOf('brand')!==-1)) lgDetay.marka = v4;
            if (!lgDetay.model && (k4.indexOf('model')!==-1||k4.indexOf('seri')!==-1)) lgDetay.model = v4;
            if (!lgDetay.yil   && (k4.indexOf('yıl')!==-1||k4.indexOf('year')!==-1)) lgDetay.yil = parseInt(v4)||0;
            if (!lgDetay.km    && (k4.indexOf('km')!==-1||k4.indexOf('kilometre')!==-1||k4.indexOf('mileage')!==-1)) lgDetay.km = parseInt(v4.replace(/\D/g,''))||0;
            if (!lgDetay.yakit && (k4.indexOf('yakıt')!==-1||k4.indexOf('fuel')!==-1)) lgDetay.yakit = letgoNormalizeYakit(v4);
            if (!lgDetay.vites && (k4.indexOf('vites')!==-1||k4.indexOf('gear')!==-1)) lgDetay.vites = letgoNormalizeVites(v4);
            if (!lgDetay.sehir && (k4.indexOf('şehir')!==-1||k4.indexOf('konum')!==-1||k4.indexOf('city')!==-1)) lgDetay.sehir = v4;
          }
        });
        // Fiyat DOM'dan
        if (!lgDetay.fiyat) {
          var lgFiyatEl = document.querySelector('[class*="price"],[class*="Price"],[class*="fiyat"],h1,h2');
          if (lgFiyatEl) {
            var lgFm = lgFiyatEl.textContent.match(/(\d{1,3}(?:[.,]\d{3})+)/);
            if (lgFm) lgDetay.fiyat = parseInt(lgFm[1].replace(/[.,]/g,''))||0;
          }
        }
      }

      // 4. URL'den marka/model çıkar (son fallback)
      if (!lgDetay.marka) {
        var lgSkip = ['letgo','com','ilan','item','otomobil','araba','satilik','ikinci','el'];
        var lgSlug = location.pathname.split('/').filter(Boolean).reduce(function(a,b){ return b.length>a.length&&b.indexOf('-')!==-1?b:a; },'');
        var lgWords = lgSlug.split('-').filter(function(w){ return w.length>1 && lgSkip.indexOf(w)===-1 && isNaN(w); });
        if (lgWords.length>=1) lgDetay.marka = lgWords[0].charAt(0).toUpperCase()+lgWords[0].slice(1);
        if (lgWords.length>=2) lgDetay.model = lgWords[1].charAt(0).toUpperCase()+lgWords[1].slice(1);
      }

      console.log('[ARAÇRADAR] Letgo detay final:', lgDetay.marka, lgDetay.model, lgDetay.yil, lgDetay.km, lgDetay.fiyat, lgDetay.yakit, lgDetay.vites);
      sendResponse(lgDetay);
      return true;
    }

    sendResponse(detay);
    return true;
  }

  if (msg.action === 'toplu' || msg.action === 'topluSilKontrol') {
    var ilanlar = ilanTopla();
    var action = msg.action === 'topluSilKontrol' ? 'ilanlarKaydetSilKontrol' : 'ilanlarKaydet';
    chrome.runtime.sendMessage({ action: action, ilanlar: ilanlar, etiket: msg.etiket }, function(r) {
      sendResponse({ ok: true, sayi: ilanlar.length });
    });
    return true;
  }
  if (msg.action === 'letgoButonTikla') {
    var ilanlar = [];
    var goruldu = {};

    function temizF(txt) {
      if (!txt) return 0;
      var s = String(txt).replace(/[\s\u00a0]/g,'');
      // "1.000.000TL" veya "1.000.000₺" formatı
      var m = s.match(/([\d][\d.]+[\d])(?:TL|₺)/);
      if (!m) m = s.match(/([\d]{3,})/);
      if (!m) return 0;
      return parseInt(m[1].replace(/\./g,'')) || 0;
    }

    // Yöntem 1: Tüm linkleri tara — letgo.com linklerini bul
    var tumLinkler = Array.from(document.querySelectorAll('a[href]')).filter(function(a) {
      var h = a.href || '';
      // İlan linkleri uzun ve sayı/harf içeriyor
      return h.includes('letgo.com') && h.length > 35 &&
             !h.includes('/arabalar') && !h.includes('/kategori') &&
             !h.includes('/profil') && !h.includes('/sepet') &&
             !h.includes('/sohbet') && !h.includes('/tekliflerim') &&
             !h.includes('/siparislerim') && !h.includes('/elden-teslim');
    });

    tumLinkler.forEach(function(a) {
      var url = (a.href || '').split('?')[0];
      if (!url || goruldu[url]) return;

      // Kart container'ı bul — yukarı çık
      var kart = a;
      for (var up = 0; up < 12; up++) {
        if (!kart.parentElement) break;
        kart = kart.parentElement;
        var txt = kart.textContent || '';
        // TL fiyat içeriyor mu?
        var fiyatM = txt.match(/([\d]{1,3}(?:\.[\d]{3})*)\s*(?:TL|₺)/);
        if (!fiyatM) continue;
        var fiyat = parseInt(fiyatM[1].replace(/\./g,'')) || 0;
        if (fiyat < 10000) continue;

        goruldu[url] = true;

        // Başlık
        var ad = '';
        var titleEls = kart.querySelectorAll('h1,h2,h3,h4,p[class*="title"],p[class*="Title"],[class*="subject"],[class*="name"]');
        for (var ti=0; ti<titleEls.length; ti++) {
          var t2 = (titleEls[ti].textContent||'').trim();
          if (t2 && t2.length > 3 && t2.length < 120 && !/^[\d\s.,₺TL]+$/.test(t2)) {
            ad = t2; break;
          }
        }
        if (!ad) {
          // Linkten slug al
          var parts = url.split('/');
          var slug = parts[parts.length-1] || parts[parts.length-2] || '';
          slug = slug.replace(/-[a-z0-9]{8,}$/, '').replace(/-/g,' ').trim();
          if (slug.length > 2) ad = slug.charAt(0).toUpperCase() + slug.slice(1);
        }
        if (!ad) ad = 'Letgo İlanı';

        var yilM = txt.match(/(20\d{2}|19[89]\d)/);
        var kmM  = txt.match(/([\d]{1,3}(?:[.,][\d]{3})*)\s*[Kk][Mm]/);

        ilanlar.push({
          id: 'ltg_' + url.split('/').pop(),
          url: url, fiyat: fiyat,
          ad: ad.substring(0, 200),
          marka:'', seri:'', model:'',
          yil: yilM ? parseInt(yilM[1]) : 0,
          km: kmM ? kmM[1].replace(/[.,]/g,'') : '',
          kaynak:'letgo'
        });
        break;
      }
    });

    // Scroll — daha fazla yükle
    window.scrollTo(0, document.body.scrollHeight);
    setTimeout(function(){ window.scrollTo(0, 0); }, 300);

    console.log('[ARAÇRADAR] Letgo:', ilanlar.length, 'ilan');
    sendResponse({ ok:true, ilanlar:ilanlar, bitti: ilanlar.length === 0 });
    return true;
  }




  if (msg.action === 'ilanlarAl') {
    var site = siteAlgila();
    if (site === 'letgo') {
      var baslangic = Date.now();
      var oncekiSayi = 0;
      var scrollSayisi = 0;
      var maxScroll = 5; // max 5 kez scroll

      function letgoScroll() {
        // Sayfanın en altına scroll — infinite scroll tetikle
        window.scrollTo(0, document.body.scrollHeight);
        setTimeout(function() { window.scrollTo(0, 0); }, 300);
        setTimeout(function() { window.scrollTo(0, document.body.scrollHeight); }, 800);
      }

      function letgoTopla() {
        var gecen = Date.now() - baslangic;
        var ilanlar = ilanTopla();

        // Scroll yap — daha fazla ilan yüklenmesi için
        if (scrollSayisi < maxScroll && gecen > (scrollSayisi + 1) * 2000) {
          scrollSayisi++;
          letgoScroll();
          console.log('[ARAÇRADAR] Scroll #'+scrollSayisi+', mevcut ilan:', ilanlar.length);
        }

        // Yeni ilan yüklenmediyse ve max scroll'a ulaştıysak bitir
        if (scrollSayisi >= maxScroll && ilanlar.length === oncekiSayi && ilanlar.length > 0) {
          console.log('[ARAÇRADAR] Letgo final:', ilanlar.length, 'ilan');
          sendResponse({ ok: true, ilanlar: ilanlar, sayi: ilanlar.length });
          return;
        }

        // İlan varsa kaydet, scroll devam etsin
        if (ilanlar.length > oncekiSayi) oncekiSayi = ilanlar.length;

        // Timeout
        if (gecen >= 15000) {
          console.log('[ARAÇRADAR] Letgo timeout:', ilanlar.length, 'ilan');
          sendResponse({ ok: true, ilanlar: ilanlar.length ? ilanlar : [], sayi: ilanlar.length });
          return;
        }

        setTimeout(letgoTopla, 1000);
      }
      setTimeout(letgoTopla, 3000); // İlk yükleme için 3sn bekle
      return true;
    }
    // Sahibinden/Arabam: anında
    var sonuc = ilanTopla();
    // captcha tespiti — {captcha:true} formatında mı döndü?
    if (sonuc && sonuc.captcha) {
      console.warn('[ARAÇRADAR] ilanlarAl captcha:', site);
      sendResponse({ ok: false, captcha: true, ilanlar: [], sayi: 0 });
    } else {
      var ilanlar = Array.isArray(sonuc) ? sonuc : [];
      console.log('[ARAÇRADAR] ilanlarAl ['+site+']:', ilanlar.length);
      sendResponse({ ok: true, ilanlar: ilanlar, sayi: ilanlar.length });
    }
    return true;
  }
});
