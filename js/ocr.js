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
   * Fotoğrafı OCR'a hazırlar: hedef genişliğe ölçekle, gri yap, kontrastı ger.
   * @returns {Promise<HTMLCanvasElement>}
   */
  function onisle(kaynak) {
    return new Promise((coz, hata) => {
      const g = new Image();
      g.onload = () => {
        const olcek = HEDEF_GENISLIK / g.naturalWidth;
        const t = document.createElement('canvas');
        t.width = Math.round(g.naturalWidth * olcek);
        t.height = Math.round(g.naturalHeight * olcek);
        const c = t.getContext('2d', { willReadFrequently: true });
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'high';
        c.drawImage(g, 0, 0, t.width, t.height);

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
      g.onerror = () => hata(new Error('Fotoğraf açılamadı'));
      g.src = kaynak instanceof Blob ? URL.createObjectURL(kaynak) : kaynak;
    });
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

    const isci = await isciHazirla(ilerleme);
    const tuval = await onisle(dosya);
    const { data } = await isci.recognize(tuval, {}, { text: true, blocks: true });

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
