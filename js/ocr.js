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
 * ÜÇ KADEMELİ OKUMA — NEDEN
 * -------------------------
 * Tek geçişli okuma, TAM SAYFA çekilen e-İrsaliyelerde çuvallıyordu ve
 * nedeni "OCR kötü" değil, ÇÖZÜNÜRLÜK:
 *
 *   A4 sayfa 2480 piksel genişliğe getirilince müşteri adresinin 7 puntoluk
 *   satırı ~14 piksel yüksekliğinde kalıyor. Tesseract ~30 piksel istiyor.
 *   Kullanıcı aynı belgenin yalnız etiketini kırpıp çekince okuma tutuyordu;
 *   çünkü o zaman aynı satır 60 piksel oluyor.
 *
 * Ayrıca ölçüldü: fotoğrafların bir bölümü TERS (180°) çekiliyor — kâğıt imza
 * için çevriliyor ve öyle fotoğraflanıyor. Tesseract ters metni hiç okumuyor.
 * Örnek fotoğraf 19'da 0° tamamen çöp, 180°'de belge okunuyor.
 *
 * Bu yüzden okuma kademeli:
 *
 *   1. TAM SAYFA        — her zaman. Çoğu etiket/sticker burada çözülüyor,
 *                         ek maliyet yok.
 *   2. BÖLGE YAKINLAŞTIRMA — 1. geçişte bulunan "SAYIN / Alıcı Adres /
 *                         Semt-Mahalle" etiketlerinin çevresi kırpılıp 2-5 kat
 *                         büyütülerek YENİDEN okunuyor. İnsanın "yaklaşıp
 *                         bakma" davranışı. (bkz. lib/bolge.js)
 *   3. YÖN DÜZELTME     — hâlâ olmadıysa 180°, sonra 90/270 deneniyor;
 *                         bulunan yönde 2. kademe tekrar çalışıyor.
 *
 * Kademeler ancak GEREKİRSE çalışıyor: sonuç yeşile ulaşınca duruluyor.
 * Yani iyi çekilmiş bir etiket fotoğrafı bugünküyle aynı hızda okunuyor.
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

  /* Kırpılmış bir bölge en fazla bu kadar büyütülüyor. Daha fazlası
     bulanıklıktan başka bir şey üretmiyor: olmayan piksel icat edilemiyor,
     Tesseract da devasa görüntüde yavaşlıyor. */
  const AZAMI_BUYUTME = 4;

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

  /* ═════════════════════════════════════════ GÖRÜNTÜ HAZIRLAMA ═══ */

  /**
   * Fotoğrafı BİR KEZ çözer ve açık tutar.
   *
   * Kademeli okuma aynı fotoğrafı birkaç kez farklı kırpma/açıyla çiziyor.
   * Her seferinde yeniden çözmek hem yavaş hem bellek israfı. Çözülmüş
   * görüntüden kırpma çizmek tuval gerektirmiyor: drawImage kaynak
   * dikdörtgeni doğrudan alıyor, yani devasa ara tuval hiç açılmıyor.
   * Bu, iOS bellek baskısını bugünkünden DAHA AZ yapıyor.
   */
  function goruntuAc(kaynak) {
    return new Promise((coz, hata) => {
      const g = new Image();
      const url = kaynak instanceof Blob ? URL.createObjectURL(kaynak) : null;
      g.onload = () => coz({
        img: g,
        genislik: g.naturalWidth,
        yukseklik: g.naturalHeight,
        kapat() { if (url) URL.revokeObjectURL(url); },
      });
      g.onerror = () => {
        if (url) URL.revokeObjectURL(url);
        /* iPhone fotoğrafları HEIC biçiminde. Galeriden seçilirken Safari
           genellikle JPEG'e çeviriyor ama her zaman değil; çevirmezse
           tarayıcı çözemeyip buraya düşüyor. */
        hata(new Error('BICIM_DESTEKLENMIYOR'));
      };
      g.src = url || kaynak;
    });
  }

  /**
   * Döndürülmüş çerçevedeki dikdörtgeni kaynak fotoğrafın çerçevesine çevirir.
   *
   * 1. geçişin satır kutuları "düzeltilmiş" çerçevede (yani fotoğraf `derece`
   * kadar döndürülmüş hâlinde) veriliyor; 2. geçiş de kırpmayı orada
   * tarifliyor. Çizim ise ham fotoğraftan yapılıyor. Aradaki dönüşüm bu.
   */
  function kirpKaynaga(kirp, derece, G, Y) {
    const d = ((derece % 360) + 360) % 360;
    if (d === 90)  return { x0: kirp.y0,         y0: Y - kirp.x1,     x1: kirp.y1,         y1: Y - kirp.x0 };
    if (d === 180) return { x0: G - kirp.x1,     y0: Y - kirp.y1,     x1: G - kirp.x0,     y1: Y - kirp.y0 };
    if (d === 270) return { x0: G - kirp.y1,     y0: kirp.x0,         x1: G - kirp.y0,     y1: kirp.x1 };
    return { x0: kirp.x0, y0: kirp.y0, x1: kirp.x1, y1: kirp.y1 };
  }

  /** Döndürülmüş çerçevenin ölçüleri. */
  function cerceveBoyutu(derece, G, Y) {
    const d = ((derece % 360) + 360) % 360;
    return (d === 90 || d === 270) ? { G: Y, Y: G } : { G, Y };
  }

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
   * Kaynağın istenen parçasını, istenen açıyla, OCR'a hazır biçimde çizer.
   *
   * @param {object} g       goruntuAc() sonucu
   * @param {object} [ayar]
   * @param {number} [ayar.derece]     0/90/180/270 — kaba yön düzeltmesi
   * @param {number} [ayar.egiklik]    küçük açı (derece) — eğik yapıştırılmış
   *                                   etiketleri düzeltmek için
   * @param {object} [ayar.kirp]       DÖNDÜRÜLMÜŞ çerçevede {x0,y0,x1,y1}
   * @param {number} [ayar.kucultme]   iOS boş tuval verirse küçültme katsayısı
   * @returns {{tuval:HTMLCanvasElement, olcek:number, kirp:object}}
   */
  function ciz(g, ayar) {
    const a = ayar || {};
    const derece = a.derece || 0;
    const egiklik = a.egiklik || 0;
    const cerceve = cerceveBoyutu(derece, g.genislik, g.yukseklik);

    const kirpC = a.kirp || { x0: 0, y0: 0, x1: cerceve.G, y1: cerceve.Y };
    const kaynakKirp = kirpKaynaga(kirpC, derece, g.genislik, g.yukseklik);
    const kg = Math.max(1, kaynakKirp.x1 - kaynakKirp.x0);
    const ky = Math.max(1, kaynakKirp.y1 - kaynakKirp.y0);

    /* Kırpma döndürüldükten sonraki ölçüleri (90/270'te kenarlar yer değişir) */
    const d = ((derece % 360) + 360) % 360;
    const eg = (d === 90 || d === 270) ? ky : kg;
    const ey = (d === 90 || d === 270) ? kg : ky;

    let olcek = (a.hedefGenislik || HEDEF_GENISLIK) / eg;
    if (olcek > AZAMI_BUYUTME) olcek = AZAMI_BUYUTME;      // yok yere şişirme
    const tavan = Math.sqrt(AZAMI_PIKSEL / (eg * ey));
    if (tavan < olcek) olcek = tavan;                      // iOS bellek tavanı
    if (a.kucultme) olcek *= a.kucultme;

    const hg = Math.max(1, Math.round(eg * olcek));
    const hy = Math.max(1, Math.round(ey * olcek));

    /* Eğiklik düzeltilirken köşeler taşmasın diye tuval biraz büyütülüyor. */
    const r = (egiklik * Math.PI) / 180;
    const tg = egiklik ? Math.ceil(Math.abs(hg * Math.cos(r)) + Math.abs(hy * Math.sin(r))) : hg;
    const ty = egiklik ? Math.ceil(Math.abs(hg * Math.sin(r)) + Math.abs(hy * Math.cos(r))) : hy;

    const t = document.createElement('canvas');
    t.width = tg; t.height = ty;
    const c = t.getContext('2d', { willReadFrequently: true });
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    /* Beyaz zemin: saydam PNG/HEIC'te ve döndürme sonrası boş köşelerde
       metin siyah zeminde kaybolmasın. */
    c.fillStyle = '#fff';
    c.fillRect(0, 0, tg, ty);

    c.save();
    c.translate(tg / 2, ty / 2);
    if (egiklik) c.rotate(r);
    if (d) c.rotate((d * Math.PI) / 180);
    /* Döndürme uygulandıktan sonra hedef, KIRPMANIN kendi ölçüleriyle
       çiziliyor; 90/270'te bu kg×ky olarak kalıyor çünkü tuval zaten
       döndürülmüş durumda. */
    const cg = (d === 90 || d === 270) ? hy : hg;
    const cy = (d === 90 || d === 270) ? hg : hy;
    c.drawImage(g.img, kaynakKirp.x0, kaynakKirp.y0, kg, ky, -cg / 2, -cy / 2, cg, cy);
    c.restore();

    if (tuvalBosMu(c, tg, ty)) {
      const buyukMu = g.genislik * g.yukseklik > 2.5e6;
      /* BOŞ TUVAL İKİ FARKLI ŞEY OLABİLİR — karıştırmamak önemli:
         (a) iOS belleği yetmedi ve sessizce boş tuval verdi → küçültüp
             yeniden denemek işe yarar,
         (b) fotoğrafın kendisi gerçekten boş/düz (beyaz kâğıt, kapak) →
             küçültmenin faydası yok, kullanıcıya farklı şey söylenmeli. */
      throw Object.assign(new Error(buyukMu ? 'TUVAL_BOS' : 'GORUNTU_BOS'), { olcek });
    }

    griVeGer(c, tg, ty);
    return { tuval: t, olcek, kirp: kirpC };
  }

  /**
   * Gri tonlama + histogram germe.
   *
   * DİKKAT — ham min/max ile germek İŞE YARAMAZ. Ölçüldü: fotoğrafta tek bir
   * tam siyah ve tek bir tam beyaz piksel bulunması yetiyor, aralık 0-255
   * çıkıyor ve germe hiçbir şey yapmıyor. Gölgeli bir faturada bu, "No:96"nın
   * "No:36" okunması demek.
   * Bu yüzden uçlar YÜZDELİK olarak alınıyor: en koyu %2 ve en açık %2
   * kırpılıp arası 0-255'e yayılıyor.
   */
  function griVeGer(c, genislik, yukseklik) {
    const veri = c.getImageData(0, 0, genislik, yukseklik);
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
  }

  /** Tuvalden tek kanallı gri dizi — eğiklik ölçümü için. */
  function griDizi(tuval) {
    const c = tuval.getContext('2d', { willReadFrequently: true });
    const p = c.getImageData(0, 0, tuval.width, tuval.height).data;
    const gri = new Uint8Array(tuval.width * tuval.height);
    for (let i = 0, j = 0; i < p.length; i += 4, j++) gri[j] = p[i];
    return gri;
  }

  /** iOS boş tuval verirse küçülterek yeniden dener. */
  function cizDayanikli(g, ayar) {
    const katsayilar = [1, 0.7, 0.5, 0.35];
    let sonHata = null;
    for (const k of katsayilar) {
      try { return ciz(g, k === 1 ? ayar : Object.assign({}, ayar, { kucultme: k })); }
      catch (e) {
        sonHata = e;
        if (e.message !== 'TUVAL_BOS') break;   // gerçekten boş görüntüyse küçültmek işe yaramaz
      }
    }
    throw sonHata || new Error('Fotoğraf hazırlanamadı');
  }

  /* ══════════════════════════════════════════════ TEK GEÇİŞ ═══ */

  /** Tesseract sonucunu uygulamanın beklediği düz biçime çevirir. */
  function tesseractCevir(data, olcek, kirp) {
    const kelimeler = [];
    const satirlar = [];
    for (const b of (data.blocks || [])) {
      for (const p of (b.paragraphs || [])) {
        for (const l of (p.lines || [])) {
          const kb = l.bbox || {};
          satirlar.push({
            metin: l.text || '',
            /* Kutular tuval pikselinden ÇERÇEVE pikseline geri çevriliyor;
               ikinci geçişin kırpması orada tarif ediliyor. */
            x0: (kirp.x0 || 0) + (kb.x0 || 0) / olcek,
            y0: (kirp.y0 || 0) + (kb.y0 || 0) / olcek,
            x1: (kirp.x0 || 0) + (kb.x1 || 0) / olcek,
            y1: (kirp.y0 || 0) + (kb.y1 || 0) / olcek,
          });
          for (const k of (l.words || [])) {
            const wb = k.bbox || {};
            /* Kutular sözcüklere de konuyor: "Teslimat adresi" ile
               "Fatura adresi" sütunlarını ancak konum ayırıyor
               (bkz. lib/bolge.js → bolumMetni). */
            kelimeler.push({
              metin: k.text, guven: k.confidence,
              x0: (kirp.x0 || 0) + (wb.x0 || 0) / olcek,
              y0: (kirp.y0 || 0) + (wb.y0 || 0) / olcek,
              x1: (kirp.x0 || 0) + (wb.x1 || 0) / olcek,
              y1: (kirp.y0 || 0) + (wb.y1 || 0) / olcek,
            });
          }
        }
      }
    }
    return { metin: data.text || '', guven: data.confidence || 0, kelimeler, satirlar };
  }

  /** Yerel motor bir kez patlarsa bir daha denenmiyor. */
  let _yerelBozuk = false;
  let _yerelHata = '';

  /** Bir tuvali okur. Motor farkını burası saklıyor. */
  async function tuvaliOku(tuval, olcek, kirp, ilerleme) {
    if (!_yerelBozuk && global.OcrYerel && typeof global.OcrYerel.tuvaliOku === 'function') {
      try {
        return await global.OcrYerel.tuvaliOku(tuval, olcek, kirp);
      } catch (e) {
        /* GERİ DÜŞÜŞ ŞART. Android'de ML Kit'in çağrısı yanlış yazılmıştı ve
           OCR hiç çalışmıyordu; geri düşüş olmadığı için de kullanıcı yalnız
           "okunamadı" görüyordu. Yerel motor bir kez bile hata verirse
           Tesseract devralıyor — yavaş ama çalışıyor. */
        _yerelBozuk = true;
        _yerelHata = (e && e.message) || 'bilinmeyen hata';
        if (global.console) console.warn('Yerel OCR devre dışı:', _yerelHata);
      }
    }
    /* APK'da Tesseract paketlenmiyor (ML Kit varken 24 MB taşımanın anlamı
       yok). O yüzden yerel motor patlarsa geri düşecek bir şey de yok;
       kullanıcıya ne olduğunu ve ne yapacağını söylemek gerekiyor. */
    if (_yerelBozuk && !global.Tesseract) {
      throw new Error('Telefonun metin okuyucusu çalışmadı (' + _yerelHata +
        '). Google Play Hizmetleri güncel mi bak; olmazsa tarayıcı sürümünü kullan.');
    }
    const isci = await isciHazirla(ilerleme);
    const { data } = await isci.recognize(tuval, {}, { text: true, blocks: true });
    return tesseractCevir(data, olcek, kirp);
  }

  /* ══════════════════════════════════════════ KADEMELİ OKUMA ═══ */

  /**
   * YAKINLAŞTIRMA BU FOTOĞRAFTA İŞE YARAR MI?
   *
   * ⚠️ BU KAPI ÖLÇÜMLE KONULDU, TASARIM TERCİHİ DEĞİL.
   *
   * Yakınlaştırmanın tek işe yarama yolu, TAM SAYFA GEÇİŞİNDE ATILAN GERÇEK
   * PİKSELLERİ geri kazanmak. Tam sayfa geçişi görüntüyü küçültmek zorunda
   * kaldıysa (12 MP telefon fotoğrafı, iOS tuval tavanına sığsın diye ~0,6
   * katına iniyor) o bilgi orada duruyor ve kırpma onu geri getiriyor.
   *
   * Ama tam sayfa geçişi zaten BÜYÜTEREK okuduysa — WhatsApp'tan gelen
   * 900×1600 bir fotoğrafta 1,7 kat büyütülüyor — kırpıp daha da büyütmek
   * yeni bilgi getirmiyor, yalnız bulanıklık üretiyor. 45 fotoğrafla
   * ölçüldü: kazanç sıfır, süre 2,4 kat.
   *
   * Bu yüzden kural: tam sayfa geçişi KÜÇÜLTMEK ZORUNDA KALDIYSA yakınlaş.
   */
  function yakinlasmaYararliMi(genislik, yukseklik) {
    let olcek = HEDEF_GENISLIK / genislik;
    if (olcek > AZAMI_BUYUTME) olcek = AZAMI_BUYUTME;
    const tavan = Math.sqrt(AZAMI_PIKSEL / (genislik * yukseklik));
    if (tavan < olcek) olcek = tavan;
    return olcek < 0.95;
  }

  /** Okumanın "işe yarar metin" miktarı — yön seçerken kullanılıyor. */
  function metinPuani(okuma) {
    if (!okuma || !okuma.metin) return 0;
    /* Yalnız harf sayısı yetmiyor: ters metin de bol harf üretiyor, ama
       hepsi düşük güvenli ve kısa parçalar hâlinde. Güveni yüksek, en az
       üç harfli sözcükler sayılıyor. */
    const k = okuma.kelimeler || [];
    if (!k.length) return okuma.metin.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').length / 20;
    let sayi = 0;
    for (const w of k) {
      if (w.guven >= 70 && /[A-Za-zÇĞİÖŞÜçğıöşü]{3,}/.test(w.metin || '')) sayi++;
    }
    return sayi;
  }

  /** İki okumayı birleştirir — yakınlaştırılmış bölge sayfaya EKLENİYOR. */
  function birlestirOkuma(a, b) {
    if (!a) return b;
    if (!b) return a;
    return {
      metin: (a.metin || '') + '\n' + (b.metin || ''),
      guven: Math.max(a.guven || 0, b.guven || 0),
      kelimeler: (a.kelimeler || []).concat(b.kelimeler || []),
      satirlar: (a.satirlar || []).concat(b.satirlar || []),
    };
  }

  /**
   * ANA GİRİŞ — kademeli okuma.
   *
   * @param {File|Blob|string} dosya
   * @param {object} [ayar]
   * @param {function(object):number} [ayar.degerlendir]
   *        Okumayı çözüp 0-100 arası bir güven döndüren işlev. Verilirse
   *        kademeler ancak gerektiği kadar çalışıyor; verilmezse yalnız
   *        metin miktarına bakılıyor.
   * @param {number} [ayar.yeter=70] bu güvene ulaşınca kademeler duruyor
   * @param {object} [ayar.kirp] kullanıcı elle bölge seçtiyse
   * @param {function(string,number)} [ayar.ilerleme]
   * @returns {Promise<{metin,guven,kelimeler,satirlar,kademe:string[]}>}
   */
  async function oku(dosya, ayar) {
    /* Eski çağrı biçimi: oku(dosya, ilerlemeİşlevi) */
    if (typeof ayar === 'function') ayar = { ilerleme: ayar };
    const a = ayar || {};
    const ilerleme = a.ilerleme;
    const yeter = a.yeter == null ? 70 : a.yeter;
    const degerlendir = typeof a.degerlendir === 'function' ? a.degerlendir : null;

    /* Android'de yerel motor tüm dosyayı kendisi alıyorsa (eski köprü)
       kademeli akış devre dışı; yine de doğru sonuç dönüyor. */
    if (global.OcrYerel && typeof global.OcrYerel.oku === 'function' &&
        typeof global.OcrYerel.tuvaliOku !== 'function') {
      const r = await global.OcrYerel.oku(dosya);
      return Object.assign({ satirlar: [], kademe: ['yerel'] }, r);
    }

    let g;
    try {
      g = await goruntuAc(dosya);
    } catch (e) {
      if (e.message === 'BICIM_DESTEKLENMIYOR') {
        throw new Error('Bu fotoğraf biçimi açılamadı. iPhone kullanıyorsan Ayarlar > Kamera > Biçimler > "En Uyumlu" seçeneğini dene.');
      }
      throw e;
    }

    const kademe = [];
    let enIyi = null, enIyiPuan = -1;

    /** Bir kademeyi çalıştırıp en iyiyi günceller; ulaşılan güveni döndürür. */
    async function dene(ad, cizAyar, oncekiyleBirlestir) {
      let hazir;
      try { hazir = cizDayanikli(g, cizAyar); }
      catch (e) {
        if (e.message === 'TUVAL_BOS' && !enIyi) throw e;
        return -1;               // ara kademe çizilemedi; elde olanla devam
      }
      let okuma;
      try { okuma = await tuvaliOku(hazir.tuval, hazir.olcek, hazir.kirp, ilerleme); }
      finally { hazir.tuval.width = hazir.tuval.height = 1; }   // iOS: hemen bırak

      const aday = oncekiyleBirlestir ? birlestirOkuma(oncekiyleBirlestir, okuma) : okuma;
      /* Değerlendirici söz döndürebiliyor: uygulama, çözmeden önce o ilçenin
         adres verisini indirmek isteyebiliyor. */
      const puan = degerlendir ? await degerlendir(aday) : metinPuani(aday);
      kademe.push(ad + '=' + Math.round(puan));
      if (puan > enIyiPuan) { enIyiPuan = puan; enIyi = aday; }
      /* Yön arayışında ham okuma da saklanıyor: bölge kademesi buna bakacak. */
      dene.son = okuma;
      return puan;
    }

    try {
      /* ── Kullanıcı elle bölge seçtiyse: tek geçiş, o bölge ── */
      if (a.kirp) {
        await dene('elle', { kirp: a.kirp, egiklik: a.egiklik || 0 });
        return Object.assign({ kademe }, enIyi);
      }

      /* ── 1. kademe: tam sayfa ── */
      let puan = await dene('sayfa', {});
      const sayfaOkuma = dene.son;

      /* ── 2. kademe: adres bölgesine yakınlaş ──
         Yalnız KAZANÇ VARSA. Gerekçesi ölçüldü, bkz. yakinlasmaYararliMi. */
      if (puan < yeter && yakinlasmaYararliMi(g.genislik, g.yukseklik)) {
        puan = await bolgeleriDene(0, sayfaOkuma, puan);
      } else if (puan < yeter) {
        kademe.push('bolge=atlandi(cozunurluk)');
      }

      /* ── 3. kademe: ters çekilmiş mi? ──
         Ölçüldü: gerçek fotoğrafların bir bölümü 180° ters. Kâğıt imza için
         çevriliyor ve öyle fotoğraflanıyor; Tesseract ters metni hiç okumuyor
         (örnek fotoğrafta 0°'de 0 anlamlı sözcük, 180°'de 12).
         90/270 kendiliğinden DENENMİYOR: nadir, üç ek geçiş demek ve zaten
         "Adresi göster" penceresindeki ⟳ düğmesiyle tek dokunuşta çözülüyor.
         Önce KÜÇÜK ölçekte yoklanıyor — ucuz. */
      const duz = metinPuani(sayfaOkuma);
      /* Yoklama yalnız sayfa NEREDEYSE HİÇ okunamadığında yapılıyor: ters
         çekilmiş bir belgenin imzası budur (ölçüldü: ters fotoğrafta 0
         anlamlı sözcük). Yarım yamalak okunan bir belge ters değildir,
         boşuna geçiş yapılmasın. */
      if (puan < yeter && duz < 12) {
        const yoklama = await yokla(180);
        if (yoklama > Math.max(3, duz * 1.4)) {
          const p = await dene('yon180', { derece: 180 });
          if (p < yeter && yakinlasmaYararliMi(g.genislik, g.yukseklik)) {
            await bolgeleriDene(180, dene.son, p);
          }
        } else {
          kademe.push('ters=hayir');
        }
      }

      return Object.assign({ kademe }, enIyi);
    } finally {
      g.kapat();
    }

    /**
     * Bu fotoğrafta bir yönü UCUZCA yoklar — küçük ölçekte okur, anlamlı
     * sözcük sayısını döndürür. Amaç karar vermek, metni kullanmak değil.
     */
    async function yokla(derece) {
      let hazir;
      try { hazir = ciz(g, { derece, hedefGenislik: 1200 }); }
      catch (_) { return 0; }
      try {
        const okuma = await tuvaliOku(hazir.tuval, hazir.olcek, hazir.kirp, null);
        return metinPuani(okuma);
      } catch (_) { return 0; }
      finally { hazir.tuval.width = hazir.tuval.height = 1; }
    }

    /** Verilen yöndeki okumadan adres bölgelerini çıkarıp yakınlaştırır. */
    async function bolgeleriDene(derece, temelOkuma, mevcutPuan) {
      const B = global.Motor && global.Motor.bolge;
      if (!B || !temelOkuma || !temelOkuma.satirlar || !temelOkuma.satirlar.length) return mevcutPuan;
      const c = cerceveBoyutu(derece, g.genislik, g.yukseklik);
      const bolgeler = B.adresBolgeleri(temelOkuma.satirlar, c.G, c.Y, temelOkuma.kelimeler).slice(0, 2);
      let puan = mevcutPuan;
      for (let i = 0; i < bolgeler.length; i++) {
        const b = bolgeler[i];
        /* Eğik yapıştırılmış etiketler: bölge küçük olduğu için açı ölçümü
           ucuz. Önce açısız çiz, açıyı ölç, gerekiyorsa düzeltip yeniden çiz. */
        let egiklik = 0;
        try {
          const on = ciz(g, { derece, kirp: b, kucultme: 0.4 });
          egiklik = B.egiklikAcisi(griDizi(on.tuval), on.tuval.width, on.tuval.height);
          on.tuval.width = on.tuval.height = 1;
        } catch (_) { /* ölçüm başarısızsa açısız devam */ }

        const p = await dene('bolge' + (derece || '') + (egiklik ? '@' + egiklik : ''),
          { derece, kirp: b, egiklik }, temelOkuma);
        if (p > puan) puan = p;
        if (puan >= yeter) break;
      }
      return puan;
    }
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
