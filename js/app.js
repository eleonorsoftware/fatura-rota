/* FATURA ROTA — ARAYÜZ MANTIĞI
 * ============================
 *
 * Motor (`js/motor.js`) `lib/` altındaki test edilmiş modüllerden derleniyor;
 * bu dosya yalnız ekranı ve akışı yönetiyor. Adres çözme, güven skoru ve rota
 * sıralaması burada YENİDEN YAZILMIYOR.
 */
(function () {
  'use strict';

  const global = window;
  const M = window.Motor;
  const D = window.Depo;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const kacis = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (k) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[k]));

  /* Merkezde çalışılan iki ilçe açılışta yükleniyor (1,6 MB); diğerleri
     ancak o ilçeye teslimat okutulunca iniyor. */
  const ACILISTA = ['merkezefendi', 'pamukkale'];

  /* iOS mu? Aşağıda iki yerde davranış değiştiriyor: kamera açma biçimi ve
     ana ekrana ekleme ipucu. iPad'ler masaüstü kimliğiyle geldiği için
     dokunma noktası sayısına da bakılıyor. */
  const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const ANA_EKRANDA = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;

  const durum = {
    kaynak: null,
    gun: null,
    konum: null,
    sayfa: 'bugun',
    duzeltilenId: null,
  };

  /* ═══════════════════════════════════════════════════════ açılış ═══ */

  async function basla() {
    const cubuk = $('#yuklemeCubuk');
    const metin = $('#yuklemeMetin');
    let adim = 0;
    const toplamAdim = 2 + ACILISTA.length;
    const ilerle = (yazi) => {
      adim++;
      cubuk.style.width = Math.round((adim / toplamAdim) * 100) + '%';
      if (yazi) metin.textContent = yazi;
    };

    durum.kaynak = M.kaynakPaket.olustur({ oku: M.kaynakPaket.agdanOkuyucu('veri') });
    metin.textContent = 'Mahalle listesi indiriliyor…';
    await durum.kaynak.hazirla();
    ilerle('İlçe verileri indiriliyor…');

    for (const ad of ACILISTA) {
      const i = durum.kaynak.ilceBul(ad);
      if (i) { await durum.kaynak.ilceYukle(i.oid); ilerle(`${i.ad} hazır`); }
    }

    durum.gun = await D.gunAc();
    ilerle('Hazır');

    ilceSecenekleriDoldur();
    kameraAyari();
    kurulumIpucu();
    olaylariBagla();
    ciz();
    $('#yukleme').classList.add('bitti');
    konumIste();
  }

  /**
   * iOS'ta `capture="environment"` ÖN KAMERAYI açıyor.
   *
   * Android'de bu öznitelik arka kamerayı doğrudan açıyor ve iyi çalışıyor.
   * iOS Safari ise değeri güvenilir biçimde uygulamıyor: bazı sürümlerde
   * yok sayıp son kullanılan kamerayı, çoğu zaman ön kamerayı açıyor —
   * fatura çekmek için işe yaramaz.
   *
   * Çözüm: iOS'ta özniteliği tamamen kaldırmak. O zaman iOS kendi seçim
   * penceresini açıyor ("Fotoğraf Çek / Fotoğraf Seç") ve "Fotoğraf Çek"
   * denince NORMAL kamera uygulaması geliyor — arka kamera varsayılan,
   * üstelik istenirse çevirme düğmesi de var.
   */
  function kameraAyari() {
    if (!IOS) return;
    const g = $('#girdiKamera');
    if (g) g.removeAttribute('capture');
    const d = $('#btnKamera');
    if (d) d.textContent = '📷 Fotoğraf Çek / Seç';
  }

  /**
   * iOS'ta "Ana Ekrana Ekle" nerede olduğunu gösterir.
   *
   * Safari'de bu seçenek Paylaş menüsünün ALTLARINDA ve aşağı kaydırmadan
   * görünmüyor; ayrıca Chrome/başka bir tarayıcıda hiç yok. Kullanıcı
   * bulamayınca uygulamayı kuramıyor.
   */
  function kurulumIpucu() {
    if (!IOS || ANA_EKRANDA) return;
    try { if (localStorage.getItem('kurulumIpucuKapandi')) return; } catch (_) {}

    /* Chrome/Firefox/Edge iOS'ta "Ana Ekrana Ekle" YOKTUR — Apple bu özelliği
       yalnız Safari'ye veriyor. Kullanıcı Chrome'un üç nokta menüsünde arayıp
       bulamıyor (sahada tam olarak bu yaşandı). O yüzden önce hangi tarayıcıda
       olduğu tespit edilip ona göre yönlendiriliyor. */
    const safariMi = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
    const k = document.createElement('div');
    k.className = 'uyari';
    k.style.cssText = 'margin:0 0 10px;display:block;background:#dbeafe;color:#1e40af';
    k.innerHTML = safariMi
      ? '<b>📲 Ana ekrana ekle</b><br>Alttaki <b>Paylaş</b> düğmesine bas ' +
        '(kutudan yukarı çıkan ok) → listeyi <b>aşağı kaydır</b> → ' +
        '<b>Ana Ekrana Ekle</b>. Menünün altlarındadır, kaydırmadan görünmez.' +
        '<br><button class="dugme kucuk" data-ipucu-kapat="1" style="margin-top:8px">Anladım</button>'
      : '<b>⚠️ Şu an Chrome kullanıyorsun</b><br>iPhone\'da "Ana Ekrana Ekle" ' +
        '<b>yalnız Safari\'de</b> var — Chrome\'un menüsünde yoktur, arama.' +
        '<br>Adresi kopyala, <b>Safari</b>\'de aç, sonra Paylaş → Ana Ekrana Ekle.' +
        '<div class="dugme-sirasi" style="margin-top:8px">' +
        '<button class="dugme kucuk birincil" data-adres-kopyala="1">Adresi Kopyala</button>' +
        '<button class="dugme kucuk" data-ipucu-kapat="1">Kapat</button></div>';
    k.querySelector('[data-ipucu-kapat]').addEventListener('click', () => {
      try { localStorage.setItem('kurulumIpucuKapandi', '1'); } catch (_) {}
      k.remove();
    });
    const kopyala = k.querySelector('[data-adres-kopyala]');
    if (kopyala) kopyala.addEventListener('click', async () => {
      const adres = location.origin + location.pathname;
      try {
        await navigator.clipboard.writeText(adres);
        kopyala.textContent = '✓ Kopyalandı';
      } catch (_) {
        /* Panoya erişim engellenirse adresi seçilebilir biçimde göster. */
        const g = document.createElement('input');
        g.value = adres;
        g.style.cssText = 'width:100%;margin-top:8px;padding:10px;border:1px solid #93c5fd;border-radius:8px;font-size:14px';
        k.appendChild(g);
        g.select();
      }
    });
    const hedef = $('#sayfa-bugun');
    if (hedef) hedef.insertBefore(k, hedef.firstChild);
  }

  /** Metinde geçen ilçelerin verisini gerekirse indirir. */
  async function ilceleriHazirla(metinler) {
    const hepsi = durum.kaynak.ilceler();
    const birlesik = ' ' + M.metin.sade(metinler.filter(Boolean).join(' ')) + ' ';
    const gerekli = hepsi.filter((i) => birlesik.includes(' ' + i.adAra + ' '));
    for (const i of gerekli) {
      if (durum.kaynak.yukluIlceler().includes(i.oid)) continue;
      bilgiGoster(`${i.ad} adres verisi indiriliyor…`);
      await durum.kaynak.ilceYukle(i.oid);
    }
  }

  /* ═══════════════════════════════════════════════════════ tarama ═══ */

  /**
   * Ham metni çözüp güne ekler.
   * Metin nereden gelirse gelsin (kamera OCR'ı, galeri, elle yapıştırma)
   * aynı yoldan geçiyor — çekim biçimi motoru ilgilendirmiyor.
   */
  async function metniIsle(hamMetin, ekBilgi) {
    if (!hamMetin || !hamMetin.trim()) return null;

    /* Gün kapatıldıktan sonra elde bir fatura daha çıkarsa gün kendiliğinden
       geri açılıyor. Sürücü açıkça çalışmaya devam ediyor; onu "önce günü
       yeniden aç" diye bir adıma zorlamanın anlamı yok. */
    if (durum.gun && durum.gun.durum === 'kapali') {
      await D.gunuYenidenAc(durum.gun.tarih);
      durum.gun = await D.gunAc(durum.gun.tarih);
      bilgiGoster('Gün kapalıydı, yeni fatura için yeniden açıldı.');
    }

    await ilceleriHazirla([hamMetin]);

    const cozum = M.fatura.cozBelge(durum.kaynak, {
      serbest: hamMetin,
      ocrKelimeler: ekBilgi && ekBilgi.ocrKelimeler,
    });

    /* Belge numarası: tekilleştirmenin anahtarı. Etikette ve fatura
       gövdesinde aynı numara yazıyor; ikisi de aynı durağa bağlanıyor. */
    const belgeNo = belgeNoBul(hamMetin);
    const telefon = telefonBul(hamMetin);
    const ad = aliciBul(hamMetin);

    /* Aynı müşteri daha önce geldiyse ve bu sefer adres iyi çözülemediyse,
       hafızadaki adresi kullan. */
    let sonCozum = cozum;
    if (telefon && cozum.guven < 70) {
      const hatira = await D.hafizadanAra(telefon);
      if (hatira && hatira.lat != null) {
        sonCozum = {
          ...cozum,
          ilce: hatira.ilce, mahalle: hatira.mahalle, yol: hatira.yol,
          kapino: hatira.kapino, daire: hatira.daire || cozum.daire,
          lat: hatira.lat, lng: hatira.lng,
          keskinlik: 'kapi', guven: Math.max(cozum.guven, hatira.elleDuzeltildi ? 100 : 85),
          renk: 'yesil',
          uyarilar: [`Adres hafızadan geldi — bu müşteriye daha önce ${hatira.teslimatSayisi} kez gidilmiş`],
        };
      }
    }

    const sonuc = await D.durakEkle(durum.gun, {
      belgeNo, ad, telefon,
      urun: (ekBilgi && ekBilgi.urun) || urunBul(hamMetin),
      parca: parcaBul(hamMetin),
      hamMetin,
      cozum: sonCozum,
    });
    ciz();
    return sonuc;
  }

  /* ---- ham metinden ek alanlar (adres dışı) ---- */

  function belgeNoBul(t) {
    let m = t.match(/Çıkış\s*Belgesi\s*[:.]?\s*([0-9]{6,12})/i)
         || t.match(/\bNo\.\s*[:.]?\s*([0-9]{7,12})\b/i)
         || t.match(/Teslimat\s*No\s*[:.]?\s*([0-9_]{6,20})/i)
         || t.match(/Sipariş\s*No\s*[:.]?\s*([0-9_]{6,20})/i);
    return m ? m[1].trim() : null;
  }
  function telefonBul(t) {
    const m = t.match(/(?:\+?90[\s-]?)?0?\s?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}/);
    return m ? m[0].trim() : null;
  }
  function aliciBul(t) {
    const m = t.match(/Alıcı\s*[:.]?\s*([^\n\r]{3,60})/i) || t.match(/SAYIN\s*[\n\r]+\s*([^\n\r]{3,60})/i);
    if (!m) return null;
    return m[1].replace(/\s{2,}/g, ' ').trim() || null;
  }
  function urunBul(t) {
    const m = t.match(/Ürün\s*[:.]?\s*([^\n\r]{3,70})/i);
    return m ? m[1].trim() : null;
  }
  /** "2/1", "3/2" — toplam parça sayısı soldaki rakam. */
  function parcaBul(t) {
    const m = t.match(/\b([2-9])\s*\/\s*[1-9]\b/);
    return m ? parseInt(m[1], 10) : 1;
  }

  /* ═══════════════════════════════════════════════════════════ rota ═══ */

  /**
   * ROTAYA GİRMEMİŞ DURAKLAR.
   *
   * ⚠️ GERÇEK GÜN KAYDINDA ÖLÇÜLDÜ (2026-08-30): 20 durağın YALNIZ 14'Ü
   * rotadaydı. Kalan 6'sı rota çıkarıldıktan SONRA okutulmuş ve sıra
   * numarası hiç almamıştı; ekranda da bunun bir işareti yoktu. Sürücü
   * 14 duraklık turu bitirip kalan 6'ya ayrı çıksa 303,8 km ediyor;
   * yirmisi birlikte sıralansa 262,6 km. **Günde 41 km boşuna.**
   * Sorun rota algoritmasında değil, rotanın BAYATLAMASINDAYDI.
   */
  function rotaDisiDuraklar() {
    if (!durum.gun || !durum.gun.rota) return [];
    return (durum.gun.duraklar || []).filter(
      (d) => d.durum === 'bekliyor' && d.lat != null && d.sira == null);
  }

  /**
   * Yeni durak eklendikten sonra rotayı kendiliğinden tazeler.
   *
   * Sabah okutma aşamasındaysa (henüz hiç teslimat yapılmadıysa) sessizce
   * yeniden sıralanıyor — kullanıcının istediği davranış bu: "her gün toplam
   * faturaya göre bulunduğu konumdan en uygun rota".
   * Yola çıkıldıysa SIRA KENDİLİĞİNDEN DEĞİŞTİRİLMİYOR; sürücü sırayı
   * ezberlemiş olabilir, kararı ona bırakılıp uyarı gösteriliyor.
   */
  async function rotayiTazeleGerekirse() {
    const disarida = rotaDisiDuraklar();
    if (!disarida.length) return;
    const o = D.ozet(durum.gun);
    if (o.teslim || o.basarisiz) return;          // yola çıkılmış — dokunma, uyar
    await rotaOlustur({ sessiz: true });
    bilgiGoster(`Rota güncellendi — ${disarida.length} yeni durak sıraya girdi.`);
  }

  async function rotaOlustur(ayar) {
    const sessiz = !!(ayar && ayar.sessiz);
    const bekleyen = D.siraliDuraklar(durum.gun).filter((d) => d.durum === 'bekliyor');
    const koordinatli = bekleyen.filter((d) => d.lat != null);
    const koordinatsiz = bekleyen.length - koordinatli.length;

    if (!koordinatli.length) { if (!sessiz) uyar('Rotaya girecek adres yok.'); return; }
    if (koordinatsiz && !sessiz) {
      if (!confirm(`${koordinatsiz} adres okunamadı, rotaya giremeyecek.\nYine de rotayı çıkarayım mı?`)) return;
    }
    const supheli = koordinatli.filter((d) => d.renk !== 'yesil').length;
    if (supheli && !sessiz && !confirm(`${supheli} adres kontrol bekliyor.\nYine de rotayı çıkarayım mı?`)) return;

    /* BAŞLANGIÇ = SÜRÜCÜNÜN O ANKİ KONUMU. Taze isteniyor, beklenmiyor değil.
       Önbellekteki konum sabah evde alınmış olabilir; rota depodan değil
       evden başlar ve bütün sıra kayar. */
    let baslangic = null, baslangicKaynak = 'konum';
    try {
      if (!sessiz) bilgiGoster('Konumun alınıyor…', true);
      /* Sessiz tazelemede önbellekteki konum yeterli: sürücü hâlâ fatura
         okutuyor, yerinden kalkmamış. Her okutmada GPS'e gitmek pil yer. */
      baslangic = await konumAl({ sure: sessiz ? 6000 : 10000, enFazlaYas: sessiz ? 120000 : 15000 });
    } catch (e) {
      /* Konum yoksa SESSİZCE ilk durağa düşmek yanlış rota üretiyordu.
         Sürücüye ne olduğunu söyleyip kararı ona bırakıyoruz. */
      bilgiGizle();
      if (sessiz) {
        /* Tazeleme sırasında konum yoksa eski başlangıç korunuyor; sıra
           yine de tazeleniyor ki yeni duraklar dışarıda kalmasın. */
        const r = durum.gun.rota;
        if (r && r.baslangicLat != null) {
          baslangic = { lat: r.baslangicLat, lng: r.baslangicLng };
          baslangicKaynak = r.baslangicKaynak || 'onceki';
        } else {
          baslangic = { lat: koordinatli[0].lat, lng: koordinatli[0].lng };
          baslangicKaynak = 'ilk-durak';
        }
      } else {
        const devam = confirm(
          e.message + '\n\n' +
          'Konum olmadan rota, İLK OKUTULAN ADRESTEN başlatılır ve sıra ' +
          'bulunduğun yere göre olmaz.\n\n' +
          'Yine de bu şekilde çıkarayım mı?');
        if (!devam) { uyar('Rota çıkarılmadı — konum izni verip tekrar dene.'); return; }
        baslangic = { lat: koordinatli[0].lat, lng: koordinatli[0].lng };
        baslangicKaynak = 'ilk-durak';
      }
    }

    const noktalar = koordinatli.map((d) => ({ lat: d.lat, lng: d.lng }));

    /* GERÇEK YOL SÜRESİ varsa onunla, yoksa kuş uçuşuyla sırala.
       Kuş uçuşu × 1,35 şehir içinde iyi iş görüyor ama Denizli'de arada dağ
       var: Çivril 100 km ötede ve bazı mahalleler arasında kuş uçuşu 800 m
       olan yol 3 km sürüyor. ORS anahtarı girilmişse gerçek süre alınıyor.
       Ağ yoksa, kota dolmuşsa veya anahtar geçersizse SESSİZCE kuş uçuşuna
       düşülüyor — rota her hâlükârda çıkıyor, sürücü yolda kalmıyor. */
    let matris = null, birim = 'mesafe';
    const anahtar = await D.ayarGetir('orsAnahtar', null);
    if (anahtar && noktalar.length + 1 <= M.ors.AZAMI_NOKTA) {
      try {
        if (!sessiz) bilgiGoster('Gerçek yol süreleri alınıyor…', true);
        matris = await M.ors.matrisAl([baslangic, ...noktalar], anahtar);
        birim = 'sure';
        bilgiGoster(matris.bosluk
          ? `Yol süreleri geldi (${matris.bosluk} nokta yola bağlanmadı, tahmin edildi)`
          : 'Yol süreleri geldi');
      } catch (e) {
        matris = null;
        bilgiGoster('Yol süresi alınamadı (' + e.message + ') — kuş uçuşuyla sıralandı');
      }
    }

    const r = M.rota.sirala(baslangic, noktalar, matris ? { matris, birim } : {});
    await D.rotaKaydet(durum.gun, r.sira.map((i) => koordinatli[i].id), {
      baslangicLat: baslangic.lat, baslangicLng: baslangic.lng,
      baslangicKaynak, baslangicDogruluk: baslangic.dogruluk || null,
      matrisKaynak: matris ? 'ors' : 'kusucusu',
      toplamMetre: r.toplamMetre, toplamDakika: r.toplamDakika,
      yontem: r.yontem,
    });
    bilgiGizle();
    if (baslangicKaynak === 'ilk-durak' && !sessiz) {
      uyar('Rota, konum alınamadığı için ilk okutulan adresten başlatıldı.');
    }
    if (!sessiz) sayfaGoster('bugun');
    ciz();
  }

  /* ═══════════════════════════════════════════════════════ konum ═══ */

  function konumIste() {
    konumAl({ enFazlaYas: 30000 }).then(varisKontrol).catch(() => {});
  }

  /**
   * KONUM AL — söz (Promise) döndüren, HATASI GÖRÜNEN sürüm.
   *
   * ⚠️ BURADA SESSİZ BİR HATA VARDI VE ROTAYI BOZUYORDU.
   * Önceki hâlde konum hatası `() => {}` ile yutuluyordu. Konum izni
   * verilmemişse, GPS kilitlenmemişse ya da sürücü rotayı uygulamayı açar
   * açmaz istediyse `durum.konum` boş kalıyor, rota da sessizce
   * "İLK OKUTULAN FATURANIN ADRESİNDEN" başlatılıyordu.
   *
   * Sonuç tam olarak kullanıcının anlattığı şey: 2 km'deki durak dururken
   * rota 5,1 km'deki durakla başlıyor. Rota aslında yanlış değil —
   * YANLIŞ YERDEN başlatılmış bir rota için doğru. Sürücü bunu göremiyor
   * çünkü ekranda başlangıcın nerede alındığı hiç yazmıyor.
   *
   * Artık: hata yukarı taşınıyor, rota kurulurken konum TAZE isteniyor ve
   * alınamazsa sürücüye ne olduğu açıkça söyleniyor.
   */
  function konumAl(ayar) {
    const a = ayar || {};
    return new Promise((coz, hata) => {
      if (!navigator.geolocation) { hata(new Error('Bu cihazda konum servisi yok')); return; }
      navigator.geolocation.getCurrentPosition(
        (p) => {
          durum.konum = {
            lat: p.coords.latitude, lng: p.coords.longitude,
            dogruluk: p.coords.accuracy, zaman: Date.now(),
          };
          coz(durum.konum);
        },
        (e) => {
          const mesajlar = {
            1: 'Konum izni verilmemiş. Tarayıcı ayarlarından bu siteye konum izni ver.',
            2: 'Konum alınamadı — GPS kapalı ya da sinyal yok.',
            3: 'Konum alınamadı — çok uzun sürdü.',
          };
          hata(new Error(mesajlar[e && e.code] || 'Konum alınamadı'));
        },
        { enableHighAccuracy: true, timeout: a.sure || 8000, maximumAge: a.enFazlaYas == null ? 0 : a.enFazlaYas }
      );
    });
  }

  /**
   * VARIŞ ALGILAMA — uygulamaya her dönüşte çalışıyor.
   *
   * Sürücü Google Maps'ten dönüp sıradaki durağı görmek için uygulamayı zaten
   * açıyor; o an konuma bakmak, arka planda sürekli konum dinlemekten hem
   * daha basit hem de pili tüketmiyor. (Android APK'da buna ek olarak arka
   * plan bildirimi gelecek.)
   */
  function varisKontrol() {
    if (!durum.konum || !durum.gun) return;
    const aktif = D.siradaki(durum.gun);
    if (!aktif || aktif.lat == null) return;
    const m = mesafeMetre(durum.konum, aktif);
    if (m < 120 && !aktif._soruldu) {
      aktif._soruldu = true;
      if (confirm(`${aktif.ad || 'Durak ' + aktif.sira} adresindesin (${Math.round(m)} m).\nTeslim edildi mi?`)) {
        teslimEt(aktif.id, 'teslim');
      }
    }
  }

  function mesafeMetre(a, b) {
    const R = 6371000, d = Math.PI / 180;
    const x = (b.lat - a.lat) * d, y = (b.lng - a.lng) * d;
    const h = Math.sin(x / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(y / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /* ═══════════════════════════════════════════════════════ eylemler ═══ */

  async function teslimEt(id, sonuc, sebep) {
    await D.durumYaz(durum.gun, id, sonuc, sebep);
    /* Aktif durak değişti — arka plan takibin bildirim kilidi açılmalı,
       yoksa sıradaki durağa varıldığında ikinci bildirim düşmez. */
    if (global.ArkaPlanTakip) global.ArkaPlanTakip.sifirla();
    ciz();
  }

  /**
   * ARKA PLAN TAKİBİ (yalnız Android APK'da).
   *
   * Tarayıcıda konum ancak uygulama ön plandayken okunabiliyor; sürücü Google
   * Maps'e geçtiği anda web sürümü kör kalıyor ve varışı ancak uygulamaya
   * döndüğünde anlıyor. APK'da Android ön plan servisi devralıyor: telefon
   * cepteyken bile "durağa vardın" bildirimi düşüyor.
   *
   * Rota varken ve bekleyen durak varken açık; gün bitince kapanıyor.
   */
  function takibiAyarla() {
    const T = global.ArkaPlanTakip;
    if (!T || !T.var) return;
    const gerekli = !!(durum.gun && durum.gun.rota && D.siradaki(durum.gun));
    if (gerekli && !takibiAyarla._acik) {
      takibiAyarla._acik = true;
      T.basla(() => {
        const d = D.siradaki(durum.gun);
        return d ? { id: d.id, sira: d.sira, ad: d.ad, lat: d.lat, lng: d.lng } : null;
      });
    } else if (!gerekli && takibiAyarla._acik) {
      takibiAyarla._acik = false;
      T.dur();
    }
  }

  function yolTarifi(d) {
    if (d.lat == null) { uyar('Bu durağın koordinatı yok.'); return; }
    /* Evrensel bağlantı: Google Maps kuruluysa uygulama açılıyor, değilse
       tarayıcıda. iOS ve Android'de aynı şekilde çalışıyor, API anahtarı
       gerektirmiyor, ücretsiz. */
    const url = `https://www.google.com/maps/dir/?api=1&destination=${d.lat},${d.lng}&travelmode=driving`;
    window.open(url, '_blank');
  }

  /* ═══════════════════════════════════════════════════════════ çizim ═══ */

  function ciz() {
    if (!durum.gun) return;
    const o = D.ozet(durum.gun);
    $('#gunTarih').textContent = tarihYaz(durum.gun.tarih);
    $('#sDurak').textContent = o.toplam;
    $('#sTeslim').textContent = o.teslim;
    $('#sKalan').textContent = o.bekleyen;
    $('#sKm').textContent = durum.gun.rota ? (durum.gun.rota.toplamMetre / 1000).toFixed(1) : '—';

    const rz = $('#rozetBugun');
    if (o.bekleyen) { rz.hidden = false; rz.textContent = o.bekleyen; } else rz.hidden = true;

    cizAktif();
    cizUyari(o);
    cizListe();
    cizYuzen(o);
  }

  function cizAktif() {
    const alan = $('#aktifAlan');

    /* GÜN KAPANDIYSA ÖZET GÖSTER.
       Önceden kapanan gün ekranda hiç belli olmuyordu: "Günü Kapat"a basınca
       aynı liste aynı şekilde duruyordu ve hiçbir şey olmamış gibi
       görünüyordu. Gün gerçekten kapanıyordu (arşive düşüyordu) ama arayüzde
       bunun bir karşılığı yoktu. */
    if (durum.gun.durum === 'kapali') {
      const o = D.ozet(durum.gun);
      const km = durum.gun.rota ? (durum.gun.rota.toplamMetre / 1000).toFixed(1) + ' km · ' : '';
      const yarin = tarihYaz(sonrakiTarih(durum.gun.tarih));
      alan.innerHTML = `
        <div class="aktif" style="border-color:var(--yesil);box-shadow:0 4px 16px rgba(21,128,61,.12)">
          <div class="ust">
            <div class="no" style="background:var(--yesil)">✓</div>
            <div><div class="ad">Gün kapandı</div>
            <div class="ek">${kacis(tarihYaz(durum.gun.tarih))}</div></div>
          </div>
          <div class="adres">${o.teslim} teslim${o.basarisiz ? ` · ${o.basarisiz} teslim edilemedi` : ''}${o.bekleyen ? ` · ${o.bekleyen} kaldı` : ''}</div>
          <div class="ek">${km}${o.parca} parça · ${o.toplam} durak</div>
          <div class="ek" style="margin-top:8px">
            Yeni liste <b>${kacis(yarin)}</b> sabahı boş başlayacak.
            Bugünün kaydı Arşiv'de duruyor.
          </div>
          <div class="eylem">
            <button class="dugme" data-eylem="gunYenidenAc">↩︎ Günü Yeniden Aç</button>
          </div>
        </div>`;
      return;
    }

    const d = durum.gun.rota ? D.siradaki(durum.gun) : null;
    if (!d) { alan.innerHTML = ''; return; }
    alan.innerHTML = `
      <div class="aktif">
        <div class="ust">
          <div class="no">${d.sira || '•'}</div>
          <div><div class="ad">${kacis(d.ad || 'İsimsiz')}</div>
          ${d.parca > 1 ? `<span class="rozet">${d.parca} parça</span>` : ''}</div>
        </div>
        <div class="adres">${kacis(adresYaz(d))}</div>
        ${d.urun ? `<div class="ek">${kacis(d.urun)}</div>` : ''}
        ${d.telefon ? `<div class="ek">${kacis(d.telefon)}</div>` : ''}
        <div class="eylem">
          <button class="dugme birincil" data-eylem="tarif" data-id="${d.id}">🧭 Yol Tarifi</button>
          <div class="dugme-sirasi">
            ${d.telefon ? `<a class="dugme" href="tel:${kacis(d.telefon.replace(/\s/g, ''))}">📞 Ara</a>` : ''}
            <button class="dugme" data-eylem="duzelt" data-id="${d.id}">✏️ Düzelt</button>
          </div>
          <div class="dugme-sirasi">
            <button class="dugme yesil" data-eylem="teslim" data-id="${d.id}">✓ Teslim Edildi</button>
            <button class="dugme kirmizi" data-eylem="basarisiz" data-id="${d.id}">✕ Edilemedi</button>
          </div>
        </div>
      </div>`;
  }

  function cizUyari(o) {
    const alan = $('#uyariAlan');
    const parca = [];
    if (o.kirmizi) parca.push(`<div class="uyari kirmizi">⚠ <div><b>${o.kirmizi} adres okunamadı.</b> Rotaya giremezler — dokunup elle düzelt.</div></div>`);
    if (o.sari) parca.push(`<div class="uyari">⚠ <div><b>${o.sari} adres kontrol bekliyor.</b> Doğruysa dokunup onayla.</div></div>`);

    /* ROTAYA GİRMEMİŞ DURAK VARSA EN ÜSTTE, KIRMIZI.
       Gerçek kayıtta 20 durağın 6'sı rotanın dışında kalmıştı ve ekranda
       hiçbir işareti yoktu — sürücü 41 km fazla yol yapardı. */
    const disarida = rotaDisiDuraklar();
    if (disarida.length) {
      parca.unshift(`<div class="uyari kirmizi">⚠ <div>
        <b>${disarida.length} durak rotada değil.</b>
        Rota çıkarıldıktan sonra okutuldular; listenin sonunda "rotada değil"
        yazan kartlar onlar. Bu hâlde gidersen aynı bölgeye iki kez çıkarsın.
        <button class="dugme kucuk" data-eylem="rota" style="margin-top:6px">🔄 Rotayı yenile — ${disarida.length} durağı da kat</button>
      </div></div>`);
    }

    /* ROTANIN NEREDEN BAŞLADIĞI GÖRÜNMELİ.
       Sıra mantıksız göründüğünde ilk sorulacak soru budur; ekranda
       yazmadığı için sürücü rotanın yanlış yerden kurulduğunu göremiyordu. */
    const r = durum.gun && durum.gun.rota;
    if (r) {
      if (r.baslangicKaynak === 'ilk-durak') {
        parca.push(`<div class="uyari kirmizi">⚠ <div>
          <b>Bu rota senin konumundan çıkarılmadı.</b>
          Konum alınamadığı için ilk okutulan adres başlangıç sayıldı — sıra
          bulunduğun yere göre değil.
          <button class="dugme kucuk" data-eylem="rota" style="margin-top:6px">Konumla yeniden çıkar</button>
        </div></div>`);
      } else if (r.baslangicLat != null) {
        const yas = r.zaman ? Math.round((Date.now() - new Date(r.zaman).getTime()) / 60000) : null;
        /* EN YAKIN DURAKLA BAŞLAMAMAK ÇOĞU ZAMAN DOĞRUDUR — ama açıklanmazsa
           hata gibi görünüyor. Kullanıcı "2 km'deki dururken beni 5,1 km'ye
           attı" dedi; en yakına gitmek, sonrasında geri dönmeyi gerektirip
           toplam yolu uzatabiliyor. Onun için ilk durak en yakın değilse
           nedeni bir cümleyle yazılıyor. */
        let ilkNot = '';
        const bekleyenler = D.siraliDuraklar(durum.gun).filter((d) => d.sira != null && d.lat != null);
        if (bekleyenler.length > 2 && r.baslangicLat != null) {
          const bas = { lat: r.baslangicLat, lng: r.baslangicLng };
          const ilk = bekleyenler[0];
          const enYakin = bekleyenler.reduce((a, b) =>
            mesafeMetre(bas, b) < mesafeMetre(bas, a) ? b : a);
          if (enYakin.id !== ilk.id) {
            ilkNot = `<br>İlk durak en yakın olan değil (${(mesafeMetre(bas, enYakin) / 1000).toFixed(1)} km'deki
              ${kacis(enYakin.mahalle || 'durak')} sonraya kaldı) — toplam yol böyle daha kısa çıkıyor.`;
          }
        }
        parca.push(`<div class="uyari bilgi">🧭 <div>
          Başlangıç: <b>bulunduğun konum</b>${r.baslangicDogruluk ? ` (±${Math.round(r.baslangicDogruluk)} m)` : ''}
          · ${r.matrisKaynak === 'ors' ? 'gerçek yol süresiyle' : 'kuş uçuşu tahminle'} sıralandı${yas != null && yas > 45 ? ` · ${yas} dk önce` : ''}.
          ${yas != null && yas > 45 ? '<b>Çok yol aldıysan yenile.</b>' : ''}${ilkNot}
        </div></div>`);
      }
    }
    alan.innerHTML = parca.join('');
  }

  function cizListe() {
    const liste = D.siraliDuraklar(durum.gun);
    const alan = $('#durakListe');
    if (!liste.length) {
      alan.innerHTML = `<div class="bos"><strong>Bugün henüz fatura okutulmadı</strong>
        Alttaki <b>Tara</b> sekmesinden başla. Kaç fatura olursa olsun —
        1 tane de, 50 tane de aynı şekilde çalışır.</div>`;
      return;
    }
    const aktifId = durum.gun.rota ? (D.siradaki(durum.gun) || {}).id : null;
    const araliklar = duraklarArasiMesafe(liste);
    alan.innerHTML = liste.filter((d) => d.id !== aktifId).map((d) => `
      <div class="kart tiklanir ${d.renk} ${d.durum === 'teslim' ? 'teslim' : ''}" data-eylem="ac" data-id="${d.id}">
        <div class="sira">${d.durum === 'teslim' ? '✓' : d.durum === 'basarisiz' ? '✕' : (d.sira ?? '·')}</div>
        <div class="govde">
          <div class="ad">${kacis(d.ad || 'İsimsiz')}</div>
          <div class="adres">${kacis(adresYaz(d))}</div>
          <div class="alt">
            ${d.parca > 1 ? `<span class="rozet">${d.parca} parça</span>` : ''}
            ${d.kareSayisi > 1 ? `<span class="rozet">${d.kareSayisi} kare</span>` : ''}
            ${d.renk !== 'yesil' ? `<span class="rozet ${d.renk}">${d.renk === 'kirmizi' ? 'okunamadı' : 'kontrol et'}</span>` : ''}
            ${d.keskinlik === 'yol' ? '<span class="rozet sari">kapı no yok</span>' : ''}
            ${d.elleDuzeltildi ? '<span class="rozet yesil">elle düzeltildi</span>' : ''}
            ${araliklar[d.id] != null ? `<span class="rozet">${araliklar[d.id].toFixed(1)} km</span>` : ''}
            ${durum.gun.rota && d.sira == null && d.durum === 'bekliyor' && d.lat != null
              ? '<span class="rozet kirmizi">rotada değil</span>' : ''}
            ${ayniAdresSayisi(d) > 1 ? `<span class="rozet sari">aynı adrese ${ayniAdresSayisi(d)} teslimat</span>` : ''}
          </div>
        </div>
      </div>`).join('');
  }

  function cizYuzen(o) {
    const alan = $('#yuzenAlan');
    const gosterilecek = durum.sayfa === 'bugun' && o.toplam > 0;
    $('#sayfa-bugun').classList.toggle('yuzenli', gosterilecek);
    if (!gosterilecek) { alan.innerHTML = ''; return; }
    /* Kapanmış günde yüzen düğme olmaz — eylem özet kartının içinde. */
    if (durum.gun.durum === 'kapali') { alan.innerHTML = ''; return; }
    const varRota = !!durum.gun.rota;
    const kalan = o.bekleyen;
    if (varRota && !kalan) {
      alan.innerHTML = `<button class="dugme yesil" data-eylem="gunKapat">🏁 Günü Kapat</button>`;
    } else {
      alan.innerHTML = `<button class="dugme birincil" data-eylem="rota">
        ${varRota ? '🔄 Rotayı Yenile' : '🧭 Rotayı Oluştur'} · ${kalan} durak</button>`;
    }
  }

  /**
   * Her durağın BİR ÖNCEKİ duraktan uzaklığı (km, kuş uçuşu).
   *
   * Sürücü sıranın neden böyle olduğunu ancak aradaki mesafeleri görürse
   * yargılayabiliyor. "Beni 10 km uzağa attı" şikâyeti de ancak böyle
   * doğrulanabilir hâle geliyor: aralık kartın üstünde yazıyor.
   * İlk durak için ölçü, rotanın başlangıç konumundan.
   */
  function duraklarArasiMesafe(liste) {
    const sonuc = {};
    const r = durum.gun && durum.gun.rota;
    let onceki = r && r.baslangicLat != null ? { lat: r.baslangicLat, lng: r.baslangicLng } : null;
    for (const d of liste) {
      if (d.sira == null || d.lat == null) continue;
      if (onceki) sonuc[d.id] = mesafeMetre(onceki, d) / 1000;
      onceki = { lat: d.lat, lng: d.lng };
    }
    return sonuc;
  }

  /**
   * Aynı adrese kaç teslimat var?
   *
   * Gerçek kayıtta aynı adres iki ayrı durak olarak duruyordu (Adalet Mh.
   * 10081. sk. no 13, iki kez). İkisi de geçerli olabilir — bir eve iki ayrı
   * sipariş çıkabiliyor — ama aynı belgenin iki kez okutulmuş olması da
   * mümkün ve o zaman sürücü aynı kapıya iki kez gidiyor.
   * Tekilleştirme belge numarasına bakıyor; belge numarası okunamamışsa
   * yakalanamıyor. Bu yüzden karar sürücüye bırakılıp sadece işaretleniyor.
   */
  function ayniAdresSayisi(d) {
    if (!durum.gun || d.lat == null) return 1;
    const anahtar = (x) => x.lat.toFixed(5) + ',' + x.lng.toFixed(5);
    const k = anahtar(d);
    return (durum.gun.duraklar || []).filter((x) => x.lat != null && anahtar(x) === k).length;
  }

  function adresYaz(d) {
    const p = [d.mahalle && d.mahalle + ' Mh.', d.yol, d.kapino && 'No ' + d.kapino,
               d.daire && 'D:' + d.daire, d.ilce].filter(Boolean);
    return p.length ? p.join(' · ') : 'Adres okunamadı';
  }

  /** "2026-08-30" → "2026-08-31". Kapanış özetinde yeni günü söylemek için. */
  function sonrakiTarih(t) {
    const [y, a, g] = t.split('-').map(Number);
    const d = new Date(y, a - 1, g + 1);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function tarihYaz(t) {
    const [y, a, g] = t.split('-');
    const aylar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz',
                   'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    return `${parseInt(g, 10)} ${aylar[parseInt(a, 10) - 1]}`;
  }

  /* ═══════════════════════════════════════════════════════ tarama ekranı */

  function taramaSonucGoster(sonuc, kareId) {
    const d = sonuc.durak;
    const alan = $('#taramaSonuc');
    const kart = document.createElement('div');
    kart.className = `kart ${d.renk}`;
    /* Adres çözülemediyse fotoğraf hâlâ elimizde: sürücü adresin üstünü
       parmağıyla gösterip aynı kareyi yeniden okutabilsin. */
    const kutuVar = d.renk === 'kirmizi' && kareId && bekleyenKareler.has(kareId);
    kart.innerHTML = `
      <div class="sira">${sonuc.birlestirildi ? '↩' : '+'}</div>
      <div class="govde">
        <div class="ad">${kacis(d.ad || 'İsimsiz')}</div>
        <div class="adres">${kacis(adresYaz(d))}</div>
        <div class="alt">
          ${sonuc.birlestirildi ? '<span class="rozet">aynı belge — birleştirildi</span>'
                               : '<span class="rozet yesil">yeni durak</span>'}
          ${d.renk !== 'yesil' ? `<span class="rozet ${d.renk}">${d.renk === 'kirmizi' ? 'okunamadı' : 'kontrol et'}</span>` : ''}
          ${!sonuc.birlestirildi && ayniAdresSayisi(d) > 1
            ? `<span class="rozet sari">aynı adrese ${ayniAdresSayisi(d)}. teslimat — aynı belgeyi iki kez okutmuş olabilirsin</span>` : ''}
          ${kutuVar ? `<button class="dugme kucuk birincil" data-kutu="${kareId}">📐 Adresi göster</button>` : ''}
          <button class="dugme kucuk" data-eylem="duzelt" data-id="${d.id}">Düzelt</button>
          <button class="dugme kucuk kirmizi" data-eylem="durakSil" data-id="${d.id}">Sil</button>
        </div>
      </div>`;
    const kd = kart.querySelector('[data-kutu]');
    if (kd) kd.addEventListener('click', () => kutuAc(kd.dataset.kutu));
    alan.prepend(kart);
  }

  /* ═══════════════════════════════════════════════════════ arşiv ═══ */

  async function cizArsiv() {
    const gunler = await D.gunler();
    $('#arsivListe').innerHTML = gunler.length ? gunler.map((g) => {
      const o = D.ozet(g);
      return `<div class="gun-satir">
        <div><div class="t">${tarihYaz(g.tarih)}</div>
          <div style="font-size:13px;color:#5b6472">${g.durum === 'acik' ? 'açık' : 'kapalı'}</div></div>
        <div class="s">${o.toplam} durak · ${o.teslim} teslim${o.basarisiz ? ` · ${o.basarisiz} olmadı` : ''}
          ${g.rota ? `<br>${(g.rota.toplamMetre / 1000).toFixed(1)} km` : ''}</div>
      </div>`;
    }).join('') : '<div class="bos"><strong>Arşiv boş</strong>Kapanan günler burada birikir.</div>';

    /* Yol süresi ayarları */
    const anahtar = await D.ayarGetir('orsAnahtar', '');
    const alan = document.querySelector('#orsAnahtar');
    if (alan) alan.value = anahtar || '';
    const durumYazisi = document.querySelector('#orsDurum');
    if (durumYazisi) {
      durumYazisi.textContent = anahtar
        ? 'Gerçek yol süresi açık — rota gerçek sürüş süreleriyle sıralanıyor.'
        : 'Şu an kuş uçuşu mesafeyle sıralanıyor. Anahtar girersen gerçek sürüş süreleri kullanılır.';
    }
    const atif = document.querySelector('#orsAtif');
    if (atif) atif.textContent = anahtar ? M.ors.ATIF : '';

    const m = await D.musteriler();
    $('#hafizaOzet').innerHTML = `
      <div class="kart"><div class="govde">
        <div class="ad">📒 Adres hafızası</div>
        <div class="adres">${m.length} müşteri kayıtlı. Aynı müşteri tekrar geldiğinde
        adresi okutmadan hazır gelir.</div>
      </div></div>`;
  }

  /* ═══════════════════════════════════════════════════ düzeltme ═══ */

  function ilceSecenekleriDoldur() {
    $('#dIlce').innerHTML = '<option value="">— seç —</option>' +
      durum.kaynak.ilceler().map((i) => `<option value="${kacis(i.ad)}">${kacis(i.ad)}</option>`).join('');
  }

  function duzeltAc(id) {
    const d = durum.gun.duraklar.find((x) => x.id === id);
    if (!d) return;
    durum.duzeltilenId = id;
    $('#dAd').value = d.ad || '';
    $('#dTel').value = d.telefon || '';
    $('#dIlce').value = d.ilce || '';
    $('#dMahalle').value = d.mahalle || '';
    $('#dYol').value = d.yol || '';
    $('#dKapino').value = d.kapino || '';
    $('#dDaire').value = d.daire || '';
    $('#duzeltUyari').innerHTML = (d.uyarilar || []).length
      ? `<div class="uyari">⚠ <div>${d.uyarilar.map(kacis).join('<br>')}</div></div>` : '';
    $('#duzeltSonuc').innerHTML = '';
    $('#katmanDuzelt').classList.add('acik');
  }

  async function duzeltDene() {
    const bilesen = {
      ilce: $('#dIlce').value || null,
      mahalle: $('#dMahalle').value || null,
      yol: $('#dYol').value || null,
      kapino: $('#dKapino').value || null,
    };
    await ilceleriHazirla([bilesen.ilce]);
    const c = M.adres.coz(durum.kaynak, bilesen);
    $('#duzeltSonuc').innerHTML = c.lat != null
      ? `<div class="uyari" style="background:#dcfce7;color:#15803d">✓ <div>
           <b>${kacis(c.mahalle || '')} ${kacis(c.yol || '')} ${c.kapino ? 'No ' + kacis(c.kapino) : ''}</b><br>
           ${c.keskinlik === 'kapi' ? `kapı bulundu — sokağa ${c.yolaUzaklik} m` : c.keskinlik + ' seviyesi'}</div></div>`
      : `<div class="uyari kirmizi">⚠ <div>Bu adres bulunamadı. Mahalle ve sokak adını kontrol et.</div></div>`;
    return c;
  }

  async function duzeltKaydet() {
    const c = await duzeltDene();
    const yeni = {
      ad: $('#dAd').value || null,
      telefon: $('#dTel').value || null,
      ilce: c.ilce || $('#dIlce').value || null,
      mahalle: c.mahalle || $('#dMahalle').value || null,
      yol: c.yol || $('#dYol').value || null,
      kapino: c.kapino || $('#dKapino').value || null,
      daire: $('#dDaire').value || null,
      keskinlik: c.keskinlik,
    };
    if (c.lat != null) { yeni.lat = c.lat; yeni.lng = c.lng; }
    const d = await D.durakDuzelt(durum.gun, durum.duzeltilenId, yeni);
    if (d && d.telefon && d.lat != null) await D.hafizayaYaz(d);
    $('#katmanDuzelt').classList.remove('acik');
    ciz();
  }

  /* ═══════════════════════════════════════════════════════ olaylar ═══ */

  function sayfaGoster(ad) {
    durum.sayfa = ad;
    $$('.sayfa').forEach((s) => s.classList.toggle('etkin', s.id === 'sayfa-' + ad));
    $$('.alt button').forEach((b) => b.classList.toggle('etkin', b.dataset.sayfa === ad));
    $('#sayfaBaslik').textContent = { bugun: 'Bugün', tara: 'Fatura Tara', arsiv: 'Arşiv' }[ad];
    if (ad === 'arsiv') cizArsiv();
    ciz();
  }

  function olaylariBagla() {
    $$('.alt button').forEach((b) => b.addEventListener('click', () => sayfaGoster(b.dataset.sayfa)));
    kutuOlaylari();

    document.addEventListener('click', async (e) => {
      const h = e.target.closest('[data-eylem]');
      if (!h) return;
      const id = h.dataset.id ? parseInt(h.dataset.id, 10) : null;
      switch (h.dataset.eylem) {
        case 'rota': await rotaOlustur(); break;
        case 'tarif': { const d = durum.gun.duraklar.find((x) => x.id === id); if (d) yolTarifi(d); break; }
        case 'teslim': await teslimEt(id, 'teslim'); break;
        case 'basarisiz': {
          const s = prompt('Neden teslim edilemedi?', 'Kapıda kimse yok');
          if (s !== null) await teslimEt(id, 'basarisiz', s);
          break;
        }
        case 'duzelt': duzeltAc(id); break;
        case 'ac': duzeltAc(id); break;
        /* Yanlış okunan bir kareyi düzeltme penceresini açmadan, olduğu
           yerden silmek için. Tarama ekranında hemen fark edilip atılıyor. */
        case 'durakSil': {
          const d = durum.gun.duraklar.find((x) => x.id === id);
          const etiket = d ? (d.ad || adresYaz(d)) : 'Bu durak';
          if (!confirm(`${etiket}\n\nBu durak silinsin mi?`)) break;
          await D.durakSil(durum.gun, id);
          const kart = h.closest('.kart');
          if (kart) kart.remove();
          ciz();
          bilgiGoster('Durak silindi.');
          break;
        }
        case 'gunKapat':
          if (confirm('Günü kapatayım mı?\nBugünün kaydı arşive geçer, yeni liste yarın sabah boş başlar.')) {
            await D.gunKapat(durum.gun.tarih);
            /* Aynı takvim gününde ikinci bir gün açılamaz (tarih birincil
               anahtar) ve açılmamalı da — o gün hâlâ aynı gün. Kapanan gün
               yeniden okunup ekranda "kapandı" özeti gösteriliyor. */
            durum.gun = await D.gunAc(durum.gun.tarih);
            ciz();
          }
          break;
        case 'gunYenidenAc':
          await D.gunuYenidenAc(durum.gun.tarih);
          durum.gun = await D.gunAc(durum.gun.tarih);
          ciz();
          bilgiGoster('Gün yeniden açıldı.');
          break;
      }
    });

    $('#btnKamera').addEventListener('click', () => $('#girdiKamera').click());
    $('#btnGaleri').addEventListener('click', () => $('#girdiGaleri').click());
    $('#girdiKamera').addEventListener('change', (e) => dosyalariIsle(e.target.files));
    $('#girdiGaleri').addEventListener('change', (e) => dosyalariIsle(e.target.files));

    $('#btnMetinEkle').addEventListener('click', async () => {
      const t = $('#metinGirdi').value;
      const s = await metniIsle(t);
      if (s) { taramaSonucGoster(s); $('#metinGirdi').value = ''; }
    });
    $('#btnMetinTemizle').addEventListener('click', () => { $('#metinGirdi').value = ''; });

    const duzeltKapat = () => $('#katmanDuzelt').classList.remove('acik');
    $('#btnDuzeltIptal').addEventListener('click', duzeltKapat);
    $('#btnDuzeltKapat').addEventListener('click', duzeltKapat);
    $('#btnDuzeltKaydet').addEventListener('click', duzeltKaydet);
    /* Telefonun geri düğmesi/kaydırması pencereyi kapatsın — kullanıcı
       içgüdüsel olarak onu deniyor ve tepki vermeyince sıkışmış hissediyor. */
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && $('#katmanDuzelt').classList.contains('acik')) duzeltKapat();
    });
    $('#btnDurakSil').addEventListener('click', async () => {
      if (!confirm('Bu durak silinsin mi?')) return;
      await D.durakSil(durum.gun, durum.duzeltilenId);
      $('#katmanDuzelt').classList.remove('acik');
      ciz();
    });
    ['dMahalle', 'dYol', 'dKapino', 'dIlce'].forEach((k) =>
      $('#' + k).addEventListener('change', duzeltDene));

    const orsKaydet = document.querySelector('#btnOrsKaydet');
    if (orsKaydet) orsKaydet.addEventListener('click', async () => {
      const v = (document.querySelector('#orsAnahtar').value || '').trim();
      if (v && !M.ors.anahtarGecerliMi(v)) { uyar('Bu anahtar geçerli görünmüyor — tamamını yapıştırdığından emin ol.'); return; }
      await D.ayarYaz('orsAnahtar', v || null);
      uyar(v ? 'Kaydedildi. Bundan sonraki rotalar gerçek yol süresiyle çıkacak.' : 'Kaldırıldı.');
      cizArsiv();
    });
    const orsSil = document.querySelector('#btnOrsSil');
    if (orsSil) orsSil.addEventListener('click', async () => {
      await D.ayarYaz('orsAnahtar', null);
      document.querySelector('#orsAnahtar').value = '';
      uyar('Kaldırıldı — kuş uçuşuna dönüldü.');
      cizArsiv();
    });

    const disaAktar = document.querySelector('#btnDisaAktar');
    if (disaAktar) disaAktar.addEventListener('click', () => gunuDisaAktar(false));
    const disaAktarHepsi = document.querySelector('#btnDisaAktarHepsi');
    if (disaAktarHepsi) disaAktarHepsi.addEventListener('click', () => gunuDisaAktar(true));

    /* Uygulamaya dönüldüğünde varış kontrolü — Google Maps'ten dönüş anı. */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) konumIste();
    });
  }

  /**
   * GÜN KAYDINI OKUNUR METNE ÇEVİRİR.
   *
   * Rota beklenmedik çıktığında sorunun nerede olduğunu ancak o günün
   * gerçek verisi gösteriyor: adres nereye çözülmüş, koordinat ne, rota
   * hangi noktadan başlamış, mesafeler ne. Telefondaki veriye başka türlü
   * bakılamıyor.
   *
   * AD VE TELEFON ÇIKARILMIYOR — dışarı verilen metinde müşteri kimliği
   * bulunmasın; sorunu çözmek için adres ve koordinat yetiyor.
   */
  async function gunuDisaAktar(hepsi) {
    const alan = $('#disaAktarAlan');
    const gunler = hepsi ? await D.gunler() : (durum.gun ? [durum.gun] : []);
    if (!gunler.length) { uyar('Aktarılacak gün yok.'); return; }

    const satir = [];
    satir.push('FATURA ROTA — GÜN KAYDI');
    satir.push('sürüm: ' + ((M && M.surum) || '?') +
               '   çıkarma: ' + new Date().toISOString());
    for (const g of gunler) {
      const liste = D.siraliDuraklar(g);
      const r = g.rota;
      const rotada = liste.filter((d) => d.sira != null).length;
      satir.push('');
      satir.push('═══ ' + g.tarih + '  (' + g.durum + ')  ' + liste.length + ' durak' +
        (r ? '  · rotada ' + rotada + (rotada < liste.length ? '  ⚠ ' + (liste.length - rotada) + ' DURAK ROTA DIŞI' : '') : ''));
      if (r) {
        satir.push('  rota: başlangıç ' + (r.baslangicLat != null
            ? r.baslangicLat.toFixed(5) + ',' + r.baslangicLng.toFixed(5) : 'YOK') +
          '  kaynak=' + (r.baslangicKaynak || '?') +
          (r.baslangicDogruluk ? ' ±' + Math.round(r.baslangicDogruluk) + 'm' : '') +
          '  mesafe=' + (r.matrisKaynak || '?') +
          '  yöntem=' + (r.yontem || '?') +
          '  toplam=' + (r.toplamMetre != null ? (r.toplamMetre / 1000).toFixed(1) + 'km' : '?') +
          '  zaman=' + (r.zaman || '?'));
      } else {
        satir.push('  rota: çıkarılmamış');
      }
      let onceki = r && r.baslangicLat != null ? { lat: r.baslangicLat, lng: r.baslangicLng } : null;
      for (const d of liste) {
        const km = (onceki && d.lat != null) ? (mesafeMetre(onceki, d) / 1000).toFixed(1) : '  —';
        satir.push(
          '  ' + String(d.sira ?? '·').padStart(3) + '. ' +
          String(km).padStart(5) + 'km  ' +
          (d.durum || '?').padEnd(9) +
          (d.lat != null ? d.lat.toFixed(5) + ',' + d.lng.toFixed(5) : 'koordinat yok').padEnd(20) + ' ' +
          String(d.guven ?? '').padStart(3) + ' ' + (d.renk || '').padEnd(8) +
          (d.keskinlik || '').padEnd(5) + ' p' + (d.parca || 1) +
          ' | ' +
          [d.ilce, d.mahalle, d.yol, d.kapino && 'no ' + d.kapino, d.daire && 'd' + d.daire]
            .filter(Boolean).join(' / '));
        if (d.lat != null) onceki = { lat: d.lat, lng: d.lng };
      }
    }
    const metin = satir.join('\n');
    alan.value = metin;
    alan.hidden = false;
    alan.select();
    try { await navigator.clipboard.writeText(metin); uyar('Panoya kopyalandı — yapıştırıp gönderebilirsin.'); }
    catch (_) { uyar('Aşağıdaki metni kopyalayıp gönder.'); }
  }

  /**
   * Fotoğraflar — OCR katmanı (js/ocr.js) üzerinden.
   *
   * Tek karede birden fazla sipariş olabiliyor (ölçüldü: bir fotoğrafta iki
   * ayrı Çıkış Belgesi, iki farklı adres). Metin belge numaralarından
   * bölünüp her parça ayrı durak olarak ekleniyor.
   */
  async function dosyalariIsle(dosyalar) {
    if (!dosyalar || !dosyalar.length) return;
    if (!window.Ocr) { uyar('Okuma katmanı yüklenemedi.'); return; }
    if (!dosyalariIsle._sayac) dosyalariIsle._sayac = 0;
    let yeniDurakEklendi = false;

    let sira = 0;
    for (const dosya of dosyalar) {
      sira++;
      const onek = dosyalar.length > 1 ? '(' + sira + '/' + dosyalar.length + ') ' : '';
      /* Tanı bilgisi — bir şey ters giderse ekranda görünsün. Telefonda
         hata ayıklama konsolu açmak mümkün değil; kullanıcının okuyup
         söyleyebileceği somut bilgi gerekiyor. */
      /* Kare bellekte tutuluyor: okuma tutmazsa sürücü adresin üstünü
         parmağıyla gösterip aynı fotoğrafı yeniden okutabilsin.
         Yalnız son birkaç kare saklanıyor — 50 fotoğraflık bir günde
         hepsini tutmak telefonun belleğini şişirir. */
      const kareId = 'k' + (++dosyalariIsle._sayac);
      bekleyenKareler.set(kareId, { dosya, ad: dosya.name || 'kare' });
      while (bekleyenKareler.size > 6) bekleyenKareler.delete(bekleyenKareler.keys().next().value);

      const okumaBilgisi = {
        kareId,
        dosya: (dosya.name || 'kare') + ' · ' + Math.round((dosya.size||0)/1024) + ' KB' +
               (dosya.type ? ' · ' + dosya.type : ''),
      };
      try {
        bilgiGoster(onek + 'Fotoğraf okunuyor…', true);
        /* Kademeli okumanın DURMA ÖLÇÜTÜ, motorun kendi güveni.
           Adres net çözüldüyse ikinci/üçüncü geçiş hiç çalışmıyor; yani iyi
           çekilmiş bir etiket fotoğrafı eskisiyle aynı hızda okunuyor.
           Ancak çözülemediğinde yakınlaştırma ve yön düzeltme devreye giriyor. */
        const okuma = await window.Ocr.oku(dosya, {
          yeter: 70,
          degerlendir: async (o) => {
            try {
              /* O ilçenin verisi henüz inmemişse çözüm 0 çıkar ve motor
                 boşuna kademe tırmanır. Önce veri indiriliyor. */
              await ilceleriHazirla([o.metin]);
              const p = M.metin.belgeleriAyir(o.metin);
              let en = 0;
              for (const parca of p) {
                const c = M.fatura.cozBelge(durum.kaynak, { serbest: parca, ocrKelimeler: o.kelimeler });
                if (c.guven > en) en = c.guven;
              }
              return en;
            } catch (_) { return 0; }
          },
          ilerleme: (durumAdi, oran) => {
            if (durumAdi === 'recognizing text') bilgiGoster(onek + 'Okunuyor… %' + Math.round(oran * 100), true);
            else if (/loading|initializing/i.test(durumAdi)) bilgiGoster('Okuma motoru ilk kez hazırlanıyor…', true);
          },
        });

        /* Boş sayfa / bulanık kare: motora sokmadan önce ele.
           Bu da kalıcı kartla bildiriliyor — sürücü bir şeyin olmadığını
           değil, NEDEN olmadığını görmeli. */
        if (!okuma.metin || okuma.metin.replace(/\s/g, '').length < 12) {
          hataKartiGoster(
            'Bu fotoğrafta yazı bulunamadı. Daha yakından, düz ve gölgesiz çekmeyi dene.',
            okumaBilgisi);
          continue;
        }

        const parcalar = M.metin.belgeleriAyir(okuma.metin);
        let kirmizi = 0;
        for (const parca of parcalar) {
          const s = await metniIsle(parca, { ocrKelimeler: okuma.kelimeler });
          if (s) { taramaSonucGoster(s, kareId); if (s.renk === 'kirmizi') kirmizi++; }
        }
        if (parcalar.length > 1) {
          bilgiGoster('Bu karede ' + parcalar.length + ' sipariş vardı, ayrı ayrı eklendi.');
        }
        if (!kirmizi) bekleyenKareler.delete(kareId);
        yeniDurakEklendi = true;
      } catch (e) {
        /* HATA KAYBOLMAMALI. Önce kaybolan bir bildirim kullanılıyordu ve
           sürücü ekrana bakmadığı an "hiçbir şey olmadı" sanıyordu — iPhone'da
           tam olarak bu yaşandı. Hata artık listenin başına kalıcı bir kart
           olarak yazılıyor. */
        hataKartiGoster(e.message, okumaBilgisi);
      }
    }
    bilgiGizle();

    /* OKUTMA BİTİNCE ROTAYI TAZELE.
       Ölçülen gerçek kayıtta rota 20:13'te 14 durakla çıkarılmış, sonra 6
       fatura daha okutulmuş ve o 6'sı rotaya HİÇ girmemişti. Sürücünün
       "Rotayı Yenile"ye basmasını beklemek yerine, henüz yola çıkılmadıysa
       kendiliğinden tazeleniyor. */
    if (yeniDurakEklendi) {
      try { await rotayiTazeleGerekirse(); } catch (_) { /* rota kalsın, okuma önemli */ }
      ciz();
    }
  }

  /* ══════════════════════════════════ adresi parmakla göster ═══ */

  /**
   * OKUNAMAYAN FOTOĞRAF İÇİN SON ÇARE — VE EN HIZLISI.
   *
   * Motor kendi başına yakınlaştırmayı deniyor (bkz. js/ocr.js kademeleri),
   * ama bazı belgelerde adresi işaret eden bir etiket hiç okunamıyor ve
   * nereye bakacağını bilemiyor. O noktada adresin nerede olduğunu bilen
   * tek kişi sürücü. Parmakla bir kutu çizmek 3 saniye; adresi elle yazmak
   * yarım dakika.
   *
   * Seçilen kutu, KAYNAK fotoğrafın piksellerinde hesaplanıp doğrudan
   * OCR'a veriliyor; küçük bir alan olduğu için 3-4 kat büyütülerek
   * okunuyor — yani asıl sorunu (çözünürlük) da çözüyor.
   */
  const bekleyenKareler = new Map();       // id → {dosya, ad}
  let kutuDurum = null;

  function kutuAc(kareId) {
    const kayit = bekleyenKareler.get(kareId);
    if (!kayit) { uyar('Bu fotoğraf artık bellekte yok, yeniden çek.'); return; }
    const tuval = $('#kutuTuval');
    const g = new Image();
    const url = URL.createObjectURL(kayit.dosya);
    g.onload = () => {
      kutuDurum = { kareId, img: g, url, derece: 0, secim: null };
      kutuCiz();
      $('#katmanKutu').classList.add('acik');
    };
    g.onerror = () => { URL.revokeObjectURL(url); uyar('Fotoğraf açılamadı.'); };
    g.src = url;
    void tuval;
  }

  /** Fotoğrafı sahneye sığdırarak çizer; ölçek bilgisi saklanıyor. */
  function kutuCiz() {
    const s = kutuDurum;
    if (!s) return;
    const sahne = $('#kutuSahne');
    const tuval = $('#kutuTuval');
    const d = ((s.derece % 360) + 360) % 360;
    const kaynakG = (d === 90 || d === 270) ? s.img.naturalHeight : s.img.naturalWidth;
    const kaynakY = (d === 90 || d === 270) ? s.img.naturalWidth : s.img.naturalHeight;
    const alanG = Math.max(80, sahne.clientWidth), alanY = Math.max(80, sahne.clientHeight);
    const olcek = Math.min(alanG / kaynakG, alanY / kaynakY);
    tuval.width = Math.round(kaynakG * olcek);
    tuval.height = Math.round(kaynakY * olcek);
    const c = tuval.getContext('2d');
    c.fillStyle = '#fff';
    c.fillRect(0, 0, tuval.width, tuval.height);
    c.save();
    c.translate(tuval.width / 2, tuval.height / 2);
    if (d) c.rotate((d * Math.PI) / 180);
    const cg = (d === 90 || d === 270) ? tuval.height : tuval.width;
    const cy = (d === 90 || d === 270) ? tuval.width : tuval.height;
    c.drawImage(s.img, -cg / 2, -cy / 2, cg, cy);
    c.restore();
    s.olcek = olcek;
    s.secim = null;
    $('#kutuSecim').hidden = true;
  }

  function kutuKapat() {
    $('#katmanKutu').classList.remove('acik');
    if (kutuDurum && kutuDurum.url) URL.revokeObjectURL(kutuDurum.url);
    kutuDurum = null;
  }

  function kutuOlaylari() {
    const sahne = $('#kutuSahne');
    const kutu = $('#kutuSecim');
    if (!sahne) return;
    let bas = null;

    const yerel = (olay) => {
      const t = $('#kutuTuval').getBoundingClientRect();
      return {
        x: Math.min(Math.max(olay.clientX - t.left, 0), t.width),
        y: Math.min(Math.max(olay.clientY - t.top, 0), t.height),
        sol: t.left - sahne.getBoundingClientRect().left,
        ust: t.top - sahne.getBoundingClientRect().top,
      };
    };
    const goster = (a, b) => {
      const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
      const g = Math.abs(a.x - b.x), yk = Math.abs(a.y - b.y);
      kutu.hidden = false;
      kutu.style.left = (a.sol + x) + 'px';
      kutu.style.top = (a.ust + y) + 'px';
      kutu.style.width = g + 'px';
      kutu.style.height = yk + 'px';
      return { x, y, g, yk };
    };

    sahne.addEventListener('pointerdown', (e) => {
      if (!kutuDurum) return;
      bas = yerel(e);
      sahne.setPointerCapture(e.pointerId);
      goster(bas, bas);
    });
    sahne.addEventListener('pointermove', (e) => {
      if (!bas || !kutuDurum) return;
      kutuDurum.secim = goster(bas, yerel(e));
    });
    const bitir = () => { bas = null; };
    sahne.addEventListener('pointerup', bitir);
    sahne.addEventListener('pointercancel', bitir);

    $('#btnKutuKapat').addEventListener('click', kutuKapat);
    $('#btnKutuIptal').addEventListener('click', kutuKapat);
    $('#btnKutuDondur').addEventListener('click', () => {
      if (!kutuDurum) return;
      kutuDurum.derece = (kutuDurum.derece + 90) % 360;
      kutuCiz();
    });
    $('#btnKutuOku').addEventListener('click', kutuyuOku);
  }

  async function kutuyuOku() {
    const s = kutuDurum;
    if (!s) return;
    if (!s.secim || s.secim.g < 20 || s.secim.yk < 12) {
      uyar('Önce adresin üstünü parmağınla kutu içine al.');
      return;
    }
    const kayit = bekleyenKareler.get(s.kareId);
    const derece = s.derece;
    /* Ekran pikselinden ÇERÇEVE (döndürülmüş kaynak) pikseline. */
    const kirp = {
      x0: s.secim.x / s.olcek, y0: s.secim.y / s.olcek,
      x1: (s.secim.x + s.secim.g) / s.olcek, y1: (s.secim.y + s.secim.yk) / s.olcek,
    };
    kutuKapat();
    try {
      bilgiGoster('Seçtiğin yer okunuyor…', true);
      const okuma = await window.Ocr.oku(kayit.dosya, { kirp, derece });
      if (!okuma.metin || okuma.metin.replace(/\s/g, '').length < 6) {
        hataKartiGoster('Seçtiğin yerde yazı okunamadı. Biraz daha geniş bir alan seç ya da fotoğrafı yakından tekrar çek.', { dosya: kayit.ad });
        return;
      }
      const parcalar = M.metin.belgeleriAyir(okuma.metin);
      let eklendi = 0;
      for (const p of parcalar) {
        const r = await metniIsle(p, { ocrKelimeler: okuma.kelimeler });
        if (r) { taramaSonucGoster(r); eklendi++; }
      }
      if (!eklendi) hataKartiGoster('Seçtiğin yerde adres bulunamadı.', { dosya: kayit.ad });
      else bekleyenKareler.delete(s.kareId);
    } catch (e) {
      hataKartiGoster(e.message, { dosya: kayit.ad });
    } finally {
      bilgiGizle();
    }
  }

  /**
   * KALICI HATA KARTI. Kaybolan bildirim yerine listede duruyor; sürücü
   * ne olduğunu okuyabiliyor, gerekirse ekran görüntüsüyle iletebiliyor.
   */
  function hataKartiGoster(mesaj, bilgi) {
    const alan = $('#taramaSonuc');
    if (!alan) { uyar(mesaj); return; }
    const kart = document.createElement('div');
    kart.className = 'kart kirmizi';
    const rozet = bilgi && bilgi.dosya
      ? '<span class="rozet">' + kacis(bilgi.dosya) + '</span>' : '';
    /* Fotoğrafın kendisi hâlâ elimizdeyse sürücüye "adresi göster" yolu
       açılıyor — elle adres yazmaktan çok daha hızlı. */
    const kutuDugmesi = bilgi && bilgi.kareId && bekleyenKareler.has(bilgi.kareId)
      ? '<button class="dugme kucuk birincil" data-kutu="' + bilgi.kareId + '">📐 Adresi göster</button>' : '';
    kart.innerHTML =
      '<div class="sira">!</div>' +
      '<div class="govde">' +
        '<div class="ad">Fotoğraf okunamadı</div>' +
        '<div class="adres">' + kacis(mesaj) + '</div>' +
        '<div class="alt">' + rozet + kutuDugmesi +
          '<button class="dugme kucuk" data-kapat="1">Kapat</button>' +
        '</div>' +
      '</div>';
    kart.querySelector('[data-kapat]').addEventListener('click', () => kart.remove());
    const kd = kart.querySelector('[data-kutu]');
    if (kd) kd.addEventListener('click', () => kutuAc(kd.dataset.kutu));
    alan.prepend(kart);
    sayfaGoster('tara');
  }

  /* ------------------------------------------------------------ bilgi */

  let bilgiZaman = null;
  function bilgiGoster(yazi, kalici) {
    let e = $('#bilgiCubuk');
    if (!e) {
      e = document.createElement('div');
      e.id = 'bilgiCubuk';
      e.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(64px + 76px);z-index:40;' +
        'background:#0f1419;color:#fff;padding:12px 14px;border-radius:12px;font-size:14px;text-align:center';
      document.body.appendChild(e);
    }
    e.textContent = yazi;
    e.style.display = 'block';
    clearTimeout(bilgiZaman);
    bilgiZaman = setTimeout(bilgiGizle, 3000);
  }
  function bilgiGizle() { const e = $('#bilgiCubuk'); if (e) e.style.display = 'none'; }
  function uyar(y) { bilgiGoster(y); }

  /* Hizmet çalışanı — çevrimdışı çalışma. */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  basla().catch((e) => {
    $('#yuklemeMetin').textContent = 'Açılış hatası: ' + e.message;
    console.error(e);
  });
})();
