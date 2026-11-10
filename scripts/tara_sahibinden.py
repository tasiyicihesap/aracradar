"""
ARAÇRADAR — Sahibinden.com Scraper
GitHub Actions ortamında çalışır, Supabase'e yazar.
Bot tespitinden kaçınmak için: random delays, rotating UA, human-like behavior
"""

import os, re, time, random, json, logging
from datetime import datetime
import requests
from bs4 import BeautifulSoup
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('sahibinden')

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_KEY']
MOD          = os.environ.get('TARAMA_MOD', 'yeni')   # yeni | guncelleme | tam
MAX_SAYFA    = int(os.environ.get('MAX_SAYFA', '50'))

# ── Taranacak URL'ler ────────────────────────────────────────────────────────
# Bunları kendi filtrelerinize göre güncelleyin
URLS = [
    {
        'url': 'https://www.sahibinden.com/otomobil',
        'etiket': 'Sahibinden-Otomobil',
        'sayfa': MAX_SAYFA
    },
    # Örnek ek URL:
    # {
    #     'url': 'https://www.sahibinden.com/otomobil/benzin',
    #     'etiket': 'Sahibinden-Benzin',
    #     'sayfa': MAX_SAYFA
    # },
]

# ── Anti-bot ayarları ────────────────────────────────────────────────────────
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
]

def random_ua():
    return random.choice(USER_AGENTS)

def human_delay(min_s=4, max_s=12):
    """İnsan gibi rastgele bekleme"""
    t = random.uniform(min_s, max_s)
    # Bazen daha uzun bekle (gerçek insanlar bazen duraklar)
    if random.random() < 0.1:
        t += random.uniform(10, 30)
    log.info(f'Bekleniyor: {t:.1f}s')
    time.sleep(t)

def make_session():
    s = requests.Session()
    s.headers.update({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'DNT': '1',
        'Cache-Control': 'max-age=0',
    })
    return s

# ── Supabase fonksiyonları ───────────────────────────────────────────────────
def sb_headers():
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
    }

def sb_mevcut_urller():
    """DB'deki tüm URL'leri set olarak getir — yeni mod için"""
    log.info('Mevcut URL\'ler alınıyor...')
    urlset = set()
    offset = 0
    while True:
        r = requests.get(
            f'{SUPABASE_URL}/rest/v1/ilanlar?select=url&limit=1000&offset={offset}',
            headers=sb_headers()
        )
        data = r.json()
        if not data: break
        for row in data:
            if row.get('url'): urlset.add(row['url'])
        if len(data) < 1000: break
        offset += 1000
    log.info(f'DB\'de {len(urlset)} URL mevcut')
    return urlset

def sb_upsert(ilanlar):
    """Toplu upsert — 50'şer batch"""
    if not ilanlar: return
    BATCH = 50
    basari = 0
    for i in range(0, len(ilanlar), BATCH):
        parca = ilanlar[i:i+BATCH]
        r = requests.post(
            f'{SUPABASE_URL}/rest/v1/ilanlar',
            headers=sb_headers(),
            json=parca
        )
        if r.status_code in (200, 201):
            basari += len(parca)
        else:
            log.error(f'Upsert hatası: {r.status_code} {r.text[:200]}')
        time.sleep(0.3)
    log.info(f'Supabase\'e {basari}/{len(ilanlar)} ilan yazıldı')
    return basari

# ── Sahibinden parser ────────────────────────────────────────────────────────
def fiyat_parse(txt):
    if not txt: return 0
    txt = re.sub(r'[^\d]', '', str(txt))
    return int(txt) if txt else 0

def sahibinden_sayfa_parse(html, etiket):
    """Sahibinden liste sayfasından ilanları çıkar"""
    soup = BeautifulSoup(html, 'lxml')
    ilanlar = []

    for row in soup.select('tr.searchResultsItem, tr[data-id]'):
        try:
            # URL
            a = row.select_one('a.classifiedTitle, td.searchResultsTitleValue a')
            if not a: continue
            url = a.get('href', '')
            if not url.startswith('http'):
                url = 'https://www.sahibinden.com' + url
            # id — URL'nin son parçası
            url_clean = url.split('?')[0]

            # Başlık
            ad = a.get_text(strip=True)[:120]

            # Fiyat
            fiyat_el = row.select_one('.classified-price-wrapper, .price-info, td.searchResultsPriceValue')
            fiyat = fiyat_parse(fiyat_el.get_text() if fiyat_el else '')

            # Yıl / KM — tablo hücreleri
            tds = row.select('td')
            yil, km = 0, ''
            for td in tds:
                txt = td.get_text(strip=True)
                if re.match(r'^(19|20)\d{2}$', txt):
                    yil = int(txt)
                elif re.match(r'^\d[\d.,]* km$', txt, re.I):
                    km = txt

            # Marka / Model — başlıktan çıkar
            marka, model = '', ''
            breadcrumb = row.select_one('[class*="breadcrumb"], [class*="category"]')
            if breadcrumb:
                parts = breadcrumb.get_text(' ', strip=True).split()
                if len(parts) >= 2:
                    marka, model = parts[0], parts[1]

            # İlan ID
            ilan_id = url_clean.split('/')[-1]
            if not ilan_id.isdigit():
                ilan_id = url_clean.replace('https://www.sahibinden.com/', '').replace('/', '-')

            if url_clean and fiyat > 0:
                ilanlar.append({
                    'id': ilan_id,
                    'url': url_clean,
                    'ad': ad,
                    'marka': marka,
                    'seri': model,
                    'model': '',
                    'yil': yil,
                    'km': km,
                    'etiket': etiket,
                    'kaynak': 'sahibinden',
                    'gecmis': json.dumps([{'fiyat': fiyat, 'tarih': int(time.time() * 1000)}])
                })
        except Exception as e:
            log.debug(f'Row parse hata: {e}')
            continue

    return ilanlar

def bot_yakalandim_mi(html):
    """Sahibinden'in bot tespiti sayfalarını kontrol et"""
    html_lower = html.lower()
    isaretler = [
        'robot', 'captcha', 'doğrulama', 'bot detection',
        'access denied', 'too many requests', 'rate limit',
        '403', 'engellendi', 'block', 'recaptcha'
    ]
    return any(i in html_lower for i in isaretler)

@retry(
    wait=wait_exponential(multiplier=2, min=30, max=300),
    stop=stop_after_attempt(3),
    retry=retry_if_exception_type(requests.RequestException)
)
def sayfa_cek(session, url, sayfa_no):
    """Tek sayfayı çek — retry mekanizması ile"""
    # Sayfa parametresi ekle
    sep = '&' if '?' in url else '?'
    full_url = f'{url}{sep}pagingOffset={(sayfa_no - 1) * 20}&pagingSize=20'

    # Her istekte yeni UA
    session.headers['User-Agent'] = random_ua()
    # Referer ekle (daha gerçekçi)
    session.headers['Referer'] = 'https://www.sahibinden.com/' if sayfa_no == 1 else url

    r = session.get(full_url, timeout=30)
    r.raise_for_status()
    return r.text

# ── Ana tarama fonksiyonu ────────────────────────────────────────────────────
def tara():
    log.info(f'=== Sahibinden Tarama Başlıyor | Mod: {MOD} ===')
    mevcut_urlset = sb_mevcut_urller() if MOD == 'yeni' else set()

    toplam_yeni = 0
    toplam_guncelleme = 0
    ozet = []

    for konfig in URLS:
        url    = konfig['url']
        etiket = konfig['etiket']
        max_s  = konfig.get('sayfa', MAX_SAYFA)

        log.info(f'URL: {url} | Etiket: {etiket} | Max: {max_s} sayfa')
        session = make_session()

        # İlk sayfayı çek — session cookie almak için
        try:
            log.info('Ana sayfaya bağlanılıyor (cookie)...')
            session.get('https://www.sahibinden.com/', timeout=20)
            human_delay(3, 7)
        except Exception as e:
            log.warning(f'Ana sayfa hatası: {e}')

        sayfa_no   = 1
        bos_sayfa  = 0
        ilan_tampon = []

        while sayfa_no <= max_s:
            log.info(f'Sayfa {sayfa_no}/{max_s}...')
            try:
                html = sayfa_cek(session, url, sayfa_no)
            except Exception as e:
                log.error(f'Sayfa çekme hatası: {e}')
                break

            if bot_yakalandim_mi(html):
                log.warning('⚠️ Bot tespiti! Uzun bekleme...')
                time.sleep(random.uniform(120, 240))
                # Session yenile
                session = make_session()
                try:
                    session.get('https://www.sahibinden.com/', timeout=20)
                    human_delay(15, 30)
                except: pass
                # Sayfayı tekrar dene
                try:
                    html = sayfa_cek(session, url, sayfa_no)
                    if bot_yakalandim_mi(html):
                        log.error('İkinci denemede de bot tespiti. Duruluyor.')
                        break
                except:
                    break

            ilanlar = sahibinden_sayfa_parse(html, etiket)
            log.info(f'  {len(ilanlar)} ilan çıkarıldı')

            if not ilanlar:
                bos_sayfa += 1
                if bos_sayfa >= 3:
                    log.info('3 ardışık boş sayfa — tarama bitti')
                    break
            else:
                bos_sayfa = 0

            # Yeni mod: sadece DB'de olmayanları ekle
            if MOD == 'yeni':
                yeni = [i for i in ilanlar if i['url'] not in mevcut_urlset]
                ilan_tampon.extend(yeni)
                toplam_yeni += len(yeni)
                log.info(f'  {len(yeni)} yeni ilan (toplam: {toplam_yeni})')

                # Yeni ilan kalmadıysa dur (hepsini gördük)
                if not yeni and sayfa_no > 3:
                    log.info('Yeni ilan kalmadı — tarama tamamlandı')
                    break
            else:
                ilan_tampon.extend(ilanlar)
                toplam_yeni += len(ilanlar)

            # Her 100 ilanda bir yaz
            if len(ilan_tampon) >= 100:
                sb_upsert(ilan_tampon)
                ilan_tampon = []
                human_delay(2, 5)

            sayfa_no += 1
            # Sayfa arası bekleme: 5-15 saniye (çok daha uzun aralıklar)
            human_delay(5, 15)

        # Kalan ilanları yaz
        if ilan_tampon:
            sb_upsert(ilan_tampon)

        ozet.append(f'- {etiket}: {toplam_yeni} ilan')

    # Özet dosyası
    ozet_txt = '\n'.join(ozet)
    with open('/tmp/tarama_ozet.txt', 'w') as f:
        f.write(f'### Sahibinden\n{ozet_txt}\nToplam yeni: {toplam_yeni}\n')

    log.info(f'=== Sahibinden Tarama Bitti | Yeni: {toplam_yeni} ===')
    return toplam_yeni

if __name__ == '__main__':
    tara()
