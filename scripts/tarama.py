#!/usr/bin/env python3
"""ARAÇRADAR GitHub Actions Tarama"""
import requests, json, os, re, time
from datetime import datetime
from bs4 import BeautifulSoup

REPO = os.environ.get('REPO', 'tasiyicihesap/aracradar')
DATA_DIR = 'data'
PARCA_BOYUT = 5000
HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'tr-TR,tr;q=0.9',
}
LINKLER = [
    {'site':'sahibinden','url':'https://www.sahibinden.com/otomobil/dizel,benzin-lpg/otomatik/sahibinden','params':{'pagingSize':'50','a116445':'1263354','a4_max':'350000','a5_min':'2005','price_min':'50000','price_max':'750000'},'etiket':'Otomobil'},
    {'site':'sahibinden','url':'https://www.sahibinden.com/arazi-suv-pickup/dizel,benzin-lpg/otomatik/sahibinden','params':{'a277_min':'2005','a116446':'1263360','a276_min':'100000'},'etiket':'Arazi'},
    {'site':'arabam','url':'https://www.arabam.com/ikinci-el/otomobil-sahibinden','params':{'minYear':'2005','gear':'Otomatik','fuel':['Benzin','Dizel','LPG'],'maxkm':'350000','severaldamaged':'false','take':'50'},'etiket':'Otomobil'},
    {'site':'arabam','url':'https://www.arabam.com/ikinci-el/arazi-suv-pick-up-sahibinden','params':{'minkm':'100000','fuel':['Benzin','Dizel','LPG'],'gear':'Otomatik','severaldamaged':'false'},'etiket':'Arazi'},
]

def temiz_fiyat(txt):
    if not txt: return 0
    m = re.search(r'[\d.]+', re.sub(r'\s','',str(txt)))
    return int(m.group().replace('.','')) if m else 0

def sahibinden_tara(link):
    ilanlar = []
    s = requests.Session(); s.headers.update(HEADERS)
    for sayfa in range(1, 4):
        try:
            p = dict(link['params']); p['pagingOffset'] = str((sayfa-1)*50)
            r = s.get(link['url'], params=p, timeout=15)
            if r.status_code != 200: break
            soup = BeautifulSoup(r.text, 'lxml')
            trs = soup.select('tr.searchResultsItem')
            if not trs: break
            for tr in trs:
                a = tr.select_one('td.searchResultsTitleValue a')
                fe = tr.select_one('td.searchResultsPriceValue')
                if not a or not fe: continue
                url = 'https://www.sahibinden.com' + a.get('href','').split('?')[0]
                ad = a.get_text(strip=True)
                fiyat = temiz_fiyat(fe.get_text())
                tds = tr.select('td')
                yil = int(tds[4].get_text(strip=True)) if len(tds)>4 and tds[4].get_text(strip=True).isdigit() else 0
                km = re.sub(r'[^\d]','',tds[5].get_text()) if len(tds)>5 else ''
                sehir_el = tr.select_one('td.searchResultsLocationValue')
                sehir = sehir_el.get_text(strip=True) if sehir_el else ''
                ilan_id = url.split('/')[-1]
                if not ilan_id or not fiyat: continue
                ilanlar.append({'id':ilan_id,'url':url,'ad':ad,'fiyat':fiyat,'yil':yil,'km':km,'sehir':sehir,'kaynak':'sahibinden','etiket':link['etiket'],'gecmis':[{'fiyat':fiyat,'tarih':datetime.now().isoformat()}],'guncelleme':datetime.now().isoformat()})
            time.sleep(2)
        except Exception as e: print(f'SHB hata {sayfa}: {e}'); break
    print(f"SHB {link['etiket']}: {len(ilanlar)}")
    return ilanlar

def arabam_tara(link):
    ilanlar = []
    s = requests.Session(); s.headers.update(HEADERS)
    for sayfa in range(1, 4):
        try:
            p = dict(link['params']); p['page'] = str(sayfa)
            r = s.get(link['url'], params=p, timeout=15)
            if r.status_code != 200: break
            soup = BeautifulSoup(r.text, 'lxml')
            kartlar = soup.select('[class*="listing-list-item"]') or soup.select('tr[data-id]')
            if not kartlar: break
            for kart in kartlar:
                a = kart.select_one('a[href]')
                if not a: continue
                url = a.get('href','')
                if url.startswith('/'): url = 'https://www.arabam.com' + url
                url = url.split('?')[0]
                ad_el = kart.select_one('[class*="title"], h3, .listing-title')
                ad = ad_el.get_text(strip=True) if ad_el else ''
                fe = kart.select_one('[class*="price"], .listing-price')
                fiyat = temiz_fiyat(fe.get_text() if fe else '')
                txt = kart.get_text()
                yil_m = re.search(r'(20\d{2}|19[89]\d)', txt)
                km_m = re.search(r'([\d.]+)\s*[Kk][Mm]', txt)
                yil = int(yil_m.group(1)) if yil_m else 0
                km = re.sub(r'[^\d]','',km_m.group(1)) if km_m else ''
                id_m = re.search(r'/(\d+)$', url)
                ilan_id = 'ar_'+(id_m.group(1) if id_m else url[-15:])
                if not fiyat: continue
                ilanlar.append({'id':ilan_id,'url':url,'ad':ad,'fiyat':fiyat,'yil':yil,'km':km,'kaynak':'arabam','etiket':link['etiket'],'gecmis':[{'fiyat':fiyat,'tarih':datetime.now().isoformat()}],'guncelleme':datetime.now().isoformat()})
            time.sleep(2)
        except Exception as e: print(f'ARB hata {sayfa}: {e}'); break
    print(f"ARB {link['etiket']}: {len(ilanlar)}")
    return ilanlar

def mevcut_yukle():
    mevcut = {}
    try:
        meta = requests.get(f'https://raw.githubusercontent.com/{REPO}/main/data/meta.json',timeout=10).json()
        for yol in meta.get('parcalar',[]):
            fname = yol.split('/')[-1]
            pr = requests.get(f'https://raw.githubusercontent.com/{REPO}/main/data/{fname}',timeout=15)
            if pr.status_code==200:
                for il in pr.json():
                    if il.get('id'): mevcut[il['id']]=il
        print(f"Mevcut: {len(mevcut)} ilan")
    except Exception as e: print(f"Mevcut yükleme hatası: {e}")
    return mevcut

def kaydet(mevcut):
    os.makedirs(DATA_DIR, exist_ok=True)
    liste = list(mevcut.values())
    parcalar = []
    for i in range(0, len(liste), PARCA_BOYUT):
        fname = f'ilanlar_{len(parcalar)}.json'
        with open(os.path.join(DATA_DIR,fname),'w',encoding='utf-8') as f:
            json.dump(liste[i:i+PARCA_BOYUT],f,ensure_ascii=False,separators=(',',':'))
        parcalar.append(f'data/{fname}')
    meta = {'toplam':len(liste),'guncelleme':int(datetime.now().timestamp()*1000),'versiyon':3,'parca_sayisi':len(parcalar),'parcalar':parcalar}
    with open(os.path.join(DATA_DIR,'meta.json'),'w') as f:
        json.dump(meta,f,ensure_ascii=False,indent=2)
    print(f"Kaydedildi: {len(liste)} ilan, {len(parcalar)} parça")

def main():
    print(f"Başladı: {datetime.now().strftime('%H:%M:%S')}")
    mevcut = mevcut_yukle()
    yeni=0; gunc=0
    for link in LINKLER:
        try:
            fn = sahibinden_tara if link['site']=='sahibinden' else arabam_tara
            for il in fn(link):
                iid = il['id']
                if iid in mevcut:
                    eski_f = (mevcut[iid].get('gecmis') or [{'fiyat':0}])[-1]['fiyat']
                    if il['fiyat']!=eski_f:
                        g = mevcut[iid].get('gecmis',[])
                        g.append({'fiyat':il['fiyat'],'tarih':datetime.now().isoformat()})
                        mevcut[iid]['gecmis']=g[-10:]
                        mevcut[iid]['fiyat']=il['fiyat']
                        mevcut[iid]['guncelleme']=il['guncelleme']
                        gunc+=1
                else:
                    mevcut[iid]=il; yeni+=1
        except Exception as e: print(f"Hata: {e}")
    print(f"Yeni: {yeni}, Güncellendi: {gunc}")
    kaydet(mevcut)
    print(f"Tamamlandı: {datetime.now().strftime('%H:%M:%S')}")

if __name__=='__main__':
    main()
