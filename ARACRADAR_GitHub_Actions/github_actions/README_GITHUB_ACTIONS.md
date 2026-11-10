# ARAÇRADAR — GitHub Actions Kurulum Rehberi

## 1. Bu dosyaları GitHub repo'nuza ekleyin

```
tasiyicihesap/aracradar/
├── .github/
│   └── workflows/
│       └── aracradar-scraper.yml   ← Bu dosya
├── scripts/
│   ├── tara_sahibinden.py          ← Bu dosya
│   └── tara_arabam.py             ← Bu dosya
└── README_GITHUB_ACTIONS.md       ← Bu dosya
```

## 2. GitHub Secrets Ekleyin

GitHub repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret Adı | Değer |
|---|---|
| `SUPABASE_URL` | `https://nnwbdmlqelbadavoslxf.supabase.co` |
| `SUPABASE_KEY` | `sb_publishable_tuG1PYIy0m5fOgnjaFpV9A_trDSYIsg` |

## 3. Tarama URL'lerini Ayarlayın

`scripts/tara_sahibinden.py` dosyasında `URLS` listesini kendi filtrelerinize göre düzenleyin:

```python
URLS = [
    {
        'url': 'https://www.sahibinden.com/otomobil',
        'etiket': 'Sahibinden-Otomobil',
        'sayfa': 50   # kaç sayfa taransın
    },
    {
        'url': 'https://www.sahibinden.com/otomobil/benzin',
        'etiket': 'Benzin',
        'sayfa': 30
    },
]
```

## 4. Çalışma Zamanları

Otomatik olarak günde 3 kez çalışır:
- 🌙 **Gece 05:00** (TR) — tam tarama
- ☀️ **11:00** (TR) — güncelleme
- 🌇 **17:00** (TR) — akşam güncellemesi

## 5. Manuel Çalıştırma

GitHub repo → **Actions** → **ARAÇRADAR — Otomatik Tarama** → **Run workflow**

Seçenekler:
- **yeni** — sadece DB'de olmayan ilanları ekler (hızlı, bot riski düşük)
- **guncelleme** — mevcut ilanların fiyatını günceller
- **tam** — her şeyi tarar (yavaş)

## 6. Bot Tespitinden Kaçınma Stratejisi

Script şunları yapıyor:
- ✅ Her istek arasında **5-15 saniye** random bekleme
- ✅ %8 ihtimalle **10-45 saniye** ekstra duraklama
- ✅ Her sayfada farklı **User-Agent**
- ✅ Gerçekçi **Referer** ve header'lar
- ✅ Bot tespitinde **2-5 dakika** bekleme ve yeniden deneme
- ✅ **Sadece yeni ilanlar** modu — çok daha az sayfa geziliyor

## 7. Extension ile Birlikte Kullanım

GitHub Actions gece çalışır ve yeni ilanları Supabase'e yazar.
Extension sadece Supabase'i okur — bot riski sıfır.

Tarama frekansını extension'da düşürebilirsiniz:
`Ayarlar & Tarama → Tarama Sıklığı → 2 saatte bir`
