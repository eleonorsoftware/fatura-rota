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

    const safariMi = !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent);
    const k = document.createElement('div');
    k.className = 'uyari';
    k.style.cssText = 'margin:0 0 10px;display:block;background:#dbeafe;color:#1e40af';
    k.innerHTML = safariMi
      ? '<b>📲 Ana ekrana ekle</b><br>Alttaki <b>Paylaş</b> düğmesine bas → listeyi ' +
        '<b>aşağı kaydır</b> → <b>Ana Ekrana Ekle</b>. (Menünün altlarında, kaydırmadan görünmez.)' +
        '<br><button class="dugme kucuk" data-ipucu-kapat="1" style="margin-top:8px">Anladım</button>'
      : '<b>📲 Safari ile aç</b><br>Ana ekrana ekleme yalnız <b>Safari</b>\'de var. ' +
        'Bu adresi Safari\'de açıp Paylaş → Ana Ekrana Ekle yap.' +
        '<br><button class="dugme kucuk" data-ipucu-kapat="1" style="margin-top:8px">Anladım</button>';
    k.querySelector('[data-ipucu-kapat]').addEventListener('click', () => {
      try { localStorage.setItem('kurulumIpucuKapandi', '1'); } catch (_) {}
      k.remove();
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

  async function rotaOlustur() {
    const bekleyen = D.siraliDuraklar(durum.gun).filter((d) => d.durum === 'bekliyor');
    const koordinatli = bekleyen.filter((d) => d.lat != null);
    const koordinatsiz = bekleyen.length - koordinatli.length;

    if (!koordinatli.length) { uyar('Rotaya girecek adres yok.'); return; }
    if (koordinatsiz) {
      if (!confirm(`${koordinatsiz} adres okunamadı, rotaya giremeyecek.\nYine de rotayı çıkarayım mı?`)) return;
    }
    const supheli = koordinatli.filter((d) => d.renk !== 'yesil').length;
    if (supheli && !confirm(`${supheli} adres kontrol bekliyor.\nYine de rotayı çıkarayım mı?`)) return;

    const baslangic = durum.konum || { lat: koordinatli[0].lat, lng: koordinatli[0].lng };
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
        bilgiGoster('Gerçek yol süreleri alınıyor…', true);
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
      toplamMetre: r.toplamMetre, toplamDakika: r.toplamDakika,
    });
    sayfaGoster('bugun');
    ciz();
  }

  /* ═══════════════════════════════════════════════════════ konum ═══ */

  function konumIste() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => { durum.konum = { lat: p.coords.latitude, lng: p.coords.longitude }; varisKontrol(); },
      () => {},
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
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
          </div>
        </div>
      </div>`).join('');
  }

  function cizYuzen(o) {
    const alan = $('#yuzenAlan');
    const gosterilecek = durum.sayfa === 'bugun' && o.toplam > 0;
    $('#sayfa-bugun').classList.toggle('yuzenli', gosterilecek);
    if (!gosterilecek) { alan.innerHTML = ''; return; }
    const varRota = !!durum.gun.rota;
    const kalan = o.bekleyen;
    if (varRota && !kalan) {
      alan.innerHTML = `<button class="dugme yesil" data-eylem="gunKapat">🏁 Günü Kapat</button>`;
    } else {
      alan.innerHTML = `<button class="dugme birincil" data-eylem="rota">
        ${varRota ? '🔄 Rotayı Yenile' : '🧭 Rotayı Oluştur'} · ${kalan} durak</button>`;
    }
  }

  function adresYaz(d) {
    const p = [d.mahalle && d.mahalle + ' Mh.', d.yol, d.kapino && 'No ' + d.kapino,
               d.daire && 'D:' + d.daire, d.ilce].filter(Boolean);
    return p.length ? p.join(' · ') : 'Adres okunamadı';
  }

  function tarihYaz(t) {
    const [y, a, g] = t.split('-');
    const aylar = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz',
                   'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    return `${parseInt(g, 10)} ${aylar[parseInt(a, 10) - 1]}`;
  }

  /* ═══════════════════════════════════════════════════════ tarama ekranı */

  function taramaSonucGoster(sonuc) {
    const d = sonuc.durak;
    const alan = $('#taramaSonuc');
    const kart = document.createElement('div');
    kart.className = `kart ${d.renk}`;
    kart.innerHTML = `
      <div class="sira">${sonuc.birlestirildi ? '↩' : '+'}</div>
      <div class="govde">
        <div class="ad">${kacis(d.ad || 'İsimsiz')}</div>
        <div class="adres">${kacis(adresYaz(d))}</div>
        <div class="alt">
          ${sonuc.birlestirildi ? '<span class="rozet">aynı belge — birleştirildi</span>'
                               : '<span class="rozet yesil">yeni durak</span>'}
          ${d.renk !== 'yesil' ? `<span class="rozet ${d.renk}">${d.renk === 'kirmizi' ? 'okunamadı' : 'kontrol et'}</span>` : ''}
          <button class="dugme kucuk" data-eylem="duzelt" data-id="${d.id}">Düzelt</button>
        </div>
      </div>`;
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
        case 'gunKapat':
          if (confirm('Günü kapatayım mı? Yarın liste boş başlayacak.')) {
            await D.gunKapat(durum.gun.tarih);
            durum.gun = await D.gunAc();
            ciz();
          }
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

    $('#btnDuzeltIptal').addEventListener('click', () => $('#katmanDuzelt').classList.remove('acik'));
    $('#btnDuzeltKaydet').addEventListener('click', duzeltKaydet);
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

    /* Uygulamaya dönüldüğünde varış kontrolü — Google Maps'ten dönüş anı. */
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) konumIste();
    });
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

    let sira = 0;
    for (const dosya of dosyalar) {
      sira++;
      const onek = dosyalar.length > 1 ? '(' + sira + '/' + dosyalar.length + ') ' : '';
      /* Tanı bilgisi — bir şey ters giderse ekranda görünsün. Telefonda
         hata ayıklama konsolu açmak mümkün değil; kullanıcının okuyup
         söyleyebileceği somut bilgi gerekiyor. */
      const okumaBilgisi = {
        dosya: (dosya.name || 'kare') + ' · ' + Math.round((dosya.size||0)/1024) + ' KB' +
               (dosya.type ? ' · ' + dosya.type : ''),
      };
      try {
        bilgiGoster(onek + 'Fotoğraf okunuyor…', true);
        const okuma = await window.Ocr.oku(dosya, (durumAdi, oran) => {
          if (durumAdi === 'recognizing text') bilgiGoster(onek + 'Okunuyor… %' + Math.round(oran * 100), true);
          else if (/loading|initializing/i.test(durumAdi)) bilgiGoster('Okuma motoru ilk kez hazırlanıyor…', true);
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
        for (const parca of parcalar) {
          const s = await metniIsle(parca, { ocrKelimeler: okuma.kelimeler });
          if (s) taramaSonucGoster(s);
        }
        if (parcalar.length > 1) {
          bilgiGoster('Bu karede ' + parcalar.length + ' sipariş vardı, ayrı ayrı eklendi.');
        }
      } catch (e) {
        /* HATA KAYBOLMAMALI. Önce kaybolan bir bildirim kullanılıyordu ve
           sürücü ekrana bakmadığı an "hiçbir şey olmadı" sanıyordu — iPhone'da
           tam olarak bu yaşandı. Hata artık listenin başına kalıcı bir kart
           olarak yazılıyor. */
        hataKartiGoster(e.message, okumaBilgisi);
      }
    }
    bilgiGizle();
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
    kart.innerHTML =
      '<div class="sira">!</div>' +
      '<div class="govde">' +
        '<div class="ad">Fotoğraf okunamadı</div>' +
        '<div class="adres">' + kacis(mesaj) + '</div>' +
        '<div class="alt">' + rozet +
          '<button class="dugme kucuk" data-kapat="1">Kapat</button>' +
        '</div>' +
      '</div>';
    kart.querySelector('[data-kapat]').addEventListener('click', () => kart.remove());
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
