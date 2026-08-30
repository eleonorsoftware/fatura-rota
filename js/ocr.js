/* OCR — FOTOĞRAFTAN METİN
 * ======================
 *
 * İKİ MOTOR, TEK ARAYÜZ
 * ---------------------
 * `Ocr.oku(dosya)` her yerde aynı şeyi döndürüyor; altında kim çalışıyor
 * uygulamayı ilgilendirmiyor:
 *
 *   ANDROID (APK)  : ML Kit — cihazın kendi metin tanıyıcısı. ~0,3 sn,
 *                    Latin alfabesini (Türkçe harfler dâhil) okuyor.
 *   iPHONE / WEB   : Tesseract.js — WebAssembly, tamamen cihazda, internetsiz.
 *                    ~5-15 sn. Apple'ın kendi OCR'ı Türkçe desteklemiyor,
 *                    Safari'de başka seçenek yok.
 *
 * ÖN İŞLEME — ÖLÇÜLEREK SEÇİLDİ
 * -----------------------------
 * Tesseract ~300 DPI'a göre ayarlı. A4'ün kısa kenarı 21 cm olduğuna göre
 * 300 DPI ≈ 2480 piksel. Kaynak fotoğraf küçükse büyütülüyor, devasa telefon
 * fotoğrafıysa küçültülüyor (8000 px'te Tesseract dakikalarca uğraşıyor ve
 * daha iyi sonuç vermiyor).
 *
 * 18 gerçek fotoğrafta ölçülen etki:
 *   ham (900 px)              → mahalle ve alıcı adı okunamıyor
 *   2480 px + gri + normalize → 10/18 tam, 4 kısmi, 4 okunamadı
 * Test fotoğrafları WhatsApp'ın 900x1600'e sıkıştırdığı kopyalardı (A4 için
 * ~75 DPI). Uygulama kameradan doğrudan çektiğinde girdi 3-4 kat daha iyi
 * olacak; bu oranlar alt sınır sayılmalı.
 *
 * KELİME GÜVENİ NEDEN ÖNEMLİ
 * --------------------------
 * Motor, kapı numarasını taşıyan sözcüğün OCR güvenine bakıp gerekirse
 * sonucu sarıya çekiyor. Sayfa geneli güveni yerine tek sözcüğe bakılıyor:
 * filigran ve el yazısı sayfa ortalamasını düşürüyor, doğru okunan adresler
 * de gereksiz yere sarıya iniyordu.
 */
(function (global) {
  'use strict';

  const HEDEF_GENISLIK = 2480;
  const DIL = 'tur';

  let _isci = null;
  let _hazirlaniyor = null;

  /** Tesseract işçisini bir kez kurar; sonraki çağrılar aynısını kullanır. */
  function isciHazirla(ilerleme) {
    if (_isci) return Promise.resolve(_isci);
    if (_hazirlaniyor) return _hazirlaniyor;
    _hazirlaniyor = (async () => {
      if (!global.Tesseract) throw new Error('Tesseract yüklenemedi');
      _isci = await global.Tesseract.createWorker(DIL, 1, {
        /* Hepsi yerelden — CDN yok, internet yok, ücret yok. */
        workerPath: 'ocr/worker.min.js',
        corePath: 'ocr/',
        langPath: 'ocr',
        gzip: false,
        logger: (m) => {
          if (ilerleme && m.status) ilerleme(m.status, m.progress || 0);
        },
      });
      return _isci;
    })();
    return _hazirlaniyor;
  }

  /**
   * iOS'ta tuval için toplam piksel tavanı.
   *
   * iPhone kamerası 12 MP çekiyor (4032×3024). Bunu 2480 px genişliğe
   * indirsek bile 2480×1860 ≈ 4,6 MP tuval ediyor ve iOS Safari'nin tuval
   * bellek bütçesi bunu KAYNAK GÖRÜNTÜYLE BİRLİKTE kaldıramayabiliyor.
   * Kritik olan şu: iOS bu durumda HATA VERMİYOR — sessizce BOŞ (şeffaf ya da
   * siyah) bir tuval veriyor. OCR de boş sayfa okuyup "yazı bulunamadı" diyor.
   * Kullanıcıya "yüklenmiyor" gibi görünen şey tam olarak budur.
   *
   * Bu yüzden hem tavan konuyor hem de çizimden sonra tuvalin gerçekten
   * dolu olup olmadığı DENETLENİYOR (bkz. tuvalBosMu).
   */
  const AZAMI_PIKSEL = 4.2e6;

  /** Tuval gerçekten çizildi mi? iOS bellek yetmeyince sessizce boş bırakıyor. */
  function tuvalBosMu(c, genislik, yukseklik) {
    /* Görüntünün ortasından ve köşelerinden küçük örnekler alınıyor; hepsi
       tek renkse (ya da tamamen saydamsa) çizim başarısız demektir. */
    const noktalar = [
      [genislik >> 1, yukseklik >> 1], [genislik >> 2, yukseklik >> 2],
      [(genislik * 3) >> 2, (yukseklik * 3) >> 2], [genislik >> 1, yukseklik >> 2],
    ];
    let ilk = null;
    for (const [x, y] of noktalar) {
      const p = c.getImageData(Math.max(0, x - 4), Math.max(0, y - 4), 8, 8).data;
      for (let i = 0; i < p.length; i += 4) {
        if (p[i + 3] === 0) continue;                  // saydam
        if (ilk === null) ilk = p[i];
        else if (Math.abs(p[i] - ilk) > 6) return false;   // renk değişimi var → dolu
      }
    }
    return true;
  }

  /**
   * Fotoğrafı OCR'a hazırlar: hedef genişliğe ölçekle, gri yap, kontrastı ger.
   * @returns {Promise<HTMLCanvasElement>}
   */
  function onisle(kaynak, kucultmeKatsayisi) {
    return new Promise((coz, hata) => {
      const g = new Image();
      g.onload = () => {
        let olcek = HEDEF_GENISLIK / g.naturalWidth;
        /* Piksel tavanı — iOS bellek sınırı için. */
        const tavanOlcek = Math.sqrt(AZAMI_PIKSEL / (g.naturalWidth * g.naturalHeight));
        if (tavanOlcek < olcek) olcek = tavanOlcek;
        if (kucultmeKatsayisi) olcek *= kucultmeKatsayisi;

        const t = document.createElement('canvas');
        t.width = Math.max(1, Math.round(g.naturalWidth * olcek));
        t.height = Math.max(1, Math.round(g.naturalHeight * olcek));
        const c = t.getContext('2d', { willReadFrequently: true });
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'high';
        /* Beyaz zemin: saydam PNG/HEIC'te metin görünmez kalmasın. */
        c.fillStyle = '#fff';
        c.fillRect(0, 0, t.width, t.height);
        c.drawImage(g, 0, 0, t.width, t.height);

        /* BOŞ TUVAL İKİ FARKLI ŞEY OLABİLİR — karıştırmamak önemli:
           (a) iOS belleği yetmedi ve sessizce boş tuval verdi → küçültüp
               yeniden denemek işe yarar,
           (b) fotoğrafın kendisi gerçekten boş/düz (beyaz kâğıt, kapak) →
               küçültmenin faydası yok, kullanıcıya farklı şey söylenmeli.
           Ayırt edici ölçüt kaynak görüntünün büyüklüğü: iOS'un bellek sınırı
           ancak birkaç megapiksellik fotoğraflarda devreye giriyor. Küçük bir
           görüntü boş çıktıysa gerçekten boştur. */
        if (tuvalBosMu(c, t.width, t.height)) {
          URL.revokeObjectURL(g.src);
          const buyukMu = g.naturalWidth * g.naturalHeight > 2.5e6;
          hata(Object.assign(new Error(buyukMu ? 'TUVAL_BOS' : 'GORUNTU_BOS'), { olcek }));
          return;
        }

        /* Gri tonlama + histogram germe.
           DİKKAT — ham min/max ile germek İŞE YARAMAZ. Ölçüldü: fotoğrafta
           tek bir tam siyah ve tek bir tam beyaz piksel bulunması yetiyor,
           aralık 0-255 çıkıyor ve germe hiçbir şey yapmıyor. Gölgeli bir
           faturada bu, "No:96"nın "No:36" okunması demek.
           Bu yüzden uçlar YÜZDELİK olarak alınıyor: en koyu %2 ve en açık %2
           kırpılıp arası 0-255'e yayılıyor. Jimp'in `normalize()`ının
           yaptığı da budur. */
        const veri = c.getImageData(0, 0, t.width, t.height);
        const p = veri.data;
        const histogram = new Uint32Array(256);
        for (let i = 0; i < p.length; i += 4) {
          const gri = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000 | 0;
          p[i] = p[i + 1] = p[i + 2] = gri;
          histogram[gri]++;
        }
        const toplam = p.length / 4;
        const kirp = Math.floor(toplam * 0.02);
        let alt = 0, ust = 255, birikim = 0;
        for (let v = 0; v < 256; v++) { birikim += histogram[v]; if (birikim > kirp) { alt = v; break; } }
        birikim = 0;
        for (let v = 255; v >= 0; v--) { birikim += histogram[v]; if (birikim > kirp) { ust = v; break; } }

        const aralik = ust - alt;
        if (aralik > 8) {
          const k = 255 / aralik;
          for (let i = 0; i < p.length; i += 4) {
            const v = (p[i] - alt) * k;
            p[i] = p[i + 1] = p[i + 2] = v < 0 ? 0 : v > 255 ? 255 : v;
          }
        }
        c.putImageData(veri, 0, 0);
        URL.revokeObjectURL(g.src);
        coz(t);
      };
      g.onerror = () => {
        URL.revokeObjectURL(g.src);
        /* iPhone fotoğrafları HEIC biçiminde. Galeriden seçilirken Safari
           genellikle JPEG'e çeviriyor ama her zaman değil; çevirmezse
           tarayıcı çözemeyip buraya düşüyor. Kullanıcıya ne yapacağını
           söylemek gerek, "açılamadı" demek yetmiyor. */
        hata(new Error('BICIM_DESTEKLENMIYOR'));
      };
      g.src = kaynak instanceof Blob ? URL.createObjectURL(kaynak) : kaynak;
    });
  }

  /**
   * Ön işlemeyi, iOS boş tuval verirse küçülterek yeniden dener.
   * Her denemede yarıya iniliyor: 12 MP bir fotoğraf sığmazsa 3 MP sığar.
   */
  async function onisleDayanikli(kaynak) {
    const katsayilar = [1, 0.7, 0.5, 0.35];
    let sonHata = null;
    for (const k of katsayilar) {
      try { return await onisle(kaynak, k === 1 ? null : k); }
      catch (e) {
        sonHata = e;
        if (e.message !== 'TUVAL_BOS') break;   // biçim hatasıysa küçültmek işe yaramaz
      }
    }
    throw sonHata || new Error('Fotoğraf hazırlanamadı');
  }

  /**
   * ANA GİRİŞ.
   * @param {File|Blob|string} dosya
   * @param {function(string,number)} [ilerleme]
   * @returns {Promise<{metin:string, guven:number, kelimeler:Array<{metin:string,guven:number}>}>}
   */
  async function oku(dosya, ilerleme) {
    /* Android APK'da yerel köprü varsa onu kullan — 20 kat hızlı. */
    if (global.OcrYerel && typeof global.OcrYerel.oku === 'function') {
      return global.OcrYerel.oku(dosya);
    }

    /* Görüntü ÖNCE hazırlanıyor, motor SONRA kuruluyor.
       Sırası önemli: motor kurulunca ~60 MB WebAssembly belleği tutuluyor ve
       iOS'ta o bellek üstüne büyük bir tuval açmak sınırı zorluyor. Görüntü
       küçültülüp hazır olduğunda kaynak fotoğraf serbest kalıyor. */
    let tuval;
    try {
      tuval = await onisleDayanikli(dosya);
    } catch (e) {
      if (e.message === 'BICIM_DESTEKLENMIYOR') {
        throw new Error('Bu fotoğraf biçimi açılamadı. iPhone kullanıyorsan Ayarlar > Kamera > Biçimler > "En Uyumlu" seçeneğini dene.');
      }
      if (e.message === 'TUVAL_BOS') {
        throw new Error('Fotoğraf telefonun belleğine sığmadı. Kamera çözünürlüğünü düşür ya da faturanın yalnız adres kısmını çek.');
      }
      throw e;
    }

    const isci = await isciHazirla(ilerleme);
    const { data } = await isci.recognize(tuval, {}, { text: true, blocks: true });
    /* Tuvali hemen boşalt — iOS'ta arka arkaya 50 fatura okutulacak. */
    tuval.width = tuval.height = 1;

    /* Kelime güvenleri bloklar içine gömülü geliyor. */
    const kelimeler = [];
    for (const b of (data.blocks || [])) {
      for (const p of (b.paragraphs || [])) {
        for (const l of (p.lines || [])) {
          for (const k of (l.words || [])) kelimeler.push({ metin: k.text, guven: k.confidence });
        }
      }
    }
    return { metin: data.text || '', guven: data.confidence || 0, kelimeler };
  }

  /** Uygulama kapanırken/temizlerken. */
  async function kapat() {
    if (_isci) { try { await _isci.terminate(); } catch (_) {} }
    _isci = null; _hazirlaniyor = null;
  }

  /** OCR dosyaları indirilmiş mi? (ilk kullanımda ~11 MB iner, sonra önbellekte) */
  const hazirMi = () => !!_isci;

  global.Ocr = { oku, kapat, hazirMi, HEDEF_GENISLIK };
})(window);
