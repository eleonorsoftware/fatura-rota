/* DEPO — TARAYICI TARAFI GÜNLÜK DEFTER (IndexedDB)
 * ================================================
 *
 * `lib/defter.js`in tarayıcı ikizi. Aynı kavramlar, aynı kurallar:
 *   - günlük liste her sabah sıfırdan başlar
 *   - adres hafızası hiç sıfırlanmaz
 *   - gün sınırı gece yarısı değil, SABAH 04:00
 *   - tekilleştirme anahtarı Çıkış Belgesi numarası
 *
 * Neden localStorage değil: bir yılda ~18.000 durak birikiyor ve
 * localStorage'ın 5 MB'lık sınırı sessizce dolup yazma hatası veriyor.
 * IndexedDB'nin pratikte böyle bir sınırı yok ve eşzamansız çalıştığı için
 * yazarken arayüz donmuyor.
 *
 * VERİ TELEFONDAN ÇIKMIYOR. Müşteri adı, telefonu ve adresi hiçbir sunucuya
 * gitmiyor; hepsi bu cihazda kalıyor.
 */
(function (global) {
  'use strict';

  const AD = 'fatura-rota';
  const SURUM = 1;
  const GUN_BASLANGIC_SAAT = 4;

  let _db = null;

  function ac() {
    if (_db) return Promise.resolve(_db);
    return new Promise((coz, hata) => {
      const istek = indexedDB.open(AD, SURUM);
      istek.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('gun')) db.createObjectStore('gun', { keyPath: 'tarih' });
        if (!db.objectStoreNames.contains('musteri')) db.createObjectStore('musteri', { keyPath: 'telefon' });
        if (!db.objectStoreNames.contains('ayar')) db.createObjectStore('ayar', { keyPath: 'anahtar' });
      };
      istek.onsuccess = () => { _db = istek.result; coz(_db); };
      istek.onerror = () => hata(istek.error);
    });
  }

  function islem(magaza, mod, is) {
    return ac().then((db) => new Promise((coz, hata) => {
      const t = db.transaction(magaza, mod);
      const m = t.objectStore(magaza);
      let sonuc;
      try { sonuc = is(m); } catch (e) { hata(e); return; }
      /* IDBRequest'in `result`u ancak işlem tamamlanınca dolar ve KAYIT YOKSA
         `undefined` olur. Bir zamanlar burada `sonuc.result !== undefined`
         diye bakılıyordu; kayıt bulunamadığında istek NESNESİ dönüyor,
         çağıran da onu geçerli bir kayıt sanıyordu. Sonuç: yeni gün hiç
         açılmıyor, `gun.tarih` undefined kalıyordu. Tür kontrolü şart. */
      t.oncomplete = () => coz(sonuc instanceof IDBRequest ? sonuc.result : sonuc);
      t.onerror = () => hata(t.error);
    }));
  }

  const getir = (magaza, anahtar) => islem(magaza, 'readonly', (m) => m.get(anahtar));
  const yaz = (magaza, deger) => islem(magaza, 'readwrite', (m) => m.put(deger));
  const hepsi = (magaza) => islem(magaza, 'readonly', (m) => m.getAll());

  /* ------------------------------------------------------------ yardımcı */

  /** İş günü — 04:00'ten önce hâlâ önceki gün. */
  function isGunu(d) {
    const t = new Date(d || Date.now());
    t.setHours(t.getHours() - GUN_BASLANGIC_SAAT);
    const p = (n) => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
  }

  function telefonAnahtari(t) {
    if (!t) return null;
    const r = String(t).replace(/\D/g, '');
    return r.length >= 10 ? r.slice(-10) : null;
  }

  function mesafe(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return Infinity;
    const R = 6371000, d = Math.PI / 180;
    const x = (b.lat - a.lat) * d, y = (b.lng - a.lng) * d;
    const h = Math.sin(x / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(y / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  const sadeAd = (s) => String(s || '').toLocaleLowerCase('tr').replace(/[^a-zçğıöşü0-9]+/g, ' ').trim();

  /* --------------------------------------------------------------- gün */

  async function gunAc(tarih) {
    const t = tarih || isGunu();
    let g = await getir('gun', t);
    if (!g) {
      /* Kapatılmayı unutulan önceki günleri kapat — dünün durakları bugüne
         karışmasın. */
      for (const eski of await hepsi('gun')) {
        if (eski.durum === 'acik' && eski.tarih !== t) {
          eski.durum = 'kapali';
          eski.kapanis = new Date().toISOString();
          eski.not = (eski.not || '') + ' otomatik kapatıldı';
          await yaz('gun', eski);
        }
      }
      g = { tarih: t, durum: 'acik', acilis: new Date().toISOString(), duraklar: [], sonrakiId: 1 };
      await yaz('gun', g);
    }
    return g;
  }

  const gunKaydet = (g) => yaz('gun', g);

  async function gunler() {
    const liste = await hepsi('gun');
    return liste.sort((a, b) => (a.tarih < b.tarih ? 1 : -1));
  }

  async function gunKapat(tarih, not) {
    const g = await getir('gun', tarih);
    if (!g) return null;
    g.durum = 'kapali';
    g.kapanis = new Date().toISOString();
    if (not) g.not = not;
    await gunKaydet(g);
    return g;
  }

  /**
   * Kapatılan günü geri açar.
   *
   * İki durumda gerekiyor: sürücü yanlışlıkla kapattığında, ve gün kapandıktan
   * sonra elinde bir fatura daha çıktığında. Aynı takvim gününde ikinci bir
   * "gün" kaydı açılamıyor (tarih birincil anahtar) — zaten doğrusu da bu:
   * o gün hâlâ aynı gün.
   */
  async function gunuYenidenAc(tarih) {
    const g = await getir('gun', tarih);
    if (!g) return null;
    g.durum = 'acik';
    g.kapanis = null;
    await gunKaydet(g);
    return g;
  }

  function ozet(g) {
    const d = (g && g.duraklar) || [];
    return {
      toplam: d.length,
      teslim: d.filter((x) => x.durum === 'teslim').length,
      basarisiz: d.filter((x) => x.durum === 'basarisiz').length,
      bekleyen: d.filter((x) => x.durum === 'bekliyor').length,
      parca: d.reduce((t, x) => t + (x.parca || 1), 0),
      kirmizi: d.filter((x) => x.renk === 'kirmizi').length,
      sari: d.filter((x) => x.renk === 'sari').length,
    };
  }

  /* -------------------------------------------------------------- durak */

  /**
   * Okutmayı güne ekler; aynı Çıkış Belgesi numarası varsa BİRLEŞTİRİR.
   * Dönüş: { durak, yeni, birlestirildi }
   */
  async function durakEkle(g, okutma) {
    const c = okutma.cozum || {};
    const belgeNo = okutma.belgeNo ? String(okutma.belgeNo).trim() : null;

    let mevcut = belgeNo ? g.duraklar.find((d) => d.belgeNo === belgeNo) : null;
    if (!mevcut && c.lat != null) {
      mevcut = g.duraklar.find((d) => mesafe(d, c) < 30 &&
        (!okutma.ad || !d.ad || sadeAd(d.ad) === sadeAd(okutma.ad))) || null;
    }

    if (mevcut) {
      const dahaIyi = (c.guven || 0) > (mevcut.guven || 0);
      mevcut.ad = okutma.ad || mevcut.ad;
      mevcut.telefon = okutma.telefon || mevcut.telefon;
      mevcut.urun = okutma.urun ? (mevcut.urun && mevcut.urun !== okutma.urun
        ? mevcut.urun + ' + ' + okutma.urun : okutma.urun) : mevcut.urun;
      mevcut.parca = Math.max(mevcut.parca || 1, okutma.parca || 1);
      for (const alan of ['ilce', 'mahalle', 'yol', 'kapino', 'daire', 'kat']) {
        if (dahaIyi && c[alan]) mevcut[alan] = c[alan];
        else if (!mevcut[alan] && c[alan]) mevcut[alan] = c[alan];
      }
      if (dahaIyi && c.lat != null) {
        mevcut.lat = c.lat; mevcut.lng = c.lng;
        mevcut.keskinlik = c.keskinlik; mevcut.guven = c.guven;
        mevcut.renk = c.renk; mevcut.uyarilar = c.uyarilar || [];
        mevcut.yolaUzaklik = c.yolaUzaklik;
      }
      mevcut.kareSayisi = (mevcut.kareSayisi || 1) + 1;
      mevcut.guncelleme = new Date().toISOString();
      await gunKaydet(g);
      return { durak: mevcut, yeni: false, birlestirildi: true };
    }

    const durak = {
      id: g.sonrakiId++,
      belgeNo, sira: null,
      ad: okutma.ad || null, telefon: okutma.telefon || null, urun: okutma.urun || null,
      parca: okutma.parca || 1, kareSayisi: 1,
      ilce: c.ilce || null, mahalle: c.mahalle || null, yol: c.yol || null,
      kapino: c.kapino || null, daire: c.daire || null, kat: c.kat || null,
      lat: c.lat ?? null, lng: c.lng ?? null,
      keskinlik: c.keskinlik || 'yok', guven: c.guven ?? 0, renk: c.renk || 'kirmizi',
      yolaUzaklik: c.yolaUzaklik ?? null, uyarilar: c.uyarilar || [],
      hamMetin: okutma.hamMetin || null,
      durum: 'bekliyor', durumSebep: null, bitis: null,
      elleDuzeltildi: false,
      olusturma: new Date().toISOString(), guncelleme: new Date().toISOString(),
    };
    g.duraklar.push(durak);
    await gunKaydet(g);
    return { durak, yeni: true, birlestirildi: false };
  }

  async function durakSil(g, id) {
    g.duraklar = g.duraklar.filter((d) => d.id !== id);
    await gunKaydet(g);
  }

  async function durakDuzelt(g, id, yeni) {
    const d = g.duraklar.find((x) => x.id === id);
    if (!d) return null;
    Object.assign(d, yeni);
    d.elleDuzeltildi = true;
    d.renk = 'yesil';
    d.guven = 100;
    d.guncelleme = new Date().toISOString();
    await gunKaydet(g);
    return d;
  }

  async function durumYaz(g, id, durum, sebep) {
    const d = g.duraklar.find((x) => x.id === id);
    if (!d) return null;
    d.durum = durum;
    d.durumSebep = sebep || null;
    d.bitis = new Date().toISOString();
    d.guncelleme = d.bitis;
    await gunKaydet(g);
    if (durum === 'teslim') await hafizayaYaz(d);
    return d;
  }

  async function rotaKaydet(g, sirali, ozetBilgi) {
    g.duraklar.forEach((d) => { d.sira = null; });
    sirali.forEach((id, i) => {
      const d = g.duraklar.find((x) => x.id === id);
      if (d) d.sira = i + 1;
    });
    g.rota = { ...ozetBilgi, zaman: new Date().toISOString() };
    await gunKaydet(g);
  }

  const siraliDuraklar = (g) => (g.duraklar || []).slice().sort((a, b) => {
    if (a.sira == null && b.sira == null) return a.id - b.id;
    if (a.sira == null) return 1;
    if (b.sira == null) return -1;
    return a.sira - b.sira;
  });

  const siradaki = (g) => siraliDuraklar(g).find((d) => d.durum === 'bekliyor') || null;

  /* ---------------------------------------------------- adres hafızası */

  async function hafizayaYaz(durak) {
    const tel = telefonAnahtari(durak.telefon);
    if (!tel || durak.lat == null) return null;
    const v = await getir('musteri', tel);
    if (v) {
      /* Elle düzeltilmiş kayıt, sonraki otomatik okumayla EZİLMEZ. */
      const koru = v.elleDuzeltildi && !durak.elleDuzeltildi;
      if (!koru) {
        for (const a of ['ilce', 'mahalle', 'yol', 'kapino', 'daire', 'kat']) if (durak[a]) v[a] = durak[a];
        v.lat = durak.lat; v.lng = durak.lng; v.guven = durak.guven;
      }
      v.ad = durak.ad || v.ad;
      v.elleDuzeltildi = v.elleDuzeltildi || !!durak.elleDuzeltildi;
      v.teslimatSayisi = (v.teslimatSayisi || 0) + 1;
      v.sonGorulme = new Date().toISOString();
      await yaz('musteri', v);
      return v;
    }
    const m = {
      telefon: tel, ad: durak.ad || null,
      ilce: durak.ilce, mahalle: durak.mahalle, yol: durak.yol,
      kapino: durak.kapino, daire: durak.daire, kat: durak.kat,
      lat: durak.lat, lng: durak.lng, guven: durak.guven,
      elleDuzeltildi: !!durak.elleDuzeltildi, teslimatSayisi: 1,
      not: null,
      ilkGorulme: new Date().toISOString(), sonGorulme: new Date().toISOString(),
    };
    await yaz('musteri', m);
    return m;
  }

  async function hafizadanAra(telefon) {
    const tel = telefonAnahtari(telefon);
    if (!tel) return null;
    return (await getir('musteri', tel)) || null;
  }

  async function hafizaNotu(telefon, not) {
    const m = await hafizadanAra(telefon);
    if (!m) return null;
    m.not = not;
    await yaz('musteri', m);
    return m;
  }

  const musteriler = () => hepsi('musteri');

  /* --------------------------------------------------------------- ayar */

  const ayarGetir = async (a, varsayilan) => ((await getir('ayar', a)) || { deger: varsayilan }).deger;
  const ayarYaz = (a, deger) => yaz('ayar', { anahtar: a, deger });

  global.Depo = {
    ac, isGunu, telefonAnahtari,
    gunAc, gunKaydet, gunler, gunKapat, gunuYenidenAc, ozet,
    durakEkle, durakSil, durakDuzelt, durumYaz, rotaKaydet, siraliDuraklar, siradaki,
    hafizayaYaz, hafizadanAra, hafizaNotu, musteriler,
    ayarGetir, ayarYaz,
    GUN_BASLANGIC_SAAT,
  };
})(window);
