"""
ARAÇRADAR — Arabam.com Scraper
GitHub Actions ortamında çalışır, Supabase'e yazar.
"""

import os, re, time, random, json, logging
import requests
from bs4 import BeautifulSoup
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('arabam')

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_KEY']
MOD          = os.environ.get('TARAMA_MOD', 'yeni')
MAX_SAYFA    = int(os.environ.get('MAX_SAYFA', '50'))

URLS = [
    {
        'url': 'https://www.arabam.com/ikinci-el/otomobil',
        'etiket': 'Arabam-Otomobil',
        'sayfa': MAX_SAYFA
    },
]

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
]

def human_delay(min_s=5, max_s=15):
    t = random.uniform(min_s, max_s)
    if random.random() < 0.08:
        t += random.uniform(15, 45)
    log.info(f'Bekleniyor: {t:.1f}s')
    time.sleep(t)

def sb_headers():
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': f'Bearer {SUPABASE_KEY}',
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
    }

def sb_mevcut_urller():
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
    log.info(f'DB\'de {len(urlset)} URL')
    return urlset

def sb_upsert(ilanlar):
    if not ilanlar: return 0
    BATCH = 50
    basari = 0
    for i in range(0, len(ilanlar), BATCH):
        r = requests.post(
            f'{SUPABASE_URL}/rest/v1/ilanlar',
            headers=sb_headers(),
            json=ilanlar[i:i+BATCH]
        )
        if r.status_code in (200, 201):
            basari += len(ilanlar[i:i+BATCH])
        else:
            log.error(f'Upsert hata: {r.status_code} {r.text[:200]}')
        time.sleep(0.3)
    log.info(f'Supabase: {basari}/{len(ilanlar)} yazıldı')
    return basari

def fiyat_parse(txt):
    txt = re.sub(r'[^\d]', '', str(txt))
    return int(txt) if txt else 0

def arabam_sayfa_parse(html, etiket):
    soup = BeautifulSoup(html, 'lxml')
    ilanlar = []

    # Arabam.com ilan satırları
    for row in soup.select('tr[data-id], .listing-list-item, [class*="classified-list-item"]'):
        try:
            a = row.select_one('a[href*="/ilan/"]')
            if not a: continue
            url = a.get('href', '')
            if not url.startswith('http'):
                url = 'https://www.arabam.com' + url
            url = url.split('?')[0]

            ad = a.get_text(strip=True)[:120]

            # Fiyat
            fiyat_el = row.select_one('[class*="price"], [class*="fiyat"]')
            fiyat = fiyat_parse(fiyat_el.get_text() if fiyat_el else '')

            # Yıl / KM
            yil, km = 0, ''
            for el in row.select('td, span, div'):
                txt = el.get_text(strip=True)
                if re.match(r'^(19|20)\d{2}$', txt):
                    yil = int(txt)
                elif re.search(r'\d[\d.,]* km', txt, re.I):
                    km = txt[:20]

            # URL'den ID
            m = re.search(r'/(\d+)$', url)
            ilan_id = m.group(1) if m else url.split('/')[-1]

            if url and fiyat > 0:
                ilanlar.append({
                    'id': f'ar_{ilan_id}',
                    'url': url,
                    'ad': ad,
                    'marka': '',
                    'seri': '',
                    'model': '',
                    'yil': yil,
                    'km': km,
                    'etiket': etiket,
                    'kaynak': 'arabam',
                    'gecmis': json.dumps([{'fiyat': fiyat, 'tarih': int(time.time() * 1000)}])
                })
        except Exception as e:
            log.debug(f'Row hata: {e}')

    return ilanlar

def bot_yakalandim_mi(html):
    html_lower = html.lower()
    return any(i in html_lower for i in ['captcha', 'robot', 'access denied', '403', 'rate limit', 'blocked'])

@retry(wait=wait_exponential(multiplier=2, min=30, max=300), stop=stop_after_attempt(3))
def sayfa_cek(session, url, sayfa_no):
    sep = '&' if '?' in url else '?'
    full_url = f'{url}{sep}take=50&skip={(sayfa_no - 1) * 50}'
    session.headers['User-Agent'] = random.choice(USER_AGENTS)
    session.headers['Referer'] = 'https://www.arabam.com/' if sayfa_no == 1 else url
    r = session.get(full_url, timeout=30)
    r.raise_for_status()
    return r.text

def tara():
    log.info(f'=== Arabam Tarama | Mod: {MOD} ===')
    mevcut = sb_mevcut_urller() if MOD == 'yeni' else set()
    toplam = 0

    for konfig in URLS:
        url    = konfig['url']
        etiket = konfig['etiket']
        max_s  = konfig.get('sayfa', MAX_SAYFA)

        session = requests.Session()
        session.headers.update({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'tr-TR,tr;q=0.9',
        })

        # Cookie al
        try:
            session.get('https://www.arabam.com/', timeout=20)
            human_delay(3, 8)
        except: pass

        sayfa_no = 1
        bos = 0
        tampon = []

        while sayfa_no <= max_s:
            log.info(f'Sayfa {sayfa_no}...')
            try:
                html = sayfa_cek(session, url, sayfa_no)
            except Exception as e:
                log.error(f'Hata: {e}')
                break

            if bot_yakalandim_mi(html):
                log.warning('Bot tespiti! Bekleniyor...')
                time.sleep(random.uniform(120, 300))
                session = requests.Session()
                try: session.get('https://www.arabam.com/', timeout=20)
                except: pass
                human_delay(20, 40)
                try:
                    html = sayfa_cek(session, url, sayfa_no)
                    if bot_yakalandim_mi(html): break
                except: break

            ilanlar = arabam_sayfa_parse(html, etiket)
            log.info(f'  {len(ilanlar)} ilan')

            if not ilanlar:
                bos += 1
                if bos >= 3: break
            else:
                bos = 0

            if MOD == 'yeni':
                yeni = [i for i in ilanlar if i['url'] not in mevcut]
                tampon.extend(yeni)
                toplam += len(yeni)
                if not yeni and sayfa_no > 3: break
            else:
                tampon.extend(ilanlar)
                toplam += len(ilanlar)

            if len(tampon) >= 100:
                sb_upsert(tampon)
                tampon = []

            sayfa_no += 1
            human_delay(5, 15)

        if tampon:
            sb_upsert(tampon)

    # Özet dosyasına ekle
    try:
        with open('/tmp/tarama_ozet.txt', 'a') as f:
            f.write(f'### Arabam\nToplam yeni: {toplam}\n')
    except: pass

    log.info(f'=== Arabam Bitti | Yeni: {toplam} ===')

if __name__ == '__main__':
    tara()
