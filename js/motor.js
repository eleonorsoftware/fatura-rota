/* ÜRETİLMİŞ DOSYA — elle düzenleme. Kaynak: lib/*.js
   Yeniden üretmek için:  node veri/web-derle.js
   Üretim zamanı sürüm damgası aşağıda; tarayıcı önbelleğini tazelemek için
   index.html'de sorgu dizgesi olarak kullanılıyor. */
(function (global) {
  'use strict';
  var kayit = {};
  var onbellek = {};

  function require(ad) {
    ad = ad.replace(/^\.\//, './');
    if (onbellek[ad]) return onbellek[ad].exports;
    var yapici = kayit[ad];
    if (!yapici) throw new Error('Modül bulunamadı: ' + ad);
    var modul = { exports: {} };
    onbellek[ad] = modul;
    yapici(modul, modul.exports, require);
    return modul.exports;
  }

  kayit['./metin'] = function (module, exports, require) {
'use strict';
/**
 * METİNDEN ADRES BİLEŞENLERİNİ ÇIKARIR
 * ====================================
 *
 * Girdi: kameradan okunmuş ham fatura metni.
 * Çıktı: { ilce, mahalle, yol, kapino, daire, kat, apartman }
 *
 * Bu dosya HİÇBİR ŞEYİ DOĞRULAMAZ — sadece metni parçalarına ayırır.
 * "Bu mahalle gerçekten var mı, o sokak nerede" sorusu adres.js'in işi.
 *
 * NEDEN İKİ AYRI ÇIKARICI VAR
 * ---------------------------
 * Sürücünün eline iki farklı belge geçiyor (ölçüldü, 6 gerçek örnek):
 *
 * 1) TESLİMAT ETİKETİ — satış belgesinin üstüne yapıştırılan sticker.
 *    Alanlar etiketli ve sabit:
 *      İl/İlçe:      Denizli / Merkezefendi
 *      Semt/Mahalle: Sırakapılar Mh.
 *      Alıcı Adres:  saltak cd., no: 92, daire: 1
 *    Burada hangi bilginin ne olduğunu BİLİYORUZ. Tahmin etmeye gerek yok.
 *
 * 2) e-İRSALİYE — adres tek parça serbest metin, sırası da değişken:
 *      "Zümrüt Mh. Vatan Blv. No:174A PK: 20160 Pamukkale Denizli"
 *      "Sena Apartmanı, Kuşpınar Mh. İnönüCd. No:96 Daire:1 PK: 20150 Pamukkale Denizli"
 *      "Yunusemre Mh.Yunus emre cadesi Apt: 7 D: 14 K: 3"
 *    Burada neyin ne olduğunu ekinden ("Mh.", "Cd.", "No:") anlamak zorundayız.
 *
 * GERÇEK DÜNYADAN GELEN ÜÇ TUZAK (örneklerde bizzat görüldü)
 * ----------------------------------------------------------
 * a) EK YAPIŞIK YAZILIYOR: "Mh.Yunus", "İnönüCd." — boşluk yok. Ayırmadan
 *    "inonucd" diye bir sokak arar ve bulamayız.
 * b) KAYNAKTA YAZIM HATASI VAR: "Yunus emre cadesi" (caddesi değil). OCR hatası
 *    değil, faturanın kendisinde böyle yazıyor. Eşleştirme buna dayanıklı olmalı.
 * c) İLÇE ADI HER YERDE OLABİLİR: bazen "Denizli / Pamukkale", bazen
 *    "20160 Pamukkale Denizli", bazen "PAMUKKALE / DENİZLİ".
 */

/**
 * Türkçe harfleri sadeleştirir ve noktalama atar.
 * Taksi projesindeki `sade()` ile BİREBİR AYNI olmalı — adres veritabanındaki
 * `ad_ara` / `kapino_ara` sütunları o fonksiyonla üretildi. Farklı davranırsa
 * hiçbir şey eşleşmez.
 *
 *   "Sırakapılar Mh."  ->  "sirakapilar mh"
 *   "İNÖNÜ."           ->  "inonu"
 *   "2031/9. sk."      ->  "2031 9 sk"
 */
function sade(s) {
  return String(s == null ? '' : s)
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
    .replace(/Ş/g, 's').replace(/ş/g, 's')
    .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
    .replace(/Ü/g, 'u').replace(/ü/g, 'u')
    .replace(/Ö/g, 'o').replace(/ö/g, 'o')
    .replace(/Ç/g, 'c').replace(/ç/g, 'c')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/* Adres ekleri — sadeleştirilmiş hâlleriyle, tür bazında gruplu. */
const EK = {
  mahalle: ['mahallesi', 'mahalle', 'mah', 'mh'],
  yol: ['caddesi', 'cadde', 'cad', 'cd', 'sokagi', 'sokak', 'sok', 'sk',
        'bulvari', 'bulvar', 'bulv', 'blv', 'cikmazi', 'cikmaz', 'yolu'],
  bina: ['apartmani', 'apartman', 'apt', 'sitesi', 'site', 'blok', 'bina'],
  numara: ['numara', 'no', 'nu'],
  daire: ['daire', 'dair', 'dr', 'd'],
  kat: ['kat', 'k'],
};
const TUM_EKLER = [...EK.mahalle, ...EK.yol, ...EK.bina, ...EK.numara, ...EK.daire, ...EK.kat];

/**
 * GÖNDERİCİ ADRESLERİ — asla teslimat adresi sanılmamalı.
 *
 * Tam sayfa okutulduğunda belgenin üstünde Media Markt'ın KENDİ adresleri
 * duruyor ve bunlar gerçek Denizli adresleri:
 *
 *   T034 Teraspark        : "TERAS PARK AVM 55. SOKAK, 20125 YENİŞEHİR – DENİZLİ"
 *   T217 Garden Horizon   : "SÜMER MAH. ÇAL CADDESİ, 20020 MERKEZEFENDİ / DENİZLİ"
 *   Genel merkez          : "YEŞİLCE MAH. ESKİ BÜYÜKDERE CAD. NO:65, KAĞITHANE / İSTANBUL"
 *
 * YENİŞEHİR ve SÜMER Denizli'de gerçekten var, ÇAL CADDESİ de öyle. Yani
 * gazetteer bunları memnuniyetle çözer ve sürücüyü mağazanın kapısına
 * gönderir. Genel merkez adresi İstanbul'da olduğu için zaten gazetteer'a
 * takılmıyor, ama Denizli mağazaları takılmıyor — elle elenmeleri gerek.
 *
 * Eşleşme mahalle+yol ikilisi üzerinden yapılıyor; kapı numarası değişse de
 * yakalansın diye.
 */
const GONDERICI_ADRESLERI = [
  { mahalle: 'yenisehir', yol: '55' },          // T034 Teraspark
  { mahalle: 'sumer', yol: 'cal' },             // T217 Garden Horizon
  { mahalle: 'yesilce', yol: 'eski buyukdere' },// genel merkez (İstanbul)
];

/** Gönderici/mağaza adresi mi? */
function gondericiAdresiMi(mahalle, yol) {
  if (!mahalle || !yol) return false;
  const m = sade(mahalle), y = sade(yol);
  return GONDERICI_ADRESLERI.some((g) => m === g.mahalle && (y === g.yol || y.startsWith(g.yol + ' ')));
}

/* Adres olmayan ama metinde geçen gürültü — atılır. */
const GURULTU = ['pk', 'posta', 'kodu', 'tel', 'telefon', 'gsm', 'cep', 'tr', 'turkiye',
                 'vergi', 'dairesi', 'vkn', 'tckn', 'musterino', 'sayin',
                 /* Ünvan sözcükleri: e-İrsaliyede adresin hemen solunda firma
                    ünvanı duruyor ("… San tic ltd şti Zümrüt Mh.") ve mahalle
                    adı geriye doğru yürürken bunları da yutuyordu. */
                 'ltd', 'sti', 'sirketi', 'sirket', 'limited', 'anonim',
                 'tic', 'ticaret', 'san', 'sanayi', 'as', 'kolektif',
                 /* FORM ETİKETLERİ. Tam sayfa okutulduğunda alan adları da
                    metne giriyor: "Semt/Mahalle: Karaman Mh." satırında
                    ayıklayıcı, etiketteki "Mahalle" sözcüğünü adres eki sanıp
                    solundaki "Semt"i mahalle adı zannediyordu. Bunlar sınır
                    sayılırsa hem yanlış ad üretilmiyor hem de geriye yürüyüş
                    doğru yerde duruyor.
                    DİKKAT: buraya gerçek mahalle/sokak adı olabilecek sözcük
                    EKLEME — "yeni", "merkez", "cumhuriyet" gerçek adlardır. */
                 'semt', 'alici', 'adres', 'adresi', 'ilce', 'cikis',
                 'magazasi', 'magaza', 'belgesi', 'belge', 'urun', 'urunu',
                 'teslimat', 'zamani', 'musteri', 'fatura', 'tarih', 'tarihi',
                 'eposta', 'faks', 'genel', 'toplam', 'poz', 'miktar',
                 'grub', 'kapora', 'nakitsatis', 'subeno', 'ettn', 'irsaliye',
                 'siparis', 'senaryo', 'ozellestirme', 'aciklamalar',
                 'tasiyici', 'bilgileri', 'not', 'randevu', 'saati'];

/**
 * Yapışık yazılmış ekleri ayırır: "inonucd" -> "inonu cd".
 * Ekten önce en az 3 harf olacak — "mahmutlar" gibi masum sözcükler bölünmesin.
 */
/* Yalnız MAHALLE, YOL ve BİNA ekleri yapışıkken bölünür. "no"/"nu"/"d"/"k"
   bölünmez — ölçüldü: "inonucd" önce doğru biçimde "inonu cd" oluyordu, ama
   sonraki turda "nu" eki devreye girip "ino nu cd" yapıyordu. Numara ekleri
   metinde zaten noktalamayla ayrık geliyor ("No:96"), bölmeye gerek yok. */
const YAPISIK_BOLUNEBILIR = [...EK.mahalle, ...EK.yol, ...EK.bina]
  .filter((e) => e.length >= 2)
  .sort((a, b) => b.length - a.length);     // uzun ek önce denensin: "caddesi" > "cad" > "cd"

function ayirEkler(sadeMetin) {
  /* TEK GEÇİŞ: her sözcük en fazla bir kez bölünür ve bölünen parça yeniden
     taranmaz. Yoksa yukarıdaki zincirleme bölünme geri gelir. */
  return sadeMetin.split(' ').map((kelime) => {
    if (kelime.length < 5) return kelime;    // "cd" tek başınaysa dokunma
    for (const ek of YAPISIK_BOLUNEBILIR) {
      if (kelime.length > ek.length + 2 && kelime.endsWith(ek)) {
        return kelime.slice(0, -ek.length) + ' ' + ek;
      }
    }
    return kelime;
  }).join(' ').replace(/\s+/g, ' ').trim();
}

/* --------------------------------------------------- bulanık ek tanıma */

/** Levenshtein — kısa ek sözcükleri için yeterli. */
function _uzaklik(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let onceki = Array.from({ length: n + 1 }, (_, i) => i);
  const simdi = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    simdi[0] = i;
    for (let j = 1; j <= n; j++) {
      simdi[j] = Math.min(simdi[j - 1] + 1, onceki[j] + 1, onceki[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    onceki = simdi.slice();
  }
  return onceki[n];
}

/**
 * Bir sözcüğün verilen ek kümesinden biri olup olmadığına karar verir.
 *
 * Neden birebir karşılaştırma yetmiyor: faturanın KENDİSİNDE yazım hatası
 * olabiliyor. Ölçüldü — bir e-İrsaliyede "Yunus emre CADESİ" yazıyor
 * (caddesi değil). OCR de harf yiyecek. Bu yüzden 4 harften uzun eklerde
 * %80 benzerlik kabul ediliyor; kısa eklerde ("cd", "sk") birebir aranıyor,
 * çünkü orada tek harf oynaması bambaşka bir sözcük demektir.
 */
function ekMi(kelime, ekListesi) {
  if (!kelime || /^\d+$/.test(kelime)) return false;
  if (ekListesi.includes(kelime)) return true;
  if (kelime.length < 4) return false;
  for (const ek of ekListesi) {
    if (ek.length < 4) continue;
    if (1 - _uzaklik(kelime, ek) / Math.max(kelime.length, ek.length) >= 0.8) return true;
  }
  return false;
}

/** Ekleri ve gürültüyü atıp geriye sadece adın kendisini bırakır. */
function adiSadelestir(s) {
  const atilacak = new Set([...TUM_EKLER, ...GURULTU]);
  return sade(s).split(' ').filter((k) => k && !atilacak.has(k)).join(' ').trim();
}

/**
 * "Denizli / Merkezefendi", "20160 Pamukkale Denizli", "PAMUKKALE / DENİZLİ"
 * gibi metinlerden ilçe adını ayıklar.
 *
 * Bilinen 19 ilçe adı verilir ve metinde geçen aranır — "Denizli" il adı
 * olduğu için elenir. Tahmin yürütmez; listede yoksa null döner.
 */
function ilceBul(metin, ilceAdlari) {
  if (!metin || !ilceAdlari || !ilceAdlari.length) return null;
  const s = ' ' + sade(metin) + ' ';
  /* Uzun adlar önce denenir: "MERKEZEFENDİ" aranırken "MERKEZ" diye bir ilçe
     olsaydı yanlış eşleşmesin. */
  const sirali = [...ilceAdlari].sort((a, b) => sade(b).length - sade(a).length);
  for (const ad of sirali) {
    if (s.includes(' ' + sade(ad) + ' ')) return ad;
  }
  return null;
}

/**
 * Metinden kapı numarasını çeker: "No:174A", "no: 92", "NO16", "no: 1/1", "No 1/H"
 *
 * DİKKAT — bu regex bir kez yanlış yazıldı ve üç belgede birden hata verdi:
 * numaradan SONRA boşluk geçmesine izin verilirse sonraki sözcük de yutuluyor.
 *   "NO16 1"        -> "161"     (doğrusu 16)
 *   "NO92 K5"       -> "92K5"    (doğrusu 92)
 *   "No:96 Daire:1" -> "96Dair"  (doğrusu 96)
 * Bu yüzden numaradan sonra YALNIZCA şunlara izin var: bitişik tek harf
 * ("174A"), ya da bölü/tire ile ayrılmış ikinci parça ("1/1", "1/H", "13-2").
 */
function kapiNoBul(metin) {
  if (!metin) return null;
  const m = String(metin).match(
    /\b(?:no|nu|numara)\s*[:.]?\s*(\d{1,5}(?:\s*[\/-]\s*\d{1,4}[a-zA-ZçğıöşüÇĞİÖŞÜ]?|[a-zA-ZçğıöşüÇĞİÖŞÜ])?)/i
  );
  if (!m) return null;
  return m[1].replace(/\s+/g, '').trim() || null;
}

/**
 * Kapı numarası ADAYLARI.
 *
 * e-İrsaliyelerin çoğunda "No:" HİÇ YOK; onun yerine "Apt: 14 D: 14" yazıyor.
 * Türkiye'de apartman numarası pratikte kapı numarasıdır, o yüzden "Apt"
 * değeri de aday olarak denenir — ama "No:" varsa o önce gelir.
 */
/**
 * GÖNDERİCİ SATIRLARI — bu satırlardaki kapı numarası teslimat adresi değil.
 *
 * Ölçüldü: tam sayfa okutulduğunda belgenin başındaki "YEŞİLCE MAH. ESKİ
 * BÜYÜKDERE CAD. NO:65" satırı yüzünden kapı numarası 65 olarak alınıyordu.
 * 65 numara müşterinin mahallesinde gerçekten var olduğu için motor %72
 * güvenle YEŞİL diyor ve sürücüyü sessizce yanlış eve gönderiyordu —
 * bulunabilecek en tehlikeli hata türü.
 *
 * Mahalle+yol kara listesi bunu yakalayamıyor, çünkü buradan sızan tek şey
 * NUMARA. O yüzden satır bazında eleniyor.
 */
const GONDERICI_SATIR = /media\s*markt|kağıthane|kagithane|i̇stanbul|istanbul|büyükdere|buyukdere|teras\s*park|marmara\s*kurumlar|chamber\s*of\s*commerce|ticaret\s*sicil/i;

function kapiNoAdaylari(metin) {
  if (!metin) return [];
  /* Gönderici satırları baştan atılıyor. Satır satır bakılıyor çünkü
     gönderici bilgisi belgenin başında kendi satırlarında duruyor. */
  metin = String(metin).split(/\r?\n/).filter((s) => !GONDERICI_SATIR.test(s)).join('\n');
  const a = [];
  const ekle = (v) => {
    if (!v) return;
    const t = String(v).replace(/\s+/g, '').trim();
    /* POSTA KODU KAPI NUMARASI DEĞİLDİR. Tam sayfa okutulduğunda sayfadaki
       ilk "NO:" mağazanın adres satırı oluyor ve hemen ardından posta kodu
       geliyor ("55. SOKAK NO: / 20125 YENİSEHİR"). Denizli posta kodları
       20xxx; gerçek kapı numaraları bu aralıkta olmaz. */
    if (/^20\d{3}$/.test(t)) return;
    if (/^\d{5,}$/.test(t)) return;
    if (!a.includes(t)) a.push(t);
  };

  /* Metindeki TÜM "no:" geçişleri toplanır, ilkinde durulmaz. */
  const re = /\b(?:no|nu|numara)\s*[:.]?\s*(\d{1,5}(?:\s*[\/-]\s*\d{1,4}[a-zA-ZçğıöşüÇĞİÖŞÜ]?|[a-zA-ZçğıöşüÇĞİÖŞÜ])?)/gi;
  let m;
  while ((m = re.exec(String(metin))) !== null) { ekle(m[1]); if (a.length >= 6) break; }

  /* e-İrsaliyelerin çoğunda "No:" HİÇ YOK; onun yerine "Apt: 14 D: 14" yazıyor.
     Türkiye'de apartman numarası pratikte kapı numarasıdır — ama tahmin
     olduğu için "No:" değerlerinden SONRA sıraya giriyor. */
  const aptRe = /\b(?:apt|apartmani|apartman|bina|blok)\s*[:.]?\s*(\d{1,4}[a-zA-Z]?)/gi;
  while ((m = aptRe.exec(String(metin))) !== null) { ekle(m[1]); if (a.length >= 8) break; }
  return a;
}

/** "Daire:1", "D: 14", "d:7" */
function daireBul(metin) {
  if (!metin) return null;
  const m = String(metin).match(/\b(?:daire|dair|d)\s*[:.]\s*([0-9]{1,4}[a-zA-Z]?)/i);
  return m ? m[1] : null;
}

/** "K: 3", "Kat:5", "K5" */
function katBul(metin) {
  if (!metin) return null;
  const m = String(metin).match(/\b(?:kat|k)\s*[:.]?\s*([0-9]{1,2})\b/i);
  return m ? m[1] : null;
}

/**
 * Serbest metinden yol adını çeker.
 *
 * Yöntem: bir yol ekini ("cd", "sk", "blv"…) bul, ONDAN ÖNCEKİ sözcükleri al.
 * Nereden başlayacağını da bilmemiz gerekiyor; sol sınır şunlardan biri:
 * mahalle ekinin bittiği yer, bir bina eki, virgül karşılığı, ya da metnin başı.
 *
 *   "kuspinar mh inonu cd no 96"  ->  yol ekini ("cd") bul,
 *                                     solda "mh" var -> arası "inonu"
 */
/**
 * Bir ekin SOLUNDAKİ sözcüklerden aday adlar üretir — 1, 2, 3 … sözcüklük.
 *
 * NEDEN TEK ADAY YETMİYOR: e-İrsaliyede müşteri adı, adresin hemen solunda
 * duruyor ve nerede bittiğini metinden anlamak mümkün değil:
 *   "HURİYE TURHAL Akpınar Mh."  ->  mahalle "huriye turhal akpinar" mı,
 *                                    "turhal akpinar" mı, "akpinar" mı?
 * Ölçüldü: 12 belgenin 6'sı tam bu yüzden çözülemedi.
 *
 * Karar vermeye çalışmıyoruz. Hepsini aday olarak üretip gazetteer'a
 * soruyoruz — gerçekte var olan hangisiyse o kazanıyor. Kısa aday önce
 * geliyor, çünkü mahalle adları çoğunlukla tek sözcük.
 */
function adaylarUret(kelimeler, ekIndeks, enFazla, solSinir) {
  const adaylar = [];
  for (let n = 1; n <= enFazla; n++) {
    const bas = ekIndeks - n;
    if (bas < 0) break;
    if (solSinir.has(kelimeler[bas])) break;        // sınıra çarptık, daha geriye gitme
    const ad = kelimeler.slice(bas, ekIndeks).join(' ').trim();
    if (ad && !adaylar.includes(ad)) adaylar.push(ad);
  }
  return adaylar;
}

/**
 * Serbest metinden yol adı ADAYLARINI çıkarır (en olası önce).
 *
 * METNİN TAMAMI taranır, ilk ekte durulmaz. Sürücü A4'ün tamamını çektiğinde
 * sayfada birden fazla "cd/sk" geçiyor — üstelik ilki genellikle MAĞAZANIN
 * kendi adresi ("TERAS PARK AVM 55. SOKAK"). İlk bulduğunda dursaydık
 * müşterinin sokağını hiç görmezdik.
 */
function yolAdaylari(sadeAyrik) {
  const kelimeler = sadeAyrik.split(' ');
  const solSinir = new Set([...EK.mahalle, ...EK.bina, ...EK.numara, ...GURULTU]);
  const hepsi = [];
  for (let i = 0; i < kelimeler.length; i++) {
    if (!ekMi(kelimeler[i], EK.yol)) continue;
    /* Yol adları uzun olabiliyor: "JAN.KO.TEĞ.ADEM BURAN" faturada
       "jandarma komando teğmen adem buran" diye yazılmış — 5 sözcük. */
    for (const a of adaylarUret(kelimeler, i, 5, solSinir)) {
      if (!hepsi.includes(a)) hepsi.push(a);
    }
    if (hepsi.length >= 12) break;          // kombinasyon patlamasın
  }
  return hepsi.length ? hepsi : yolAdaylariEksiz(sadeAyrik);
}

/**
 * Sokak adı YAZILI ama EKİ YOK olan hâl.
 * Gerçek örnek: "TAŞ MAH 2031/9 NO16" — "2031/9" sokaktır ama "sk" yazmıyor.
 * Mahalle ekinden sonra başlayıp ilk numara/daire işaretine kadar okunur.
 */
function yolAdaylariEksiz(sadeAyrik) {
  const kelimeler = sadeAyrik.split(' ');
  let bas = -1;
  for (let i = 0; i < kelimeler.length; i++) {
    if (ekMi(kelimeler[i], EK.mahalle)) { bas = i + 1; break; }
  }
  if (bas < 0) return [];

  const dur = new Set([...EK.numara, ...EK.daire, ...EK.kat, ...EK.bina, ...GURULTU]);
  const alinan = [];
  for (let i = bas; i < kelimeler.length; i++) {
    const k = kelimeler[i];
    if (dur.has(k)) break;
    if (/^no\d+/.test(k)) break;              // "no16" yapışık yazılmış
    if (/^\d{5}$/.test(k)) break;             // posta kodu
    if (ekMi(k, EK.yol)) continue;
    alinan.push(k);
  }
  /* Baştan 1, 2, 3 … sözcüklük adaylar. */
  const adaylar = [];
  for (let n = alinan.length; n >= 1; n--) {
    const ad = alinan.slice(0, n).join(' ');
    if (ad && !adaylar.includes(ad)) adaylar.push(ad);
  }
  return adaylar;
}

/** Serbest metinden mahalle adı ADAYLARINI çıkarır (en olası önce). */
function mahalleAdaylari(sadeAyrik) {
  const kelimeler = sadeAyrik.split(' ');
  const solSinir = new Set([...EK.yol, ...EK.bina, ...EK.numara, ...GURULTU]);
  const hepsi = [];
  /* yolAdaylari ile aynı gerekçe: metnin tamamı taranır. Tam sayfada
     "Semt/Mahalle:" alan adı da "mahalle" eki gibi görünüyor ve ilk eşleşmede
     durulursa mahalle adı olarak "semt" çıkıyordu. */
  for (let i = 0; i < kelimeler.length; i++) {
    if (!ekMi(kelimeler[i], EK.mahalle)) continue;
    for (const a of adaylarUret(kelimeler, i, 3, solSinir)) {  // mahalle adı en fazla 3 sözcük
      if (!hepsi.includes(a)) hepsi.push(a);
    }
    if (hepsi.length >= 9) break;
  }
  return hepsi;
}

/* Tek değer isteyen eski çağrılar için — ilk (en olası) adayı verir. */
const yolBul = (s) => yolAdaylari(s)[0] || null;
const mahalleBul = (s) => mahalleAdaylari(s)[0] || null;

/**
 * SERBEST METİN ÇIKARICI — e-İrsaliye ve fatura gövdesi için.
 *
 *   ayiklaSerbest("Zümrüt Mh. Vatan Blv. No:174A PK: 20160 Pamukkale Denizli", ilceler)
 *   -> { ilce:'PAMUKKALE', mahalle:'zumrut', yol:'vatan', kapino:'174A', … }
 */
function ayiklaSerbest(metin, ilceAdlari) {
  if (!metin) return {};
  const ayrik = ayirEkler(sade(metin));
  const mAday = mahalleAdaylari(ayrik);
  const yAday = yolAdaylari(ayrik);
  return {
    ilce: ilceBul(metin, ilceAdlari),
    mahalle: mAday[0] || null, mahalleAdaylar: mAday,
    yol: yAday[0] || null, yolAdaylar: yAday,
    kapino: kapiNoBul(metin), kapinoAdaylar: kapiNoAdaylari(metin),
    daire: daireBul(metin),
    kat: katBul(metin),
    ham: metin,
  };
}

/**
 * ETİKET ÇIKARICI — teslimat etiketinin alanları ayrı ayrı okunduğunda.
 *
 * Etikette hangi bilginin ne olduğu belli, o yüzden tahmine gerek yok:
 * "Semt/Mahalle" alanındaki şey mahalledir, aramaya gerek yok.
 * Yalnız "Alıcı Adres" alanı hâlâ karışık ("saltak cd., no: 92, daire: 1"),
 * onun içi serbest metin gibi ayrıştırılıyor.
 */
function ayiklaEtiket({ ilIlce, semtMahalle, acikAdres } = {}, ilceAdlari) {
  const adresAyrik = ayirEkler(sade(acikAdres || ''));
  const yAday = yolAdaylari(adresAyrik);
  const yEksiz = yolAdiTahmin(adresAyrik);
  return {
    ilce: ilceBul(ilIlce, ilceAdlari),
    mahalle: semtMahalle ? adiSadelestir(semtMahalle) : null,
    mahalleAdaylar: semtMahalle ? [adiSadelestir(semtMahalle)] : [],
    yolAdaylar: yAday.length ? yAday : (yEksiz ? [yEksiz] : []),
    kapinoAdaylar: kapiNoAdaylari(acikAdres),
    /* Sokak adı "Alıcı Adres"in başında duruyor ama bazen hiç yok
       (ölçüldü: "no: 7, daire: 7" — sokak yazılmamış). */
    yol: yAday[0] || yEksiz,
    kapino: kapiNoBul(acikAdres),
    daire: daireBul(acikAdres),
    kat: katBul(acikAdres),
    ham: [ilIlce, semtMahalle, acikAdres].filter(Boolean).join(' | '),
  };
}

/**
 * "Alıcı Adres" alanında yol EKİ yazılmamışsa (ör. "2031/9., no: 1") ilk
 * parçayı yol adı say. Numaradan önceki her şey sokak adıdır.
 * Hiç sokak yoksa null döner — uydurmaz.
 */
function yolAdiTahmin(sadeAyrik) {
  const dur = new Set([...EK.numara, ...EK.daire, ...EK.kat, ...EK.bina, ...GURULTU]);
  const alinan = [];
  for (const k of sadeAyrik.split(' ')) {
    if (dur.has(k)) break;
    if (EK.yol.includes(k) || EK.mahalle.includes(k)) continue;
    alinan.push(k);
  }
  return alinan.length ? alinan.join(' ') : null;
}

/**
 * TEK FOTOĞRAFTAKİ BİRDEN FAZLA SİPARİŞİ AYIRIR.
 *
 * Ölçüldü: bir karede İKİ ayrı Çıkış Belgesi vardı (40823546 İnceler Mh. /
 * 40823547 Barbaros Mh.) — iki farklı adres, iki ayrı durak. Tek metin
 * olarak işlenince alanlar karışıyor ve motor, bir siparişin sokağıyla
 * ötekinin kapı numarasını birleştirip GÜVENLE yanlış adres üretiyor.
 *
 * Metinde birden çok belge numarası varsa, metin o numaraların geçtiği
 * yerlerden bölünüyor ve her parça ayrı belge gibi çözülüyor.
 *
 * @returns {string[]} en az bir parça; tek sipariş varsa metnin kendisi.
 */
function belgeleriAyir(hamMetin) {
  if (!hamMetin) return [];
  const re = /(?:Çıkış\s*Belgesi|Teslimat\s*No|Sipariş\s*No)\s*[:.]?\s*([0-9][0-9_]{5,19})/gi;
  const bulunan = [];
  let m;
  while ((m = re.exec(hamMetin)) !== null) bulunan.push({ no: m[1], yer: m.index });

  const farkli = [...new Set(bulunan.map((b) => b.no))];
  if (farkli.length < 2) return [hamMetin];

  /* OCR AYNI NUMARAYI FARKLI OKUYABİLİR — bölme buna kanmamalı.
     Ölçüldü: aynı siparişin iki etiketi (2/1 ve 2/2, belge 40826584) bulanık
     bir fotoğrafta "40826584" ve "40B26584" diye okundu; metin ikiye bölününce
     her parça yarım kaldı ve adres hiç çözülemedi. Gerçekten farklı iki sipariş
     numarası birbirine benzemez; bir-iki harflik fark okuma hatasıdır. */
  const gercektenFarkli = farkli.filter((a, i) =>
    farkli.every((b, j) => j >= i || _uzaklik(a, b) > 2));
  if (gercektenFarkli.length < 2) return [hamMetin];

  /* Aynı numara birden çok kez geçebilir (etiket + gövde); bölme noktası
     olarak her numaranın İLK geçtiği yer alınıyor. */
  const ilkYer = new Map();
  for (const b of bulunan) if (!ilkYer.has(b.no)) ilkYer.set(b.no, b.yer);
  const sinirlar = [...ilkYer.values()].sort((a, b) => a - b);

  /* İlk sınırdan önceki kısım (başlık, mağaza bilgisi) ilk parçaya eklenir. */
  const parcalar = [];
  for (let i = 0; i < sinirlar.length; i++) {
    const bas = i === 0 ? 0 : sinirlar[i];
    const son = i + 1 < sinirlar.length ? sinirlar[i + 1] : hamMetin.length;
    const p = hamMetin.slice(bas, son).trim();
    if (p) parcalar.push(p);
  }
  return parcalar.length ? parcalar : [hamMetin];
}

/**
 * BİRLEŞTİRİCİ — aynı belgedeki birden fazla adres kaynağını tek adrese indirir.
 *
 * Öncelik sırası (soldan sağa, ilk dolu olan kazanır) ALAN BAZINDA işler.
 * Bu kasıtlı: teslimat etiketinde sokak eksik olabiliyor ama fatura gövdesinde
 * yazıyor (ölçüldü — Karaman Mh. örneği). Kaynağın tamamını değil, eksik alanı
 * bir sonraki kaynaktan tamamlıyoruz.
 */
function birlestir(...kaynaklar) {
  const dolu = kaynaklar.filter(Boolean);
  const sonuc = { kaynak: {} };
  for (const alan of ['ilce', 'mahalle', 'yol', 'kapino', 'daire', 'kat']) {
    for (let i = 0; i < dolu.length; i++) {
      const d = dolu[i][alan];
      if (d != null && String(d).trim() !== '') {
        sonuc[alan] = d;
        sonuc.kaynak[alan] = dolu[i].etiketAdi || `kaynak${i + 1}`;
        break;
      }
    }
    if (sonuc[alan] === undefined) sonuc[alan] = null;
  }
  return sonuc;
}

module.exports = {
  sade, ayirEkler, adiSadelestir, ekMi,
  ilceBul, kapiNoBul, kapiNoAdaylari, daireBul, katBul,
  yolBul, mahalleBul, yolAdaylari, mahalleAdaylari,
  ayiklaSerbest, ayiklaEtiket, birlestir, belgeleriAyir,
  gondericiAdresiMi, GONDERICI_ADRESLERI,
  EK, GURULTU,
};

  };

  kayit['./adres'] = function (module, exports, require) {
'use strict';
/**
 * ADRES BİLEŞENLERİNİ KOORDİNATA ÇEVİRİR
 * ======================================
 *
 * Girdi : { ilce, mahalle, yol, kapino }   (metin.js'in çıkardığı bileşenler)
 * Çıktı : { lat, lng, guven, keskinlik, ... }
 *
 * Veri kaynağı: Denizli Büyükşehir Belediyesi'nin kendi adres kaydının yerel
 * kopyası — 718.413 kapı numarası, 132.562 yol, 620 mahalle, 19 ilçe.
 * İnternet gerekmez; sorgular mikrosaniye sürer.
 *
 * NEDEN NOMINATIM/GOOGLE DEĞİL
 * ----------------------------
 * Denizli'nin numaralı sokakları (2031/9. sk. gibi) OpenStreetMap'te yok —
 * ölçüldü, Aktepe'de yolların %8'inin, Sümer'de %10'unun adı kayıtlı ve
 * kapı numarası pratikte hiç yok. Nominatim bu sorgulara bambaşka bir sokağı
 * "kesin buldum" görünümünde döndürüyor. Belediyenin kaydı ise eksiksiz.
 *
 * TASARIMIN İKİ TEMEL KARARI
 * --------------------------
 * 1) KAPI, SOKAĞA MESAFEYLE BAĞLANIR.
 *    Veritabanında `kapi.yol_oid` sütunu var ama TAMAMEN BOŞ (718.413'ün 0'ı).
 *    Yani "şu sokaktaki 92 numara" diye doğrudan sorgulanamıyor. Bunun yerine:
 *    mahalledeki aynı numaralı kapıları çekip, hangisinin o sokağın ÇİZGİSİNE
 *    en yakın olduğuna bakıyoruz.
 *
 *    Sokağın MERKEZ noktasına ölçmek yanlış olur: yollar segmentlere bölünmüş,
 *    tek mahallede aynı adlı 10-29 parça olabiliyor. Bütün parçaların çizgi
 *    geometrisine en kısa mesafe hesaplanıyor.
 *
 * 2) O MESAFE, AYNI ZAMANDA GÜVEN SKORUDUR.
 *    6 gerçek fatura adresiyle ölçüldü: doğru eşleşmeler 11-13 m çıktı,
 *    şüpheliler 75 m ve 204 m. Yani "kapı sokağa ne kadar yakın" sorusu,
 *    uydurma bir eşiğe gerek kalmadan doğruluğu söylüyor. Sürücüye hangi
 *    adresi kontrol etmesi gerektiğini bu sayı belirliyor.
 */

const { sade } = require('./metin');

/* VERİ ERİŞİMİ ARAYÜZ ARKASINDA.
   Bu dosya artık ne SQLite ne JSON biliyor; kendisine verilen `kaynak`
   nesnesinin yöntemlerini çağırıyor. İki uygulaması var:
     lib/kaynak-sqlite.js — masaüstü/test, 98 MB'lık tam veritabanı
     lib/kaynak-paket.js  — telefon/tarayıcı, 7 MB'lık sıkıştırılmış paket
   Eşleştirme mantığı 18 gerçek belgeyle ayarlandı; ikinci bir kopya yazmak
   o ayarların zamanla birbirinden ayrı düşmesi demekti. */

/* Güven eşikleri — yukarıdaki ölçüme dayanıyor, keyfi değil. */
const ESIK = {
  yesil: 70,   // bu ve üstü: sürücüye sorulmaz
  sari: 40,    // arası: "kontrol et" işareti
};                // altı: kırmızı, elle düzeltilmeli

/* Kapının sokak çizgisine uzaklığına göre taban puan (metre). */
const UZAKLIK_PUANI = [
  [30, 95],    // 30 m'ye kadar: kapının tam önü
  [80, 72],
  [150, 55],
  [400, 38],
  [Infinity, 20],
];

/** Kolaylık: SQLite kaynağıyla aç. Tarayıcıda kaynak-paket doğrudan kullanılır. */
function ac(dbYol) {
  return require('./kaynak-sqlite').ac(dbYol);
}

/* ---------------------------------------------------------------- geometri */

const M_DERECE = 111320;   // 1 derece enlem ≈ 111,32 km

/**
 * Nokta ile doğru parçası arasındaki en kısa mesafe (metre).
 * Küçük alanda düzlem yaklaşımı yeterli — Denizli ölçeğinde hata < %0,1.
 */
function noktaParcaMesafe(plat, plng, alat, alng, blat, blng) {
  const k = Math.cos(plat * Math.PI / 180);
  const px = plng * M_DERECE * k, py = plat * M_DERECE;
  const ax = alng * M_DERECE * k, ay = alat * M_DERECE;
  const bx = blng * M_DERECE * k, by = blat * M_DERECE;
  const dx = bx - ax, dy = by - ay;
  const uzunlukKare = dx * dx + dy * dy;
  let t = uzunlukKare === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / uzunlukKare;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Noktanın, çizgi kümesinin herhangi bir parçasına en kısa mesafesi (metre). */
function cizgiyeMesafe(plat, plng, cizgiler) {
  let en = Infinity;
  for (const c of cizgiler) {
    for (let i = 0; i < c.length - 1; i++) {
      const d = noktaParcaMesafe(plat, plng, c[i][0], c[i][1], c[i + 1][0], c[i + 1][1]);
      if (d < en) en = d;
    }
  }
  return en;
}

/**
 * Çizgi kümesinin orta noktası — kapı bulunamazsa yol seviyesinde döneriz.
 *
 * UZUNLUKLA AĞIRLIKLI hesaplanıyor, nokta sayısıyla değil. Nedeni ölçüldü:
 * telefon paketinde sokak çizgileri sadeleştirildiği için nokta sayısı
 * azalıyor (636.851 → 350.500) ve düz nokta ortalaması, aynı sokak için
 * masaüstünde ve telefonda 119 m farklı sonuç veriyordu. Uzunluk ağırlığı
 * nokta yoğunluğundan bağımsız olduğu için iki kaynak aynı noktayı buluyor.
 * Ayrıca daha doğru: sık örneklenmiş bir viraj, merkezi kendine çekmiyor.
 */
function cizgiMerkezi(cizgiler) {
  let la = 0, ln = 0, toplamAgirlik = 0;
  for (const c of cizgiler) {
    for (let i = 0; i < c.length - 1; i++) {
      const [aLat, aLng] = c[i], [bLat, bLng] = c[i + 1];
      const uzunluk = Math.hypot(bLat - aLat, bLng - aLng) || 1e-9;
      la += ((aLat + bLat) / 2) * uzunluk;
      ln += ((aLng + bLng) / 2) * uzunluk;
      toplamAgirlik += uzunluk;
    }
  }
  if (toplamAgirlik > 0) return { lat: la / toplamAgirlik, lng: ln / toplamAgirlik };
  /* Tek noktalık çizgi — ortalamaya düş. */
  let n = 0; la = 0; ln = 0;
  for (const c of cizgiler) for (const p of c) { la += p[0]; ln += p[1]; n++; }
  return n ? { lat: la / n, lng: ln / n } : null;
}

/* -------------------------------------------------------------- benzerlik */

/** Levenshtein — OCR harf hatalarını yakalamak için son çare. */
function duzenlemeUzakligi(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let onceki = Array.from({ length: n + 1 }, (_, i) => i);
  const simdi = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    simdi[0] = i;
    for (let j = 1; j <= n; j++) {
      const bedel = a[i - 1] === b[j - 1] ? 0 : 1;
      simdi[j] = Math.min(simdi[j - 1] + 1, onceki[j] + 1, onceki[j - 1] + bedel);
    }
    onceki = simdi.slice();
  }
  return onceki[n];
}

/** 0-1 arası benzerlik. 1 = birebir. */
function benzerlik(a, b) {
  if (!a || !b) return 0;
  const uzun = Math.max(a.length, b.length);
  return uzun === 0 ? 1 : 1 - duzenlemeUzakligi(a, b) / uzun;
}

/* ----------------------------------------------------------------- sorgular */

function ilceAdlari(kaynak) {
  return kaynak.ilceler().map((i) => i.ad);
}

/**
 * Mahalleyi bulur. İlçe verilirse tekilleşir.
 *
 * Bu kısıt şart: 620 mahallenin 44 tanesinin adı tekrar ediyor
 * (CUMHURİYET 9 ilçede, YENİ 9 ilçede) ve her tekrar FARKLI ilçede.
 * İlçe olmadan "Cumhuriyet Mh." dokuz ihtimal demek.
 */
function mahalleBul(kaynak, mahalleAdi, ilceAdi) {
  const ms = sade(mahalleAdi);
  if (!ms) return { adaylar: [], eslesme: null };

  const ilceKisit = ilceAdi ? sade(ilceAdi) : null;
  const ilceOid = ilceKisit ? (kaynak.ilceBul(ilceKisit) || {}).oid : null;
  /* 620 mahalle — tamamı bellekte, süzme JavaScript'te. SQL'de yapmanın
     bir üstünlüğü yok ve iki kaynak da aynı kodu paylaşıyor. */
  const havuz = kaynak.mahalleler().filter((m) => (ilceKisit ? m.ilceOid === ilceOid : true));

  const bicimle = (m) => ({ objectid: m.oid, ad: m.ad, ad_ara: m.adAra, ilce: m.ilce });

  const adaylar = havuz.filter((m) => m.adAra === ms).map(bicimle);
  if (adaylar.length) return { adaylar, eslesme: 'tam' };

  /* Tam eşleşme yoksa bulanık ara — OCR "SÜMFR" okumuş olabilir. */
  const puanli = havuz.map((m) => ({ ...bicimle(m), p: benzerlik(m.adAra, ms) }))
                      .filter((m) => m.p >= 0.75)
                      .sort((a, b) => b.p - a.p);
  return { adaylar: puanli.slice(0, 3), eslesme: puanli.length ? 'bulanik' : null };
}

/**
 * Mahalledeki yolu bulur. Sırasıyla: tam → önek → içerik → bulanık.
 *
 * Veritabanında yol adları EKSİZ tutuluyor ("SALTAK", "2031/9", "YUNUS EMRE"),
 * faturada ise ekli geliyor ("saltak cd.", "2031/9. sk."). metin.js ekleri
 * zaten ayıklıyor; burada sadece adın kendisi aranıyor.
 */
function yolBul(kaynak, mahalleOid, yolAdi) {
  const ys = sade(yolAdi);
  if (!ys) return { yollar: [], eslesme: null };

  /* Mahalledeki yollar (en fazla ~600) bir kez alınıp süzülüyor; geometri
     yalnız KAZANANLAR için ayrıca isteniyor — çizgiler ağır. */
  const adlar = kaynak.yollar(mahalleOid);
  const geometriEkle = (liste) => {
    const harita = kaynak.cizgiler(liste.map((r) => r.oid));
    return liste.map((r) => ({
      objectid: r.oid, ad: r.ad, ad_ara: r.adAra, tur: r.tur,
      cizgiler: harita.get(r.oid) || [],
    }));
  };

  let y = adlar.filter((r) => r.adAra === ys);
  if (y.length) return { yollar: geometriEkle(y), eslesme: 'tam' };

  y = adlar.filter((r) => r.adAra.startsWith(ys));
  if (y.length) return { yollar: geometriEkle(y), eslesme: 'onek' };

  /* İÇERİK (parça) eşleşmesi yalnız UZUN ve SAYISAL OLMAYAN sorgularda.
     Ölçüldü: "55" sorgusu, numaralı sokak "1755"in içinde geçtiği için
     eşleşiyordu — mağazanın "55. Sokak" adresi, müşterinin mahallesindeki
     bambaşka bir sokağa bağlanıyordu. Numaralı sokaklarda kapı numarası gibi
     davranmak gerek: ya birebir tutar ya tutmaz. */
  if (ys.length >= 4 && !/^[\d\s]+$/.test(ys)) {
    y = adlar.filter((r) => r.adAra.includes(ys));
    if (y.length) return { yollar: geometriEkle(y), eslesme: 'icerik' };
  }

  /* ORTAK SÖZCÜK EŞLEŞMESİ — harf harf benzerlikten önce denenir.
     Belediye kaydı KISALTMA kullanıyor, fatura ise açık yazıyor:
        veritabanı : "JAN.KO.TEĞ.ADEM BURAN"  -> "jan ko teg adem buran"
        fatura      : "jandarma komando teğmen adem buran"
     Levenshtein bu ikisini yakalayamaz (benzerlik ~%50), ama ayırt edici
     sözcükler ("adem", "buran") birebir ortak. O yüzden 3 harften uzun
     sözcüklerin örtüşmesine bakılıyor; kısa sözcükler ("ko", "1") ayırt
     edici olmadığı için sayılmıyor. */
  const sorguKelime = ys.split(' ').filter((k) => k.length > 3);
  if (sorguKelime.length) {
    const ortakli = adlar.map((r) => {
      const adKelime = new Set(r.adAra.split(' ').filter((k) => k.length > 3));
      if (!adKelime.size) return null;
      const ortak = sorguKelime.filter((k) => adKelime.has(k)).length;
      return ortak ? { ...r, ortak, oran: ortak / Math.min(sorguKelime.length, adKelime.size) } : null;
    }).filter(Boolean);
    /* En az 2 ayırt edici sözcük ortak olmalı, ya da tek sözcüklük bir
       sorguda o sözcük tam tutmalı. Tek ortak sözcükle eşleştirmek
       ("ADEM MENDERES" ile "ADNAN MENDERES") yanlış adrese götürür. */
    const yeterli = ortakli.filter((r) => r.ortak >= 2 || (sorguKelime.length === 1 && r.oran === 1));
    if (yeterli.length) {
      const enIyiOran = Math.max(...yeterli.map((r) => r.ortak));
      const kazanan = yeterli.filter((r) => r.ortak === enIyiOran);
      return { yollar: geometriEkle(kazanan), eslesme: 'ortak-sozcuk', ortak: enIyiOran };
    }
  }

  const puanli = adlar.map((r) => ({ ...r, p: benzerlik(r.adAra, ys) }))
                      .filter((r) => r.p >= 0.7);
  if (!puanli.length) return { yollar: [], eslesme: null };
  const enIyi = Math.max(...puanli.map((r) => r.p));
  const kazanan = puanli.filter((r) => r.p === enIyi);
  return { yollar: geometriEkle(kazanan), eslesme: 'bulanik', benzerlik: enIyi };
}

/**
 * Mahalledeki, verilen numaralı kapıları getirir.
 * "174A" tam bulunamazsa taban numaraya ("174") düşer — fatura ile belediye
 * kaydı arasında ek harf/bölü farkı olabiliyor.
 */
function kapiBul(kaynak, mahalleOid, kapino) {
  const ks = sade(kapino);
  if (!ks) return { kapilar: [], eslesme: null };

  const cek = (v) => kaynak.kapilar(mahalleOid, v);

  let k = cek(ks);
  if (k.length) return { kapilar: k, eslesme: 'tam' };

  const taban = ks.split(' ')[0].replace(/[a-z]+$/, '');
  if (taban && taban !== ks) {
    k = cek(taban);
    if (k.length) return { kapilar: k, eslesme: 'taban' };
  }
  return { kapilar: [], eslesme: null };
}

/* ------------------------------------------------------------------- çözüm */

function uzakliktanPuan(m) {
  for (const [sinir, puan] of UZAKLIK_PUANI) if (m <= sinir) return puan;
  return 20;
}

/**
 * ANA GİRİŞ — bileşenlerden koordinat üretir.
 *
 * Dönen `keskinlik`: 'kapi' | 'yol' | 'mahalle' | 'yok'
 * Dönen `guven`   : 0-100. `renk` alanı bunu yeşil/sarı/kırmızıya çevirir.
 */
function coz(kaynak, { ilce, mahalle, yol, kapino } = {}) {
  const sonuc = {
    lat: null, lng: null, keskinlik: 'yok', guven: 0, renk: 'kirmizi',
    ilce: null, mahalle: null, yol: null, kapino: null,
    yolaUzaklik: null, adaylar: [], notlar: [],
  };

  /* --- mahalle --- */
  const m = mahalleBul(kaynak, mahalle, ilce);
  if (!m.adaylar.length) {
    sonuc.notlar.push(mahalle ? `Mahalle bulunamadı: "${mahalle}"` : 'Mahalle okunamadı');
    /* Mahalle yoksa ama ilçe biliniyorsa pes etme: sokağı ilçenin TAMAMINDA ara.
       Gerçek örnek (Çivril) — adres "özdemirci asfalt üzeri sanayi sitesi pazar
       yeri cad 10" diyor, mahalle adı hiç geçmiyor. Bu tür sanayi/mevki
       adresleri sahada az değil ve sürücüyü bomboş bırakmaktansa doğru ilçede
       doğru caddeye götürmek çok daha iyi. Sonuç her hâlükârda düşük güvenli
       (kırmızı/sarı) döner; sürücü onaylar. */
    if (ilce) return ilceGenelinde(kaynak, ilce, yol, kapino, sonuc);
    return sonuc;
  }
  if (m.adaylar.length > 1) {
    sonuc.notlar.push(`Mahalle belirsiz — ${m.adaylar.length} aday (${m.adaylar.map((a) => a.ilce).join(', ')}). İlçe gerekli.`);
  }
  if (m.eslesme === 'bulanik') sonuc.notlar.push(`Mahalle adı yaklaşık eşleşti: "${mahalle}" → "${m.adaylar[0].ad}"`);

  const mah = m.adaylar[0];
  sonuc.mahalle = mah.ad;
  sonuc.ilce = mah.ilce || null;
  sonuc.mahalleOid = mah.objectid;

  /* Mahalle seviyesi taban — daha iyisini bulamazsak buraya düşeceğiz. */
  const mahMerkez = kaynak.mahalleKutu(mah.objectid);
  if (mahMerkez && mahMerkez.lat != null) {
    sonuc.lat = mahMerkez.lat; sonuc.lng = mahMerkez.lng;
    sonuc.keskinlik = 'mahalle'; sonuc.guven = m.adaylar.length > 1 ? 12 : 25;
  }

  /* --- yol --- */
  const y = yolBul(kaynak, mah.objectid, yol);
  if (!y.yollar.length) {
    if (yol) sonuc.notlar.push(`Sokak bulunamadı: "${yol}"`);
    else sonuc.notlar.push('Sokak adı yok — faturanın gövdesinden okunmalı');
    return son(sonuc);
  }
  sonuc.yol = y.yollar[0].ad;
  sonuc.yolParca = y.yollar.length;
  sonuc.yolEslesme = y.eslesme;
  if (y.eslesme === 'bulanik') sonuc.notlar.push(`Sokak adı yaklaşık eşleşti: "${yol}" → "${y.yollar[0].ad}"`);

  const cizgiler = y.yollar.flatMap((r) => r.cizgiler || []);
  const merkez = cizgiMerkezi(cizgiler);
  if (merkez) {
    sonuc.lat = merkez.lat; sonuc.lng = merkez.lng;
    sonuc.keskinlik = 'yol';
    sonuc.guven = { tam: 50, onek: 45, icerik: 40, 'ortak-sozcuk': 42, bulanik: 32 }[y.eslesme] ?? 40;
  }

  /* --- kapı --- */
  if (!kapino) { sonuc.notlar.push('Kapı numarası yok — sokak seviyesinde kaldı'); return son(sonuc); }

  const k = kapiBul(kaynak, mah.objectid, kapino);
  if (!k.kapilar.length) {
    sonuc.notlar.push(`Mahallede "${kapino}" numaralı kapı kaydı yok — sokak seviyesinde kaldı`);
    return son(sonuc);
  }

  const sirali = k.kapilar
    .map((kp) => ({ ...kp, uzaklik: cizgiyeMesafe(kp.lat, kp.lng, cizgiler) }))
    .sort((a, b) => a.uzaklik - b.uzaklik);

  const en = sirali[0];
  sonuc.lat = en.lat; sonuc.lng = en.lng;
  sonuc.kapino = en.kapino;
  sonuc.keskinlik = 'kapi';
  sonuc.yolaUzaklik = Math.round(en.uzaklik);
  sonuc.adaylar = sirali.slice(1, 4).map((kp) => ({ kapino: kp.kapino, uzaklik: Math.round(kp.uzaklik), lat: kp.lat, lng: kp.lng }));

  let puan = uzakliktanPuan(en.uzaklik);
  /* Yol adı zorlanarak eşleştiyse kapı da o kadar güvenilir.
     DİKKAT: burada `|| 8` KULLANILMAZ. Tam eşleşmenin cezası 0'dır ve 0
     JavaScript'te falsy olduğu için `|| 8` en iyi eşleşmelere 8 puan ceza
     yazıyordu — Kuşpınar/İnönü 96 bu yüzden eleniyordu. `??` şart. */
  puan -= { tam: 0, onek: 4, icerik: 8, 'ortak-sozcuk': 6, bulanik: 18 }[y.eslesme] ?? 8;
  if (k.eslesme === 'taban') { puan -= 8; sonuc.notlar.push(`Kapı no "${kapino}" bulunamadı, taban numara "${en.kapino}" kullanıldı`); }
  if (m.eslesme === 'bulanik') puan -= 10;
  if (m.adaylar.length > 1) puan -= 25;

  /* İKİ ADAY BİRBİRİNE YAKINSA HANGİSİ OLDUĞU BELİRSİZDİR.
     Aynı mahallede aynı numaradan birden fazla varsa ve ikisi de sokağa
     benzer uzaklıktaysa, seçim şansa kalıyor demektir. */
  /* MAHALLEDE O NUMARADAN TEK KAPI VARSA bu güçlü bir kanıttır: karışacağı
     bir rakip yok. Ölçüldü — Kuşpınar/İnönü "96" sokağın 204 m uzağında
     çıkıyor (cadde uzun, mahalledeki parçaları kapıya kadar uzanmıyor) ama
     mahallede o numaradan başka kapı yok. Bu bonus olmadan motor kapıyı
     eleyip sokak merkezine düşüyordu; sürücü için 204 m'lik bir bina noktası,
     caddenin ortası olmaktan iyidir. */
  if (sirali.length === 1 && en.uzaklik > 80) puan += 15;

  /* AYNI NUMARADAN ÇOK KAPI VARSA SEÇİM O KADAR ZAYIFTIR.
     Mahallede "7" numaralı 36 kapı varsa, bunlardan sokağa en yakınını
     seçmek bir tahmindir — mesafe farkı küçükse hangisi olduğu gerçekten
     belirsizdir. Ölçüldü: Yunusemre'de "Apt: 7"den türetilen numara,
     36 aday arasından 18 m ile seçiliyordu ve motor buna yeşil veriyordu.
     Aday sayısı arttıkça güven düşmeli. */
  /* Ama aday çokluğu TEK BAŞINA kötü değil: en yakın olan diğerlerinden
     belirgin biçimde öndeyse seçim yine nettir. Ceza yalnız sıkışık
     durumlarda uygulanır. */
  const acik = sirali.length > 1 ? sirali[1].uzaklik - en.uzaklik : Infinity;
  if (acik < 30) {
    if (sirali.length >= 5) puan -= 12;
    if (sirali.length >= 15) puan -= 8;
  }

  if (sirali.length > 1) {
    const fark = sirali[1].uzaklik - en.uzaklik;
    /* Eşik 25 m'den 12 m'ye indirildi. Ölçüldü: kırsal ilçelerde aynı
       numaradan onlarca kapı olabiliyor (Bozkurt/İnceler'de "11" numaradan
       32 tane) ve rakip 20-45 m ötede duruyor. 25 m eşiği bu doğru
       eşleşmeleri de cezalandırıp sarıya düşürüyordu. Caddenin karşı
       kaldırımı ~12 m; gerçek belirsizlik ancak bunun altında başlar. */
    if (fark < 12) {
      puan -= 20;
      sonuc.notlar.push(`Aynı numaradan ${sirali.length} kapı var ve ikisi de sokağa yakın (${Math.round(en.uzaklik)} m / ${Math.round(sirali[1].uzaklik)} m) — hangisi olduğu belirsiz`);
    }
  }
  if (en.uzaklik > 150) sonuc.notlar.push(`Kapı, sokağın ${Math.round(en.uzaklik)} m uzağında — muhtemelen başka sokaktaki aynı numara`);

  sonuc.guven = Math.max(0, Math.min(100, Math.round(puan)));
  return son(sonuc);
}

/**
 * MAHALLESİZ ÇÖZÜM — sokağı ilçenin tamamında arar.
 *
 * Mahalle kısıtı olmadığı için aynı adlı sokaklar birden çok mahallede
 * çıkabilir; o yüzden güven tavanı düşük tutulur ve sonuç asla yeşile
 * çıkmaz — sürücünün gözüyle doğrulaması beklenir.
 */
function ilceGenelinde(kaynak, ilceAdi, yol, kapino, sonuc) {
  const is = sade(ilceAdi);
  const ilceKayit = kaynak.ilceBul(is);
  if (!ilceKayit) return son(sonuc);
  sonuc.ilce = ilceKayit.ad;

  /* İlçe merkezi: mahalle sınır kutularının ortalaması. */
  const mrk = kaynak.ilceMerkez(ilceKayit.oid);
  if (mrk && mrk.lat != null) {
    sonuc.lat = mrk.lat; sonuc.lng = mrk.lng;
    sonuc.keskinlik = 'ilce'; sonuc.guven = 8;
  }
  if (!yol) { sonuc.notlar.push('Sokak da okunamadı — yalnız ilçe biliniyor'); return son(sonuc); }

  const ys = sade(yol);
  const yollar = kaynak.ilceYollari(ilceKayit.oid)
    .filter((y) => y.adAra === ys || y.adAra.includes(ys));
  if (!yollar.length) { sonuc.notlar.push(`Sokak ilçe genelinde de bulunamadı: "${yol}"`); return son(sonuc); }

  /* Birden fazla mahallede çıkarsa en çok parçası olan mahalleyi seç ve söyle. */
  const mahGrup = new Map();
  for (const y of yollar) {
    if (!mahGrup.has(y.mahOid)) mahGrup.set(y.mahOid, { ad: y.mahAd, yollar: [] });
    mahGrup.get(y.mahOid).yollar.push(y);
  }
  const sirali = [...mahGrup.entries()].sort((a, b) => b[1].yollar.length - a[1].yollar.length);
  const [mahOid, secilen] = sirali[0];
  sonuc.mahalle = secilen.ad;
  sonuc.yol = secilen.yollar[0].ad;
  if (sirali.length > 1) {
    sonuc.notlar.push(`"${yol}" adlı sokak ${sirali.length} mahallede var (${sirali.slice(0, 3).map(([, v]) => v.ad).join(', ')}) — mahalle bilinmediği için en olası seçildi`);
  }

  const cizgiHarita = kaynak.cizgiler(secilen.yollar.map((y) => y.oid));
  const cizgiler = secilen.yollar.flatMap((y) => cizgiHarita.get(y.oid) || []);
  const merkez = cizgiMerkezi(cizgiler);
  if (merkez) { sonuc.lat = merkez.lat; sonuc.lng = merkez.lng; sonuc.keskinlik = 'yol'; sonuc.guven = sirali.length > 1 ? 20 : 30; }

  if (kapino) {
    const kapilar = kaynak.kapilar(mahOid, sade(kapino));
    const yakin = kapilar.map((k) => ({ ...k, uzaklik: cizgiyeMesafe(k.lat, k.lng, cizgiler) }))
                         .sort((a, b) => a.uzaklik - b.uzaklik)[0];
    if (yakin && yakin.uzaklik < 200) {
      sonuc.lat = yakin.lat; sonuc.lng = yakin.lng; sonuc.kapino = yakin.kapino;
      sonuc.keskinlik = 'kapi'; sonuc.yolaUzaklik = Math.round(yakin.uzaklik);
      sonuc.guven = Math.min(38, sonuc.guven + 15);     // mahalle doğrulanmadı, yeşile çıkamaz
    }
  }
  sonuc.notlar.push('Mahalle okunamadı — ilçe genelinde arandı, mutlaka kontrol et');
  return son(sonuc);
}

function son(s) {
  s.renk = s.guven >= ESIK.yesil ? 'yesil' : s.guven >= ESIK.sari ? 'sari' : 'kirmizi';
  return s;
}

module.exports = {
  ac, coz, ilceAdlari,
  mahalleBul, yolBul, kapiBul,
  cizgiyeMesafe, noktaParcaMesafe, benzerlik,
  ESIK,
};

  };

  kayit['./kaynak-paket'] = function (module, exports, require) {
'use strict';
/**
 * ADRES KAYNAĞI — PAKET (telefon / tarayıcı)
 * ==========================================
 *
 * `veri/paket-uret.js`in ürettiği sıkıştırılmış JSON dosyalarını okur ve
 * `lib/kaynak-sqlite.js` ile BİREBİR AYNI arayüzü sunar. Böylece eşleştirme
 * mantığı (lib/adres.js) hiç değişmeden tarayıcıda da çalışıyor.
 *
 * Toplam paket 7,2 MB; merkez iki ilçe 1,6 MB. İlçe dosyaları İSTENDİĞİNDE
 * yükleniyor — sürücü Çivril'e teslimat okutmadıkça Çivril verisi hiç inmiyor.
 *
 * TARAYICI VE NODE
 * ----------------
 * Aynı dosya iki yerde de çalışıyor. Node'da dosya sisteminden, tarayıcıda
 * `fetch` ile okuyor. Bu, tarayıcı veri yolunun Node testleriyle
 * doğrulanabilmesini sağlıyor — kritik, çünkü telefonda hata ayıklamak zor.
 *
 * PAKET BİÇİMİ (yer kazanmak için dizi, nesne değil)
 *   ilce.json      : [[oid, ad, adAra], …]
 *   mahalle.json   : [[oid, ad, adAra, ilceOid, minLat, minLng, maxLat, maxLng], …]
 *   yol-<ilce>.json: [[mahOid, ad, adAra, tur, [[[lat,lng],…], …]], …]
 *   kapi-<ilce>.json:[[mahOid, kapinoAra, lat, lng], …]
 *   Koordinatlar tam sayı: derece × 1e6.
 */

const { sade } = require('./metin');

const OLCEK = 1e6;
const coz = (v) => v / OLCEK;

/**
 * @param {object} secenek
 *   @param {function(string):Promise<any>} secenek.oku  dosya adı -> JSON
 *   @param {string[]} [secenek.onYukle]  açılışta yüklenecek ilçe adları
 */
function olustur({ oku }) {
  if (typeof oku !== 'function') throw new Error('kaynak-paket: `oku` işlevi gerekli');

  let _ilceler = null;
  let _mahalleler = null;
  const _mahIndeks = new Map();          // mahOid -> mahalle
  const _yukluIlce = new Set();          // yüklenmiş ilçe oid'leri
  const _yolMah = new Map();             // mahOid -> [yol]
  const _cizgi = new Map();              // yolOid -> [[[lat,lng],…], …]
  const _kapiMah = new Map();            // mahOid -> Map(kapinoAra -> [kapı])
  let _sonrakiYolOid = 1;

  async function dizinleriYukle() {
    if (_ilceler) return;
    const ham = await oku('ilce');
    _ilceler = ham.map(([oid, ad, adAra]) => ({ oid, ad, adAra }));
    const mham = await oku('mahalle');
    _mahalleler = mham.map(([oid, ad, adAra, ilceOid, minLat, minLng, maxLat, maxLng]) => {
      const ilce = _ilceler.find((i) => i.oid === ilceOid);
      const m = {
        oid, ad, adAra, ilceOid, ilce: ilce ? ilce.ad : null,
        lat: coz((minLat + maxLat) / 2), lng: coz((minLng + maxLng) / 2),
      };
      _mahIndeks.set(oid, m);
      return m;
    });
  }

  /** Bir ilçenin yol ve kapı verisini yükler (bir kez). */
  async function ilceYukle(ilceOid) {
    if (_yukluIlce.has(ilceOid)) return;
    await dizinleriYukle();

    const yollar = await oku(`yol-${ilceOid}`);
    for (const [mahOid, ad, adAra, tur, cizgiler] of yollar) {
      const oid = _sonrakiYolOid++;
      const kayit = { oid, ad, adAra, tur, mahOid };
      if (!_yolMah.has(mahOid)) _yolMah.set(mahOid, []);
      _yolMah.get(mahOid).push(kayit);
      _cizgi.set(oid, cizgiler.map((c) => c.map(([la, ln]) => [coz(la), coz(ln)])));
    }

    const kapilar = await oku(`kapi-${ilceOid}`);
    for (const [mahOid, kapino, lat, lng] of kapilar) {
      if (!_kapiMah.has(mahOid)) _kapiMah.set(mahOid, new Map());
      const m = _kapiMah.get(mahOid);
      /* Arama anahtarı sadeleştirilmiş, gösterilen değer özgün. */
      const anahtar = sade(kapino);
      if (!m.has(anahtar)) m.set(anahtar, []);
      m.get(anahtar).push({ kapino, lat: coz(lat), lng: coz(lng) });
    }
    _yukluIlce.add(ilceOid);
  }

  /** Bir mahallenin ilçesini yükler — sorgu öncesi çağrılmalı. */
  async function mahalleIcinYukle(mahalleOid) {
    const m = _mahIndeks.get(mahalleOid);
    if (m) await ilceYukle(m.ilceOid);
  }

  return {
    tur: 'paket',
    hazirla: dizinleriYukle,
    ilceYukle,
    mahalleIcinYukle,
    yukluIlceler: () => [..._yukluIlce],

    ilceler: () => _ilceler || [],
    ilceBul: (adAra) => (_ilceler || []).find((i) => i.adAra === adAra) || null,

    ilceMerkez: (ilceOid) => {
      const liste = (_mahalleler || []).filter((m) => m.ilceOid === ilceOid);
      if (!liste.length) return null;
      return {
        lat: liste.reduce((t, m) => t + m.lat, 0) / liste.length,
        lng: liste.reduce((t, m) => t + m.lng, 0) / liste.length,
      };
    },

    mahalleler: () => _mahalleler || [],
    mahalleKutu: (oid) => {
      const m = _mahIndeks.get(oid);
      return m ? { lat: m.lat, lng: m.lng } : null;
    },

    yollar: (mahalleOid) => _yolMah.get(mahalleOid) || [],

    cizgiler: (oidListesi) => {
      const harita = new Map();
      for (const oid of oidListesi || []) if (_cizgi.has(oid)) harita.set(oid, _cizgi.get(oid));
      return harita;
    },

    kapilar: (mahalleOid, kapinoAra) => {
      const m = _kapiMah.get(mahalleOid);
      return m && m.has(kapinoAra) ? m.get(kapinoAra) : [];
    },

    ilceYollari: (ilceOid) => {
      const sonuc = [];
      for (const m of (_mahalleler || [])) {
        if (m.ilceOid !== ilceOid) continue;
        for (const y of (_yolMah.get(m.oid) || [])) {
          sonuc.push({ oid: y.oid, ad: y.ad, adAra: y.adAra, mahOid: m.oid, mahAd: m.ad });
        }
      }
      return sonuc;
    },
  };
}

/* ---------------------------------------------------- hazır okuyucular */

/** Node: dosya sisteminden okur (testler için). */
function dosyadanOkuyucu(dizin) {
  const fs = (function(){ throw new Error('fs tarayıcıda yok'); })();
  const path = (function(){ throw new Error('path tarayıcıda yok'); })();
  return async (ad) => JSON.parse(fs.readFileSync(path.join(dizin, ad + '.json'), 'utf8'));
}

/**
 * Tarayıcı: fetch ile okur. Sunucu gzip'i kendisi açtığı için düz `.json`
 * isteniyor.
 */
function agdanOkuyucu(taban) {
  return async (ad) => {
    const y = await fetch(`${taban}/${ad}.json`);
    if (!y.ok) throw new Error(`Adres verisi indirilemedi: ${ad} (${y.status})`);
    return y.json();
  };
}

module.exports = { olustur, dosyadanOkuyucu, agdanOkuyucu, OLCEK };

  };

  kayit['./fatura'] = function (module, exports, require) {
'use strict';
/**
 * BELGEDEN TESLİMAT ADRESİNE
 * ==========================
 *
 * Bir faturada AYNI ANDA birden fazla adres kaynağı bulunuyor ve hiçbiri
 * tek başına güvenilir değil. Bu dosya onları birleştirir.
 *
 * KAYNAKLAR VE HER BİRİNİN ZAAFI (6 gerçek belge üzerinde ölçüldü)
 * ---------------------------------------------------------------
 * 1) TESLİMAT ETİKETİ — yapıştırma sticker, alanları etiketli:
 *      İl/İlçe · Semt/Mahalle · Alıcı Adres
 *    GÜÇLÜ: ilçe ve mahalle temiz, büyük puntolu, hep aynı yerde.
 *    ZAYIF: SOKAK VE KAPI NUMARASI SİSTEMATİK OLARAK BOZUK. Üç satış
 *    belgesinin üçünde de:
 *      fatura "2031/9 NO16 1"          → etiket "no: 1, daire: 1"
 *      fatura "ZEKİBEY APT NO92 K5 D10" → etiket "no: 92, daire: 1"
 *      fatura "YEŞİLKÖY CD NO:281 D:7"  → etiket "no: 7, daire: 7"  (cadde YOK!)
 *    Etiketi üreten sistem, adresin sonundaki daire numarasını kapı numarası
 *    sanıyor ve cadde adını düşürebiliyor.
 *
 * 2) FATURA GÖVDESİ — "Fatura adresi" bloğu (satış belgesi) veya "SAYIN"
 *    bloğu (e-İrsaliye).
 *    GÜÇLÜ: sokak ve kapı numarası doğru, apartman/kat/daire tam.
 *    ZAYIF: İLÇE YOK (sadece posta kodu + "DENİZLİ" yazıyor). Ayrıca fotoğrafta
 *    sol kenar kesildiğinde ilk kelime kırpılıyor ("DELİKTAŞ" → "TAŞ").
 *
 * 3) EL YAZISI — sürücünün sahada yazdığı.
 *    Bir belgede basılı adres tamamen çizilip yerine yenisi yazılmış. Basılıya
 *    güvenirsek yanlış eve gideriz. Ama el yazısı okumak riskli olduğu için
 *    OTOMATİK KABUL EDİLMEZ: kırmızı işaretlenip sürücüye sorulur.
 *
 * ÇÖZÜM: SABİT ÖNCELİK DEĞİL, EN İYİ KOMBİNASYON
 * ----------------------------------------------
 * "Önce faturaya bak, olmazsa etikete" gibi sabit bir sıra çalışmıyor: fatura
 * gövdesindeki mahalle kırpılmışsa o alan için etiket daha iyi, ama sokak için
 * fatura daha iyi. Alan bazında hangisinin doğru olduğunu ÖNCEDEN bilemiyoruz.
 *
 * Bu yüzden makul kombinasyonların hepsi denenir ve gazetteer'ın verdiği güven
 * skoru en yüksek olan seçilir. Kombinasyon sayısı küçük (en fazla ~24) ve her
 * çözüm indeksli sorgu olduğu için tamamı milisaniyeler sürer.
 */

const metin = require('./metin');
const adres = require('./adres');

/**
 * @param {object} db            adres.ac() ile açılmış veritabanı
 * @param {object} belge
 *   @param {object} [belge.etiket]   { ilIlce, semtMahalle, acikAdres }
 *   @param {string} [belge.govde]    fatura adresi / SAYIN bloğu, serbest metin
 *   @param {string} [belge.elYazisi] el yazısıyla yazılmış adres (varsa)
 * @returns {object} çözüm + hangi alanın nereden geldiği + uyarılar
 */
function cozBelge(db, belge = {}) {
  const ilceler = adres.ilceAdlari(db);

  /* Her kaynağı kendi biçimine uygun ayrıştır. */
  const kaynaklar = {};
  if (belge.etiket) kaynaklar.etiket = metin.ayiklaEtiket(belge.etiket, ilceler);
  if (belge.govde) kaynaklar.govde = metin.ayiklaSerbest(belge.govde, ilceler);
  if (belge.elYazisi) kaynaklar.elYazisi = metin.ayiklaSerbest(belge.elYazisi, ilceler);
  /* SERBEST: hiç yapılandırılmamış ham OCR çıktısı. Sürücü belgenin sadece bir
     köşesini çektiğinde, ya da adresi telefon ekranından okuttuğunda elimizde
     "şu blok fatura adresi, bu blok etiket" bilgisi olmaz — tek bir metin
     yığını olur. Aynı ayıklayıcıdan geçirilir. */
  if (belge.serbest) kaynaklar.serbest = metin.ayiklaSerbest(belge.serbest, ilceler);

  /* Alan başına aday değerler — kaynak adıyla birlikte, tekrarsız.
     Ayıklayıcı tek bir değer değil ADAY LİSTESİ veriyor: e-İrsaliyede müşteri
     adı adresin solunda duruyor ve nerede bittiği belli olmadığı için
     "akpinar" / "turhal akpinar" / "huriye turhal akpinar" hepsi denenir. */
  const COKLU = { mahalle: 'mahalleAdaylar', yol: 'yolAdaylar', kapino: 'kapinoAdaylar' };
  const alanlar = ['ilce', 'mahalle', 'yol', 'kapino'];
  const adaylar = {};
  for (const a of alanlar) {
    const gorulen = new Set();
    adaylar[a] = [];
    for (const [ad, k] of Object.entries(kaynaklar)) {
      if (!k) continue;
      const liste = COKLU[a] && Array.isArray(k[COKLU[a]]) && k[COKLU[a]].length
        ? k[COKLU[a]] : (k[a] == null ? [] : [k[a]]);
      for (const d of liste) {
        if (d == null || String(d).trim() === '') continue;
        const anahtar = metin.sade(d);
        if (gorulen.has(anahtar)) continue;
        gorulen.add(anahtar);
        adaylar[a].push({ deger: d, kaynak: ad });
      }
    }
    adaylar[a].push({ deger: null, kaynak: 'yok' });   // alanın hiç olmaması da bir seçenek
  }

  /* ADAYLARI ÖNCE ELE, SONRA BİRLEŞTİR.
     Aday listeleri çarpıldığında kombinasyon sayısı hızla büyüyor (3 mahalle
     x 5 yol x 2 kapı x 2 ilçe = 60'ın üstü). Oysa mahalle adaylarının çoğu
     gazetteer'da hiç yok — "huriye turhal akpinar" diye bir mahalle yok.
     Var olmayanları ucuz bir sorguyla eleyince geriye tek aday kalıyor ve
     kombinasyon sayısı bir avuca iniyor. */
  const ilceler2 = adaylar.ilce.filter((x) => x.deger != null).map((x) => x.deger);
  const yasayanMahalle = adaylar.mahalle.filter((x) => {
    if (x.deger == null) return false;
    if (!ilceler2.length) return adres.mahalleBul(db, x.deger, null).adaylar.length > 0;
    return ilceler2.some((il) => adres.mahalleBul(db, x.deger, il).adaylar.length > 0);
  });
  if (yasayanMahalle.length) adaylar.mahalle = yasayanMahalle;

  /* İLÇE BİLİNİYORSA MUTLAKA KULLANILIR — "ilçesiz" seçeneği kaldırılır.
     Nedeni ölçüldü: el yazısıyla "Atatürk Mah" yazan bir belgede ilçe serbest
     bırakılınca motor, Sarayköy'deki ATATÜRK mahallesini bulup 20 km uzağa
     yeşil ışık yaktı. Bir teslimat belgesindeki adres tek bir ilçededir;
     ilçe kısıtı doğruluğu artırır, kaybettirmez. */
  if (adaylar.ilce.some((a) => a.deger != null)) {
    adaylar.ilce = adaylar.ilce.filter((a) => a.deger != null);
  }

  /* Tüm kombinasyonları dene, en yüksek güveni seç. */
  let enIyi = null;
  const denenen = [];
  for (const ilce of adaylar.ilce) {
    for (const mahalle of adaylar.mahalle) {
      /* Mahallesiz kombinasyon yalnız ilçe biliniyorsa denenir — adres.coz()
         o durumda sokağı ilçenin tamamında arıyor (sanayi/mevki adresleri). */
      if (mahalle.deger == null && ilce.deger == null) continue;
      for (const yol of adaylar.yol) {
        for (const kapino of adaylar.kapino) {
          const bilesen = { ilce: ilce.deger, mahalle: mahalle.deger, yol: yol.deger, kapino: kapino.deger };
          /* MAĞAZANIN KENDİ ADRESİNİ TESLİMAT SANMA.
             Tam sayfa okutulduğunda belgenin başlığındaki Media Markt adresi
             de metne giriyor ve Denizli'de gerçek bir adres olduğu için
             gazetteer onu memnuniyetle çözüyor — sürücüyü mağazanın kapısına
             gönderirdi. */
          if (metin.gondericiAdresiMi(bilesen.mahalle, bilesen.yol)) continue;
          const c = adres.coz(db, bilesen);
          const kayit = {
            guven: c.guven, keskinlik: c.keskinlik,
            kaynak: { ilce: ilce.kaynak, mahalle: mahalle.kaynak, yol: yol.kaynak, kapino: kapino.kaynak },
            bilesen, cozum: c,
          };
          denenen.push(kayit);
          /* EŞİTLİKTE SOKAĞA DAHA YAKIN OLAN KAZANIR.
             Ölçüldü: Karaman'da etiketin verdiği "no: 7" ile faturanın verdiği
             "no: 281" aynı puanı aldı (ikisi de sokağa yakın) ve sıralamada
             önce gelen etiket kazandı — ama doğrusu 281'di. Kapının sokak
             çizgisine uzaklığı burada tarafsız hakem: 281 → 11 m, 7 → 21 m. */
          if (!enIyi || c.guven > enIyi.guven ||
              (c.guven === enIyi.guven && c.keskinlik === 'kapi' && enIyi.cozum.keskinlik === 'kapi' &&
               c.yolaUzaklik != null && enIyi.cozum.yolaUzaklik != null &&
               c.yolaUzaklik < enIyi.cozum.yolaUzaklik)) enIyi = kayit;
        }
      }
    }
  }

  if (!enIyi) {
    return { guven: 0, renk: 'kirmizi', keskinlik: 'yok', lat: null, lng: null,
             uyarilar: ['Adres okunamadı — hiçbir kaynakta mahalle bulunamadı'], kaynaklar, denenen: 0 };
  }

  const sonuc = { ...enIyi.cozum };
  sonuc.kaynak = enIyi.kaynak;
  sonuc.denenen = denenen.length;
  sonuc.uyarilar = [...(sonuc.notlar || [])];

  /* --- Sürücüye gösterilecek uyarılar --- */

  /* El yazısı varsa her hâlükârda kontrol istenir. Bir belgede basılı adres
     tamamen çizilip yerine el yazısı yenisi yazılmıştı; bunu sessizce geçmek
     sürücüyü yanlış eve gönderir. */
  if (belge.elYazisi) {
    sonuc.uyarilar.unshift('Belgede el yazısıyla adres var — basılı adresle karşılaştır');
    sonuc.elYazisiVar = true;
    if (sonuc.guven > adres.ESIK.sari) sonuc.guven = adres.ESIK.sari;   // en fazla "sarı"
  }

  /* Etiket ile gövde sokak/kapı konusunda çelişiyorsa sürücü bilsin. */
  const celiski = celiskiBul(kaynaklar);
  if (celiski.length) {
    sonuc.uyarilar.push(...celiski);
    sonuc.celiskiVar = true;
  }

  /* KAPI NUMARASI NET OKUNAMADIYSA SONUÇ YEŞİL OLAMAZ.
     Ölçüldü: bulanık bir fotoğrafta Tesseract "No:96"yı "65" okudu; 65
     numaralı kapı o sokakta gerçekten var olduğu için motor 72 puanla YEŞİL
     dedi ve sürücüyü sessizce yanlış eve gönderirdi. Motor bunu kendi başına
     bilemez — okumanın ne kadar güvenilir olduğunu yalnız OCR biliyor.
     Sayfanın TAMAMININ güvenine bakmak fazla sert: filigran, kenar gürültüsü
     ve el yazısı ortalamayı düşürüyor, doğru okunan adresler de sarıya
     iniyordu. O yüzden yalnız SEÇİLEN KAPI NUMARASINI taşıyan sözcüğün
     güvenine bakılıyor — hata oradaysa asıl orada. */
  if (sonuc.kapino && Array.isArray(belge.ocrKelimeler) && belge.ocrKelimeler.length) {
    const aranan = metin.sade(sonuc.kapino);
    const ilgili = belge.ocrKelimeler.filter((k) => metin.sade(k.metin).includes(aranan));
    if (ilgili.length) {
      const enIyi = Math.max(...ilgili.map((k) => k.guven));
      if (enIyi < 70 && sonuc.guven > adres.ESIK.sari) {
        sonuc.guven = adres.ESIK.sari;
        sonuc.uyarilar.push(`Kapı numarası net okunamadı (%${Math.round(enIyi)}) — "${sonuc.kapino}" doğru mu, bir bak`);
        sonuc.ocrSupheli = true;
      }
    }
  }

  sonuc.renk = sonuc.guven >= adres.ESIK.yesil ? 'yesil'
             : sonuc.guven >= adres.ESIK.sari ? 'sari' : 'kirmizi';
  sonuc.kaynaklar = kaynaklar;
  return sonuc;
}

/** Etiket ile fatura gövdesi arasındaki sokak/kapı çelişkilerini listeler. */
function celiskiBul(k) {
  const uyari = [];
  const e = k.etiket, g = k.govde;
  if (!e || !g) return uyari;
  if (e.yol && g.yol && metin.sade(e.yol) !== metin.sade(g.yol)) {
    uyari.push(`Sokak çelişkisi — etiket: "${e.yol}", fatura: "${g.yol}" (fatura esas alındı)`);
  }
  if (!e.yol && g.yol) {
    uyari.push('Etikette sokak adı yok, fatura gövdesinden alındı');
  }
  if (e.kapino && g.kapino && metin.sade(e.kapino) !== metin.sade(g.kapino)) {
    uyari.push(`Kapı no çelişkisi — etiket: "${e.kapino}", fatura: "${g.kapino}"`);
  }
  return uyari;
}

module.exports = { cozBelge, celiskiBul };

  };

  kayit['./rota'] = function (module, exports, require) {
'use strict';
/**
 * DURAK SIRALAMA — GEZGİN SATICI (açık uçlu)
 * ==========================================
 *
 * Girdi : başlangıç konumu (sürücünün o anki yeri) + N durak
 * Çıktı : durakların gidiş sırası + toplam mesafe/süre tahmini
 *
 * DURAK SAYISINDA ALT VEYA ÜST SINIR YOKTUR.
 * 1 durak da, 7 durak da, 30 durak da, 80 durak da aynı yoldan geçer.
 * "En az şu kadar durak olsun" diye bir kural yok; sürücü o gün kaç fatura
 * okuttuysa o kadar durakla rota çıkar. Gün içinde durak eklenir veya bir
 * durak "teslim edildi" olursa, kalanlarla yeniden sıralamak yeterli.
 *
 * AÇIK UÇLU — DÖNÜŞ YOK
 * ---------------------
 * Klasik gezgin satıcı başladığı yere döner. Burada dönmüyoruz: sürücü son
 * teslimatı yapınca işi biter, depoya dönmek rotanın parçası değil. Bu fark
 * önemli — kapalı tur için yazılmış bir çözücü, son durağı başlangıca yakın
 * seçmeye çalışıp gereksiz zikzak yaptırır.
 *
 * İKİ AŞAMA
 * ---------
 * 1) EN YAKIN KOMŞU: baştan başla, her adımda en yakın gidilmemiş durağa git.
 *    Hızlı ama kısa görüşlü — sona kalan uzak duraklar için uzun sıçramalar
 *    üretir.
 * 2) İYİLEŞTİRME (2-opt + Or-opt): elde edilen sırayı, daha fazla iyileşme
 *    kalmayana kadar yerel takaslarla düzelt. Tipik kazanç %10-20.
 *
 * ASİMETRİ UYARISI
 * ----------------
 * Gerçek yol süreleri asimetriktir (tek yön, dönüş yasağı): A→B ile B→A aynı
 * değildir. 2-opt bir parçayı TERS ÇEVİRDİĞİ için asimetrik matriste maliyeti
 * yanlış hesaplar. Bu yüzden matris asimetrikse 2-opt kapatılır, yalnız
 * Or-opt (parça taşıma — yön değiştirmez) kullanılır. Kuş uçuşu matris
 * simetriktir, orada ikisi de çalışır.
 */

/* Şehir içi ortalama seyir hızı ve durak başına ortalama işlem süresi.
   Gerçek yol süresi matrisi verilirse hız kullanılmaz; yalnız kuş uçuşu
   matriste süre tahmini için gerekir. */
const VARSAYILAN = {
  hizKmS: 25,          // Denizli şehir içi, trafik dâhil kaba ortalama
  durakDakika: 6,      // park + kapıya çıkma + teslim + imza
  dolambacKatsayisi: 1.35,  // kuş uçuşu mesafeyi gerçek yola yaklaştırır
};

/* ------------------------------------------------------------- mesafe */

const DUNYA_YARICAP = 6371000;

/** İki koordinat arası kuş uçuşu mesafe (metre). */
function kusUcusu(a, b) {
  const d = Math.PI / 180;
  const x = (b.lat - a.lat) * d;
  const y = (b.lng - a.lng) * d;
  const la = a.lat * d, lb = b.lat * d;
  const h = Math.sin(x / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(y / 2) ** 2;
  return 2 * DUNYA_YARICAP * Math.asin(Math.sqrt(h));
}

/**
 * Kuş uçuşu mesafe matrisi.
 *
 * Gerçek yol süresi yerine geçen ücretsiz ve internetsiz seçenek. Dolambaç
 * katsayısıyla çarpılıyor: şehir içinde araç, kuş uçuşundan ortalama %35 daha
 * fazla yol gidiyor. Sıralama için bu yaklaşım genellikle yeterli; gerçek
 * yol matrisi (OpenRouteService) verilirse o kullanılır.
 */
function kusUcusuMatris(noktalar, katsayi = VARSAYILAN.dolambacKatsayisi) {
  const n = noktalar.length;
  const m = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = kusUcusu(noktalar[i], noktalar[j]) * katsayi;
      m[i][j] = d; m[j][i] = d;
    }
  }
  return m;
}

/** Matris simetrik mi? (asimetrikse 2-opt kullanılamaz) */
function simetrikMi(m) {
  const n = m.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = m[i][j], b = m[j][i];
      if (Math.abs(a - b) > Math.max(1, a * 0.02)) return false;   // %2 tolerans
    }
  }
  return true;
}

/* -------------------------------------------------------- çözüm adımları */

/** Bir sıranın toplam maliyeti (açık uç — son duraktan sonrası sayılmaz). */
function maliyet(sira, m) {
  let t = 0;
  for (let i = 0; i < sira.length - 1; i++) t += m[sira[i]][sira[i + 1]];
  return t;
}

/** 1. aşama — en yakın komşu. Başlangıç her zaman 0 indeksli düğüm. */
function enYakinKomsu(m) {
  const n = m.length;
  const gidildi = new Uint8Array(n);
  const sira = [0];
  gidildi[0] = 1;
  let simdi = 0;
  for (let adim = 1; adim < n; adim++) {
    let enIyi = -1, enKisa = Infinity;
    for (let j = 1; j < n; j++) {
      if (gidildi[j]) continue;
      if (m[simdi][j] < enKisa) { enKisa = m[simdi][j]; enIyi = j; }
    }
    sira.push(enIyi); gidildi[enIyi] = 1; simdi = enIyi;
  }
  return sira;
}

/**
 * 2-opt — iki kenarı kesip aradaki parçayı TERS ÇEVİRİR.
 * Yalnız simetrik matriste doğrudur (bkz. dosya başındaki asimetri uyarısı).
 * Başlangıç düğümü (indeks 0) sabit kalır.
 */
function ikiOpt(sira, m) {
  const n = sira.length;
  let iyilesti = true;
  while (iyilesti) {
    iyilesti = false;
    for (let i = 1; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = sira[i - 1], b = sira[i], c = sira[j];
        const e = j + 1 < n ? sira[j + 1] : -1;
        /* Son düğümden sonrası olmadığı için o kenar hesaba katılmaz. */
        const once = m[a][b] + (e >= 0 ? m[c][e] : 0);
        const sonra = m[a][c] + (e >= 0 ? m[b][e] : 0);
        if (sonra < once - 1e-9) {
          let l = i, r = j;
          while (l < r) { const t = sira[l]; sira[l] = sira[r]; sira[r] = t; l++; r--; }
          iyilesti = true;
        }
      }
    }
  }
  return sira;
}

/**
 * Or-opt — 1-3 duraklık bir parçayı olduğu gibi (yönünü bozmadan) başka bir
 * yere taşır. Asimetrik matriste de doğrudur, o yüzden tek başına da
 * kullanılabiliyor.
 */
function orOpt(sira, m, enFazlaParca = 3) {
  const n = sira.length;
  let iyilesti = true;
  while (iyilesti) {
    iyilesti = false;
    for (let uzunluk = 1; uzunluk <= enFazlaParca; uzunluk++) {
      for (let i = 1; i + uzunluk <= n; i++) {
        const parca = sira.slice(i, i + uzunluk);
        const kalan = sira.slice(0, i).concat(sira.slice(i + uzunluk));
        const simdikiMaliyet = maliyet(sira, m);
        for (let k = 1; k <= kalan.length; k++) {
          if (k === i) continue;                       // aynı yere koymak anlamsız
          const aday = kalan.slice(0, k).concat(parca, kalan.slice(k));
          if (maliyet(aday, m) < simdikiMaliyet - 1e-9) {
            sira.length = 0; sira.push(...aday);
            iyilesti = true; break;
          }
        }
        if (iyilesti) break;
      }
      if (iyilesti) break;
    }
  }
  return sira;
}

/* ------------------------------------------------------------- ana giriş */

/**
 * @param {{lat:number,lng:number}} baslangic  sürücünün o anki konumu
 * @param {Array<{lat:number,lng:number}>} duraklar  herhangi bir sayıda (0 dâhil)
 * @param {object} [secenek]
 *   @param {number[][]} [secenek.matris]  gerçek yol süresi/mesafesi matrisi
 *          (n+1 boyutlu, 0. satır/sütun başlangıç). Verilmezse kuş uçuşu.
 *   @param {'mesafe'|'sure'} [secenek.birim]  matrisin birimi (varsayılan mesafe/metre)
 * @returns {{sira:number[], adimlar:Array, toplamMetre:number, toplamDakika:number, yontem:string}}
 *          `sira` = duraklar dizisindeki indeksler, gidiş sırasıyla.
 */
function sirala(baslangic, duraklar, secenek = {}) {
  const N = duraklar.length;

  /* SINIR YOK — sıfır, bir ve iki durak da geçerli girdidir. */
  if (N === 0) return { sira: [], adimlar: [], toplamMetre: 0, toplamDakika: 0, yontem: 'bos' };
  if (N === 1) {
    const m = secenek.matris || kusUcusuMatris([baslangic, duraklar[0]]);
    return sonuclandir([0, 1], m, duraklar, secenek, 'tek-durak');
  }

  const noktalar = [baslangic, ...duraklar];
  const m = secenek.matris || kusUcusuMatris(noktalar);
  if (m.length !== N + 1) {
    throw new Error(`Matris boyutu ${m.length}, beklenen ${N + 1} (başlangıç + ${N} durak)`);
  }

  let sira = enYakinKomsu(m);
  const simetrik = secenek.matris ? simetrikMi(m) : true;
  if (simetrik) sira = ikiOpt(sira, m);
  sira = orOpt(sira, m);
  if (simetrik) sira = ikiOpt(sira, m);     // taşımadan sonra bir tur daha

  return sonuclandir(sira, m, duraklar, secenek, simetrik ? '2opt+oropt' : 'oropt');
}

function sonuclandir(sira, m, duraklar, secenek, yontem) {
  const birim = secenek.birim || 'mesafe';
  const adimlar = [];
  let toplam = 0;
  for (let i = 0; i < sira.length - 1; i++) {
    const d = m[sira[i]][sira[i + 1]];
    toplam += d;
    adimlar.push({
      sira: i + 1,
      durakIndeksi: sira[i + 1] - 1,          // 0. düğüm başlangıç, duraklar 1'den başlar
      durak: duraklar[sira[i + 1] - 1],
      oncekindenMetre: birim === 'mesafe' ? Math.round(d) : null,
      oncekindenDakika: birim === 'sure' ? Math.round(d / 60) : Math.round(d / 1000 / VARSAYILAN.hizKmS * 60),
    });
  }
  const yolDakika = birim === 'sure'
    ? Math.round(toplam / 60)
    : Math.round(toplam / 1000 / VARSAYILAN.hizKmS * 60);
  return {
    sira: sira.slice(1).map((d) => d - 1),
    adimlar,
    toplamMetre: birim === 'mesafe' ? Math.round(toplam) : null,
    toplamDakika: yolDakika + duraklar.length * VARSAYILAN.durakDakika,
    yolDakika,
    islemDakika: duraklar.length * VARSAYILAN.durakDakika,
    yontem,
  };
}

module.exports = {
  sirala, kusUcusu, kusUcusuMatris, simetrikMi, maliyet,
  enYakinKomsu, ikiOpt, orOpt, VARSAYILAN,
};

  };

  kayit['./ors'] = function (module, exports, require) {
'use strict';
/**
 * GERÇEK YOL SÜRESİ — OpenRouteService
 * ====================================
 *
 * Rota sıralaması varsayılan olarak kuş uçuşu mesafeyi × 1,35 kullanıyor.
 * Yoğun bir şehir içi turda bu yeterli sıralamayı veriyor, ama Denizli'nin
 * coğrafyası buna hep uymuyor: Çivril 100 km ötede ve arada dağ var,
 * bazı mahalleler arasında kuş uçuşu 800 m olan yol 3 km sürüyor.
 * Gerçek yol süresi bu durumlarda sırayı belirgin biçimde düzeltiyor.
 *
 * NEDEN ORS
 * ---------
 * Araştırıldı ve ölçüldü (2026-08-30):
 *   - Tek istekte 3.500 nokta çifti → 59 durak + başlangıç TEK çağrıya sığıyor.
 *     Mapbox'ta 25 koordinat tavanı var, aynı iş ~20 parçalı istek demek.
 *   - Günde 500 istek ücretsiz; günlük ihtiyaç 1-3. Kullanım oranı %0,6.
 *   - KREDİ KARTI İSTEMİYOR. Kota aşılırsa ücret değil hata dönüyor —
 *     "sıfır maliyet" şartı için kusur değil, özellik.
 *   - Ticari kullanım serbest (GraphHopper'ın ücretsiz planı değil,
 *     HERE rota optimizasyonunu sözleşmeyle yasaklıyor).
 *
 * ⚠️ KİŞİSEL VERİ GÖNDERİLMEZ
 * ORS kullanım şartları "Transmit personal data" maddesiyle bunu yasaklıyor.
 * Bu dosya YALNIZ [boylam, enlem] çiftleri gönderiyor — isim, telefon,
 * açık adres, belge numarası hiçbir zaman ağa çıkmıyor.
 *
 * ⚠️ ATIF ZORUNLU
 * Ekranda ya da hakkında bölümünde:
 *   "© openrouteservice by HeiGIT | Data from OpenStreetMap"
 *
 * ANAHTAR NASIL ALINIR (ücretsiz, kart yok)
 *   1. openrouteservice.org/dev/#/signup  → kayıt ol
 *   2. Dashboard > Request a token > "Standard" planı seç
 *   3. Anahtarı uygulamada Arşiv > Yol süresi bölümüne yapıştır
 */

const UC = 'https://api.openrouteservice.org/v2/matrix/driving-car';

/* Tek istekte izin verilen azami nokta çifti. 59×59 = 3.481 ≤ 3.500. */
const AZAMI_NOKTA = 59;

/**
 * Yol süresi matrisi alır.
 *
 * @param {Array<{lat:number,lng:number}>} noktalar  0. eleman başlangıç
 * @param {string} anahtar   ORS API anahtarı
 * @param {object} [secenek]
 *   @param {function} [secenek.getir]  fetch yerine geçecek işlev (test için)
 *   @param {'sure'|'mesafe'} [secenek.birim]  varsayılan 'sure' (saniye)
 * @returns {Promise<number[][]>}  n×n matris
 * @throws  ağ/kota/anahtar hatalarında — çağıran kuş uçuşuna düşmeli
 */
async function matrisAl(noktalar, anahtar, secenek = {}) {
  if (!anahtar) throw new Error('ORS anahtarı yok');
  if (!noktalar || noktalar.length < 2) throw new Error('En az iki nokta gerekli');
  if (noktalar.length > AZAMI_NOKTA) {
    /* 59'dan fazla durak bu ucun tek istekte kaldırabileceğinden çok.
       Parçalayıp birleştirmek mümkün ama gerçek bir günde 59 durağı aşmak
       nadir; şimdilik açıkça hata verip kuş uçuşuna düşülüyor — sessizce
       yanlış bir matris üretmektense. */
    throw new Error(`ORS tek istekte en fazla ${AZAMI_NOKTA} nokta alıyor (${noktalar.length} verildi)`);
  }

  const getir = secenek.getir || (typeof fetch !== 'undefined' ? fetch : null);
  if (!getir) throw new Error('fetch yok');

  const olcut = secenek.birim === 'mesafe' ? 'distance' : 'duration';
  const yanit = await getir(UC, {
    method: 'POST',
    headers: {
      'Authorization': anahtar,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      /* ORS [boylam, enlem] istiyor — enlem/boylam sırası ters.
         Bu, ORS ile çalışırken en sık yapılan hata; karıştırılırsa
         koordinatlar Afrika kıyısına düşer ve matris anlamsız çıkar. */
      locations: noktalar.map((n) => [n.lng, n.lat]),
      metrics: [olcut],
      units: 'm',
    }),
  });

  if (!yanit.ok) {
    const govde = await yanit.text().catch(() => '');
    if (yanit.status === 403) throw new Error('ORS anahtarı geçersiz veya günlük kota doldu');
    if (yanit.status === 429) throw new Error('ORS hız sınırı — biraz sonra tekrar dene');
    throw new Error(`ORS hatası ${yanit.status}: ${govde.slice(0, 120)}`);
  }

  const veri = await yanit.json();
  const matris = olcut === 'duration' ? veri.durations : veri.distances;
  if (!Array.isArray(matris) || matris.length !== noktalar.length) {
    throw new Error('ORS beklenmeyen yanıt verdi');
  }

  /* ORS ulaşılamayan noktalar için null döndürüyor (yol ağına bağlanmayan
     bir kapı, ada üzerinde bir nokta vb.). Sıralayıcı sayı bekliyor;
     bu hücreler kuş uçuşuyla dolduruluyor ki tek bir erişilemez durak
     bütün rotayı bozmasın. */
  let bosluk = 0;
  for (let i = 0; i < matris.length; i++) {
    for (let j = 0; j < matris[i].length; j++) {
      if (typeof matris[i][j] === 'number') continue;
      bosluk++;
      const m = kusUcusu(noktalar[i], noktalar[j]) * 1.35;
      matris[i][j] = olcut === 'duration' ? m / 1000 / 25 * 3600 : m;
    }
  }
  return Object.assign(matris, { bosluk, birim: olcut === 'duration' ? 'sure' : 'mesafe' });
}

function kusUcusu(a, b) {
  const R = 6371000, d = Math.PI / 180;
  const x = (b.lat - a.lat) * d, y = (b.lng - a.lng) * d;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin(y / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Anahtar biçimsel olarak makul mü? (yarım yapıştırmayı erken yakalar)
 *
 * ORS anahtar biçimini değiştirdi: eskiden `5b3ce359785111...` gibi düz
 * onaltılık bir dizgeydi, şimdi base64 kodlanmış bir JWT geliyor —
 * `eyJv…In0=` biçiminde, ~120 karakter ve SONUNDA `=` dolgusu olabiliyor.
 * İlk yazılan desen `=` kabul etmediği için gerçek anahtarı reddediyordu.
 * Bu yüzden base64'ün tüm karakterleri (`+/=`) ve JWT noktası kabul ediliyor.
 *
 * Amaç anahtarı DOĞRULAMAK değil — onu ancak sunucu yapabilir. Amaç, yarım
 * kopyalanmış ya da yanlış yere yapıştırılmış bir metni kaydetmeden önce
 * yakalamak.
 */
function anahtarGecerliMi(a) {
  return typeof a === 'string' && /^[A-Za-z0-9._\-+/=]{30,}$/.test(a.trim());
}

module.exports = { matrisAl, anahtarGecerliMi, AZAMI_NOKTA, UC, ATIF: '© openrouteservice by HeiGIT | Data from OpenStreetMap' };

  };

  global.Motor = {
    metin: require('./metin'),
    adres: require('./adres'),
    kaynakPaket: require('./kaynak-paket'),
    fatura: require('./fatura'),
    rota: require('./rota'),
    ors: require('./ors'),
    surum: '20260830185945',
  };
})(typeof self !== 'undefined' ? self : this);
