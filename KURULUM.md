# AraçRadar Hub — Kurulum

## 1. GitHub Pages'e yükleme

Bu klasördeki TÜM dosyaları GitHub deponun köküne (veya bir alt klasöre) yükle:

```
index.html        ← hub ana sayfası
tools.json        ← araç listesi (yeni araçlar buraya eklenir)
manifest.json     ← PWA tanımı
sw.js             ← service worker (çevrimdışı destek)
icon-192.png
icon-512.png
kasa-linkleri.html
pazar.html
```

Örnek: `tasiyicihesap.github.io/hub/` altına koyarsan adresin
`https://tasiyicihesap.github.io/hub/` olur.

> Not: Mevcut `aracradar` reposunun içine ayrı bir `hub/` klasörü olarak da
> koyabilirsin; hiçbir dosya çakışmaz çünkü hepsi göreli yol kullanıyor.

## 2. Telefona / bilgisayara kurulum (eklenti gibi)

- **Android (Chrome):** Sayfayı aç → alttaki "Kur" çubuğuna bas
  (veya menü → "Ana ekrana ekle").
- **iPhone (Safari):** Paylaş → "Ana Ekrana Ekle".
- **Bilgisayar (Chrome/Edge):** Adres çubuğundaki kurulum simgesine tıkla.

Kurulduktan sonra kendi ikonu ve penceresiyle, uygulama gibi açılır.
İnternet yokken bile daha önce açtığın araçlar önbellekten çalışır.

## 3. Yeni araç ekleme (kod değişikliği YOK)

1. Yeni HTML dosyasını aynı klasöre at (örn. `hasar-hesap.html`).
2. `tools.json` içine bir blok ekle:

```json
{
  "id": "hasar-hesap",
  "ad": "Hasar Hesaplayıcı",
  "aciklama": "Tramer ve boya/değişen bazlı fiyat düzeltme.",
  "ikon": "🔧",
  "dosya": "hasar-hesap.html",
  "renk": "#e0a435",
  "etiket": "Hesaplama"
}
```

3. Kaydet, GitHub'a pushla. Hub kartı otomatik görünür.

İstersen yeni HTML'e şu butonu `</body>` öncesine ekleyerek
hub'a dönüş düğmesi kazandırabilirsin (Claude'a yaptırdığın yeni
araçlarda bunu otomatik ekletebilirsin):

```html
<a href="index.html" style="position:fixed;bottom:18px;right:18px;z-index:99999;width:48px;height:48px;border-radius:50%;background:#0c1117;border:2px solid #35e08c;color:#35e08c;display:flex;align-items:center;justify-content:center;font-size:1.3rem;text-decoration:none;box-shadow:0 4px 14px rgba(0,0,0,.4)">⌂</a>
```

## 4. Güncelleme notu

`sw.js` içindeki `SURUM` değerini (`aracradar-hub-v1` → `v2`) artırırsan
tüm kullanıcılarda önbellek tazelenir. Araç HTML'lerinde büyük değişiklik
yaptığında bunu yapmayı unutma.

## 5. Sıradaki adım: ortak veri (istersen)

Şu an araçlar bağımsız çalışıyor (Pazar kendi IndexedDB'sini kullanıyor).
Hepsinin aynı Supabase tablosunu okumasını istersen — örneğin Kasa Linkleri
sayfasında bir modelin yanında "takipte 12 ilan var" gibi — bir sonraki
sohbette bu entegrasyonu ekleyebiliriz.
