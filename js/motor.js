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
                 /* "san" KISALTMASI gürültü, "sanayi" DEĞİL.
                    Ölçüldü: Denizli adres verisinde adında SANAYİ geçen
                    85 ayrı sokak var — "SANAYİ SİTESİ", "1.SANAYİ" …
                    "8.SANAYİ" (Kale/Uluçam), "ORGANİZE SANAYİ" (Honaz),
                    "KÜÇÜK SANAYİ SİTESİ" (Bekilli, Tavas). "sanayi"
                    gürültü sayıldığı sürece bu adreslerin HİÇBİRİ
                    çözülemiyordu; sürücünün "sanayi sitesi diye adres var,
                    numaraları bile var" dediği durum tam olarak buydu.
                    Firma ünvanları zaten "tic/ticaret/ltd/sti/san" ile
                    yakalanıyor; "sanayi"yi de eklemeye gerek yok. */
                 'tic', 'ticaret', 'san', 'as', 'kolektif',
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
/* Belirteçler ÇOK SÖZCÜKLÜ ve göndericiye özgü seçildi.
   İlk sürümde tek başına "büyükdere" vardı ve bu, içinde o sözcük geçen
   HER satırı siliyordu — müşterinin adresi öyle bir sokakta olsaydı kapı
   numarası sessizce kaybolurdu. Tek sözcüklü, genel bir yer adını buraya
   koymak bu yüzden tehlikeli: eleme satırın tamamını götürüyor. */
/* Karşılaştırma SADELEŞTİRİLMİŞ metin üzerinde yapılıyor, ham metin üzerinde
   değil. Sebebi Türkçe'nin klasik tuzağı: JavaScript'te "ESKİ".toLowerCase()
   noktalı bir i üretiyor ve `/eski/i` deseniyle EŞLEŞMİYOR. İlk sürümde
   desenler ham metne uygulanıyordu ve "ESKİ BÜYÜKDERE", "YEŞİLCE" gibi
   büyük harfli başlıklar hiç yakalanmıyordu. */
const GONDERICI_BELIRTECLERI = [
  'media markt',
  'eski buyukdere',        // genel merkez caddesi — iki sözcük birlikte
  'yesilce mah',           // genel merkez mahallesi
  'kagithane',
  'marmara kurumlar',
  'teras park avm',
  'chamber of commerce',
  'ticaret sicil',
];

function gondericiSatiriMi(satir) {
  const s = sade(satir);
  return GONDERICI_BELIRTECLERI.some((b) => s.includes(b));
}

function kapiNoAdaylari(metin) {
  if (!metin) return [];
  /* Gönderici satırları baştan atılıyor. Satır satır bakılıyor çünkü
     gönderici bilgisi belgenin başında kendi satırlarında duruyor. */
  metin = String(metin).split(/\r?\n/).filter((s) => !gondericiSatiriMi(s)).join('\n');
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

  /* Buraya kadar bulunanlar AÇIKÇA "No:" ile işaretlenmiş olanlar. */
  const acikSayi = a.length;

  /* e-İrsaliyelerin çoğunda "No:" HİÇ YOK; onun yerine "Apt: 14 D: 14" yazıyor.
     Türkiye'de apartman numarası pratikte kapı numarasıdır, o yüzden aday
     olarak deneniyor — ama TAHMİN olduğu için "No:" değerlerinden sonra
     sıraya giriyor ve puanlamada onlara öncelik veriliyor (bkz. fatura.js).
     Kural: "No:" varsa o kullanılır; yoksa "Apt:" kapı numarası sayılır. */
  const aptRe = /\b(?:apt|apartmani|apartman|bina|blok)\s*[:.]?\s*(\d{1,4}[a-zA-Z]?)/gi;
  while ((m = aptRe.exec(String(metin))) !== null) { ekle(m[1]); if (a.length >= 8) break; }

  /* "N:1" — kısaltılmış numara işareti. İki nokta ZORUNLU tutuluyor:
     "N" tek başına metinde her yerde geçiyor, ":" onu belirteç yapıyor. */
  const nRe = /\bn\s*[:.]\s*(\d{1,4}[a-zA-Z]?)\b/gi;
  while ((m = nRe.exec(String(metin))) !== null) { ekle(m[1]); if (a.length >= 8) break; }

  /* YOL EKİNDEN HEMEN SONRA GELEN ÇIPLAK SAYI.
     Gerçek belge: "ÇAKMAK MAH 134/1 SOK 9 DAİRE 6" — hiç "No:" yok, kapı
     numarası sokağın hemen ardında. Bu biçim yakalanmadığı için kapı
     numarası tamamen düşüyordu.
     Yol ekinden ÖNCEKİ sayı alınmıyor: orası sokağın kendi adı ("134/1 SOK").
     Ardından bir ek daha geliyorsa (no/apt/daire) o kendi kuralıyla
     yakalanacağı için burada atlanıyor. */
  const cipRe = /\b(?:sokak|sokagi|sok|sk|caddesi|cadde|cad|cd|bulvari|bulvar|blv|bul)\s*[.:]?\s*(\d{1,4}[a-zA-Z]?)(?=\s|$|,)/gi;
  while ((m = cipRe.exec(String(metin))) !== null) {
    const kalan = String(metin).slice(m.index + m[0].length, m.index + m[0].length + 24);
    /* Sayının ardından "sokak/cadde" geliyorsa o sayı yol adının parçası. */
    if (/^\s*(?:sok|sk|cad|cd|blv|bul)/i.test(kalan)) continue;
    /* BARKOD GÜRÜLTÜSÜ — ölçülmüş sessiz yanlış.
       Gerçek belgede satır şöyle okunuyordu:
         "BOZKURT, İNCELER MAH. 3046 SK. 2 9819001041479147"
       Sondaki uzun sayı club kart barkodu; ondan önceki tek haneli "2" de
       barkodun ilk hanesinin ayrı okunmuş hâli. Motor bunu kapı numarası
       sanıp %95 güvenle yanlış eve gönderiyordu (doğrusu 11'di).
       Ardından 8+ haneli bir sayı geliyorsa bu numara kapı değildir. */
    if (/^\s*\d{8,}/.test(kalan)) continue;
    ekle(m[1]);
    if (a.length >= 10) break;
  }

  /* Hangilerinin açık "No:" olduğu çağırana bildiriliyor. */
  a.acik = a.slice(0, acikSayi);
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
function yolAdaylari(sadeAyrik, ham, capa) {
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
  return egikSayiliDuzelt(hepsi.length ? hepsi : yolAdaylariEksiz(sadeAyrik, capa), ham);
}

/**
 * EĞİK ÇİZGİLİ NUMARALI SOKAKLAR — "1490/1"
 * =========================================
 *
 * Denizli'de aynı numaranın birden çok kolu var: Karaman mahallesinde
 * 1490, 1490/1, 1490/2, 1490/3, 1490/4, 1490/5 diye ALTI AYRI SOKAK.
 * Bunlar birbirinden yüzlerce metre uzakta olabiliyor.
 *
 * sade() eğik çizgiyi boşluğa çeviriyor (veritabanındaki ad da aynı işlemden
 * geçtiği için eşleşme buna göre kuruluyor): "1490/1" → "1490 1". Ama bu,
 * aday üreticinin gözünde İKİ SÖZCÜK. Ölçülen sonuç:
 *
 *   "1490/1 SOKAK"  → adaylar: ["1", "1490 1"]        → "1" kazanıyordu
 *   "1490/1 Apt:12" → adaylar: ["1490 1", "1490"]     → "1490" kazanıyordu
 *
 * İkisi de gerçek sokak olduğu için gazetteer itiraz etmiyor; sürücü emin
 * adımlarla yanlış sokağa gidiyor ve kapı numarası orada bulunmadığı için
 * kapı da düşüyor. Kullanıcının bildirdiği "1490/1'i algılamıyor, o yüzden
 * kapı numarasını da algılamıyor" tam olarak budur.
 *
 * Çözüm: belgede "1490/1" yazıyorsa parçaları ("1490" ve "1") aday
 * listesinden ÇIKAR ve tam hâli başa al. Belge daha özgül bir ad yazmış;
 * onu genelleştirmek bilgi kaybı.
 */
function egikSayiliDuzelt(adaylar, ham) {
  if (!ham || !adaylar.length) return adaylar;
  const ciftler = [];
  const re = /(\d{1,5})\s*\/\s*(\d{1,4})/g;
  let m;
  while ((m = re.exec(String(ham))) !== null) ciftler.push([m[1], m[2]]);
  if (!ciftler.length) return adaylar;

  let sonuc = adaylar.slice();
  for (const [x, y] of ciftler) {
    const tam = x + ' ' + y;
    if (!sonuc.includes(tam)) continue;      // tam hâli aday değilse dokunma
    sonuc = sonuc.filter((a) => a !== x && a !== y);
    sonuc = [tam, ...sonuc.filter((a) => a !== tam)];
  }
  return sonuc;
}

/**
 * Sokak adı YAZILI ama EKİ YOK olan hâl.
 * Gerçek örnek: "TAŞ MAH 2031/9 NO16" — "2031/9" sokaktır ama "sk" yazmıyor.
 * Mahalle ekinden sonra başlayıp ilk numara/daire işaretine kadar okunur.
 */
/**
 * @param {string} sadeAyrik
 * @param {string[]} [capaSozcukleri] mahalle EKİ yoksa, adres bu sözcüklerden
 *        sonra başlıyor kabul edilir (gazetteer'dan bulunan mahalle adı).
 */
function yolAdaylariEksiz(sadeAyrik, capaSozcukleri) {
  const kelimeler = sadeAyrik.split(' ');
  let bas = -1;
  for (let i = 0; i < kelimeler.length; i++) {
    if (ekMi(kelimeler[i], EK.mahalle)) { bas = i + 1; break; }
  }
  /* MAHALLE EKİ YOKSA MAHALLE ADINDAN SONRA BAŞLA.
     Sanayi ve köy adreslerinde ek yazılmıyor ("KALE ULUÇAM 3. SANAYİ NO:5").
     Mahalle gazetteer taramasıyla bulunduğunda (bkz. adres.metindeMahalleAra)
     adı buraya çapa olarak veriliyor; sokak ondan sonra başlıyor. */
  if (bas < 0 && Array.isArray(capaSozcukleri) && capaSozcukleri.length) {
    for (let i = 0; i + capaSozcukleri.length <= kelimeler.length; i++) {
      let tuttu = true;
      for (let j = 0; j < capaSozcukleri.length; j++) {
        if (kelimeler[i + j] !== capaSozcukleri[j]) { tuttu = false; break; }
      }
      if (tuttu) { bas = i + capaSozcukleri.length; break; }
    }
  }
  if (bas < 0) return [];

  const dur = new Set([...EK.numara, ...EK.daire, ...EK.kat, ...EK.bina, ...GURULTU]);
  const alinan = [];
  for (let i = bas; i < kelimeler.length; i++) {
    const k = kelimeler[i];
    /* "SİTESİ" HEM BİNA EKİ HEM SOKAK ADI PARÇASI.
       "Bağdat Sitesi F Blok" → bina; "SANAYİ SİTESİ" → gerçek bir sokak
       adı (Acıpayam, Bekilli, Tavas'ta kayıtlı). Ayırt edici: bir önceki
       sözcük. "sanayi sitesi" bir bütün, orada durulmuyor. */
    if (dur.has(k) && !(k === 'sitesi' && alinan[alinan.length - 1] === 'sanayi')) break;
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
function ayiklaSerbest(metin, ilceAdlari, capaMahalle) {
  if (!metin) return {};
  const ayrik = ayirEkler(sade(metin));
  const mAday = mahalleAdaylari(ayrik);
  const capa = capaMahalle ? sade(capaMahalle).split(' ').filter(Boolean) : null;
  const yAday = yolAdaylari(ayrik, metin, capa);
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
  const yAday = yolAdaylari(adresAyrik, acikAdres);
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

const { sade, adiSadelestir } = require('./metin');

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
  if (puanli.length) return { adaylar: puanli.slice(0, 3), eslesme: 'bulanik' };

  /* Yol aramasındaki gibi: elle yazılmış "Karaman Mh." gibi bir değerde
     ek atılıp tekrar denenir. */
  const eksiz = adiSadelestir(mahalleAdi);
  if (eksiz && eksiz !== ms) {
    const tekrar = mahalleBul(kaynak, eksiz, ilceAdi);
    if (tekrar.adaylar.length) return { ...tekrar, ekAtildi: true };
  }
  return { adaylar: [], eslesme: null };
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

  /* BOŞLUK FARKI TAM EŞLEŞME SAYILIR.
     Belediye verisi ile faturanın kelimeleri ayırma biçimi tutmuyor:
       veri "PAZARYERİ"        fatura "pazar yeri cad"
       veri "SANAYİSİTESİ"     fatura "sanayi sitesi"
       veri "YUNUSEMRE"        fatura "yunus emre"
     Bunlar farklı sokak değil, aynı sokağın iki yazımı. Boşluklar
     atıldığında birebir tuttuğu için tam eşleşme kabul ediliyor —
     harf farkı yok, yalnız ayırma farkı var. */
  const boslukSuz = ys.replace(/ /g, '');
  if (boslukSuz.length >= 4) {
    y = adlar.filter((r) => r.adAra.replace(/ /g, '') === boslukSuz);
    if (y.length) return { yollar: geometriEkle(y), eslesme: 'tam' };
  }

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

  /* ADRES EKİNİ ATIP TEKRAR DENE — bulanık aramalardan ÖNCE.
     Sıra kritik: "2031/9. sk." için ek atılmadan devam edilirse aşağıdaki
     ortak-sözcük eşleşmesi "2031" belirtecine takılıp aynı mahalledeki
     "2031/1", "2031/2"… sokaklarının hepsini eşit puanla getiriyor ve
     rastgele birini seçiyordu — sürücüyü yanlış sokağa gönderen sessiz bir
     hata. Eki atınca "2031 9" TAM eşleşiyor ve iş bitiyor.
     Ek atmak zarar vermiyor: gerçekten ekiyle kayıtlı yollar ("TOKİ YOLU")
     yukarıdaki tam/önek aşamalarında zaten yakalanmış oluyor. */
  const eksizYol = adiSadelestir(yolAdi);
  if (eksizYol && eksizYol !== ys) {
    const tekrar = yolBul(kaynak, mahalleOid, eksizYol);
    if (tekrar.yollar.length) return { ...tekrar, ekAtildi: true };
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
    /* Tek belirteçle eşleşmeye izin verilirken SAYISAL belirteçler ayrı
       tutuluyor: "2031" belirteci aynı mahalledeki 2031/1, 2031/2, 2031/9…
       sokaklarının hepsinde var ve hepsi eşit puan alıp rastgele biri
       seçiliyordu. Sayısal tek belirteçte adın TAMAMI tutmalı. */
    const yeterli = ortakli.filter((r) => {
      if (r.ortak >= 2) return true;
      if (sorguKelime.length !== 1 || r.oran !== 1) return false;
      return /[a-z]/.test(sorguKelime[0]) || r.adAra === ys;
    });
    if (yeterli.length) {
      const enIyiOran = Math.max(...yeterli.map((r) => r.ortak));
      const kazanan = yeterli.filter((r) => r.ortak === enIyiOran);
      return { yollar: geometriEkle(kazanan), eslesme: 'ortak-sozcuk', ortak: enIyiOran };
    }
  }

  const puanli = adlar.map((r) => ({ ...r, p: benzerlik(r.adAra, ys) }))
                      .filter((r) => r.p >= 0.7);
  if (puanli.length) {
    const enIyi = Math.max(...puanli.map((r) => r.p));
    const kazanan = puanli.filter((r) => r.p === enIyi);
    return { yollar: geometriEkle(kazanan), eslesme: 'bulanik', benzerlik: enIyi };
  }

  return { yollar: [], eslesme: null };
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

/**
 * METİNDE MAHALLE ADI ARA — "Mh." yazmadığında.
 *
 * NEDEN GEREKLİ — sanayi ve köy adreslerinde mahalle eki çoğu zaman
 * yazılmıyor:
 *   "KALE ULUÇAM 3. SANAYİ NO:5"
 *   "HONAZ KAKLIK ORGANİZE SANAYİ NO:3"
 *   "özdemirci asvalt üzeri sanayi sitesi pazar yeri cad 10"
 * Ayıklayıcı mahalleyi EKİNDEN bulduğu için bu adreslerde hiç mahalle
 * göremiyor ve sokak seviyesine bile inemiyordu.
 *
 * Bu arama TAHMİN ÜRETMİYOR: metindeki 1-3 sözcüklük her pencereyi, o
 * ilçede GERÇEKTEN VAR OLAN mahalle adlarıyla karşılaştırıyor. Eşleşme
 * yoksa hiçbir şey döndürmüyor.
 *
 * En UZUN eşleşme kazanıyor: "1200 EVLER" varken "EVLER" seçilmemeli.
 *
 * @param {object} kaynak
 * @param {string} metinHam  belgedeki ham metin
 * @param {string|null} ilce ilçe adı — biliniyorsa arama oraya sınırlanır
 * @returns {string|null} bulunan mahalle adı
 */
function metindeMahalleAra(kaynak, metinHam, ilce) {
  if (!metinHam) return null;
  const kelimeler = sade(metinHam).split(' ').filter(Boolean);
  if (!kelimeler.length) return null;

  const ilceAra = ilce ? sade(ilce) : null;
  /* Aday mahalleler — ilçe biliniyorsa yalnız oradakiler. */
  const mahalleler = kaynak.mahalleler().filter((m) =>
    !ilceAra || sade(m.ilce || '') === ilceAra);
  if (!mahalleler.length) return null;

  const indeks = new Map();
  for (const m of mahalleler) {
    const a = sade(m.adAra || m.ad);
    if (a && !indeks.has(a)) indeks.set(a, m.ad);
    /* Boşluksuz hâli de aransın: veri "1200EVLER", fatura "1200 evler". */
    const b = a.replace(/ /g, '');
    if (b && b !== a && !indeks.has(b)) indeks.set(b, m.ad);
  }

  let enIyi = null, enIyiUzunluk = 0;
  for (let i = 0; i < kelimeler.length; i++) {
    for (let n = 3; n >= 1; n--) {
      if (i + n > kelimeler.length) continue;
      const parca = kelimeler.slice(i, i + n).join(' ');
      /* Tek harfli/çok kısa parçalar rastgele eşleşir; en az 3 karakter. */
      if (parca.replace(/ /g, '').length < 3) continue;
      const bulunan = indeks.get(parca) || indeks.get(parca.replace(/ /g, ''));
      if (bulunan && parca.length > enIyiUzunluk) { enIyi = bulunan; enIyiUzunluk = parca.length; }
    }
  }
  return enIyi;
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
function coz(kaynak, { ilce, mahalle, yol, kapino, bagiYokSay } = {}) {
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

  /* ══ KAPI ↔ SOKAK BAĞI ══
     Belediyenin kendi kaydında her kapının hangi sokağa ait olduğu yazılı
     (Numarataj → Yol Orta Hat Yön → Yol Orta Hat). Bu bağ elimizdeki
     kopyaya `veri/kapi-yol-bagla.js` ile alındı.

     Bağ VARSA tahmin etmeye gerek yok: mahalledeki aynı numaralı kapılar
     arasından SOKAĞA KAYITLI olanı seçiliyor. Önceki yöntem — sokak
     çizgisine en yakın kapıyı seçmek — merkez mahallelerde sokaklar
     sıklaştığında şansa kalıyordu: aynı numaradan onlarca kapı ve
     aralarında birkaç metre fark.

     Bağ YOKSA (belediye verisinde boş olan kapılar) eski yönteme
     düşülüyor; sonuç aynen eskisi gibi çalışıyor. */
  const yolOidleri = new Set(y.yollar.map((w) => w.objectid));
  /* SOKAK ADIYLA DA DOĞRULA — mahalle sınırı tuzağı.
     Ölçülmüş gerçek örnek: Kuşpınar'da 96 numaralı kapı, İNÖNÜ caddesine
     bağlı; ama bağlandığı İNÖNÜ PARÇASI komşu MEHMETÇİK mahallesinde
     kayıtlı. Uzun caddeler mahalle sınırında bölünüyor ve kapı,
     kendi mahallesinde olmayan bir parçaya bağlanabiliyor.
     Yalnız oid'e bakılsaydı bu doğru bağ "başka sokak" sayılırdı. */
  const hedefAdlar = new Set(y.yollar.map((w) => sade(w.ad_ara || w.ad)));
  const bagUyuyor = (kp) => {
    if (kp.yolOid == null) return false;
    if (yolOidleri.has(kp.yolOid)) return true;
    const b = kaynak.yolBilgi ? kaynak.yolBilgi(kp.yolOid) : null;
    return !!(b && hedefAdlar.has(sade(b.adAra || b.ad)));
  };
  /* `bagiYokSay` yalnız ÖLÇÜM için: eski davranışı birebir yeniden
     üretebilmek gerekiyor (bkz. test/kapi-yol-olcum.js). Uygulamada
     hiçbir yerde kullanılmıyor. */
  const bagliKapilar = bagiYokSay ? [] : k.kapilar.filter(bagUyuyor);
  const bagliVar = bagliKapilar.length > 0;
  /* Bu numarada bağ bilgisi taşıyan kapı var mı? Varsa ama hiçbiri BU
     sokağa bağlı değilse, bu "bulamadım" değil "burada değil" demektir. */
  const baskaSokagaBagli = !bagiYokSay && !bagliVar && k.kapilar.some((kp) => kp.yolOid != null);

  const sirali = (bagliVar ? bagliKapilar : k.kapilar)
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
  /* ══ BAĞ VARSA KALABALIK CEZALARI GEÇERSİZ ══
     Aşağıdaki "aynı numaradan kaç kapı var" cezaları, hangi kapının doğru
     olduğunu bilmemenin cezasıydı. Belediye kaydı bunu söylüyorsa
     kalabalığın bir önemi kalmıyor: mahallede "13" numaradan 36 kapı olsa
     da bu sokağa kayıtlı olan belli. */
  /* ══ KARDEŞ SOKAK TUZAĞI ══
     Ölçülmüş gerçek durum: köylerde sokak adları "KÖY/NUMARA" biçiminde —
     CUMAALANI/28, KARABAYIR/3, İMAMLAR/6… OCR son karakteri düşürdüğünde
     ortaya ÇALIŞAN, GERÇEK bir başka sokak çıkıyor (CUMAALANI/2). Ad
     tarafından bakınca hiçbir şey yanlış görünmüyor: eşleşme "tam".

     Kapı↔sokak bağı burada tehlikeyi ARTIRIYOR: yanlış ama gerçek sokakta
     o numaralı kapı da kayıtlı olduğu için motor 95 puanla yeşil yakıyor.
     Ölçüldü (19 ilçe, son harf düşürülmüş): sessiz yanlış 208 → 309.

     Bu yüzden: mahallede bu adın BİR KARAKTER UZUNU da gerçek bir sokaksa,
     okuma şüpheli sayılıyor. Bedeli ölçüldü — kapıların yalnız %2,2'si
     (Baklan'da %11,7, merkez ilçelerde %0,4). Yanlış eve gitmeye kıyasla
     ucuz; sürücü sarı görüp bir kez bakıyor. */
  const kardesVar = (() => {
    if (y.eslesme !== 'tam' || !sonuc.yol) return false;
    const bu = sade(y.yollar[0].ad_ara || y.yollar[0].ad);
    if (!bu) return false;
    /* Aranan kardeş: aynı ad + (boşluk) + 1-3 rakam.
       Köy sokakları "KÖY/NUMARA" yazılıyor ve sade() eğik çizgiyi boşluğa
       çeviriyor: "İMAMLAR/6" → "imamlar 6". Yani kardeş, addan bir değil
       İKİ-ÜÇ karakter uzun oluyor. Sadece "tek karakter uzun" arasaydık
       (ilk hâli öyleydi) bu örüntüyü kaçırırdık — ölçümde kaçırdı da. */
    const desen = new RegExp('^' + bu.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' ?\\d{1,3}$');
    const kardesOid = new Set();
    for (const w of kaynak.yollar(mah.objectid)) {
      if (desen.test(sade(w.adAra || w.ad))) kardesOid.add(w.oid);
    }
    if (!kardesOid.size) return false;
    /* KARDEŞ VAR DİYE HEMEN ŞÜPHELENME — belirsizlik ancak AYNI KAPI
       NUMARASI kardeş sokakta da varsa gerçek.
       Ölçüldü: bu daraltma olmadan kural, doğrulanmış gerçek bir adresi
       (Karaman / Yeşilköy Cd. No:281) sarıya düşürüyordu; Karaman'da
       "YEŞİLKÖY <numara>" diye sokaklar var ama 281 onlarda yok, yani
       ortada bir karışıklık ihtimali de yok. */
    return k.kapilar.some((kp) => kp.yolOid != null && kardesOid.has(kp.yolOid));
  })();

  if (bagliVar) {
    sonuc.bagliSokak = true;
    /* Puan sıfırdan kuruluyor — yukarıdaki mesafe temelli puanla
       karıştırılmıyor, yoksa aynı cezalar iki kez işlenirdi.
       Taban 95: belediye kaydı bu kapının bu sokakta olduğunu söylüyor.
       Mesafe artık delil değil; sokak çizgisi kısa bir parça olduğu için
       kapı uzakta görünebilir, bağ yine doğrudur.
       Ama sokak ADI zorlanarak eşleştiyse bağ da yanlış sokağı gösterir —
       o cezalar duruyor. */
    let bagliPuan = 95;
    bagliPuan -= { tam: 0, onek: 4, icerik: 8, 'ortak-sozcuk': 6, bulanik: 18 }[y.eslesme] ?? 8;
    if (k.eslesme === 'taban') {
      bagliPuan -= 8;
      sonuc.notlar.push(`Kapı no "${kapino}" bulunamadı, taban numara "${en.kapino}" kullanıldı`);
    }
    if (m.eslesme === 'bulanik') bagliPuan -= 10;
    if (m.adaylar.length > 1) bagliPuan -= 25;
    if (bagliKapilar.length > 1) {
      /* Aynı sokakta aynı numaradan birden çok kayıt — veri anomalisi.
         Nadir ama olabiliyor; o zaman yine mesafe hakem. */
      bagliPuan -= 10;
      sonuc.notlar.push(`Bu sokakta "${en.kapino}" numaralı ${bagliKapilar.length} kayıt var — en yakını seçildi`);
    }
    if (kardesVar) {
      /* Yeşile çıkmasın: bağ doğru olabilir ama YANLIŞ SOKAĞIN bağı olabilir. */
      bagliPuan = Math.min(bagliPuan, ESIK.yesil - 3);
      sonuc.kardesSokak = true;
      sonuc.notlar.push(
        `Bu mahallede "${sonuc.yol}" ile başlayan daha uzun bir sokak adı da var — ` +
        'okumada bir karakter düşmüş olabilir, sokağı bir kontrol et');
    }
    sonuc.guven = Math.max(0, Math.min(100, Math.round(bagliPuan)));
    return son(sonuc);
  }

  /* Kapı numarası bu mahallede var ama BAŞKA sokaklara kayıtlı. Bu, zayıf
     bir eşleşme değil, aksi yönde bir delil: aradığımız kapı bu sokakta
     görünmüyor. Sonucu yeşile çıkarmamak gerekiyor. */
  if (baskaSokagaBagli) {
    puan -= 22;
    sonuc.baskaSokagaBagli = true;
    sonuc.notlar.push(
      `"${kapino}" numarası bu mahallede var ama kayıtlarda "${sonuc.yol}" sokağına bağlı değil — ` +
      'sokak adı yanlış okunmuş olabilir, kontrol et');
  }

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
  mahalleBul, yolBul, kapiBul, metindeMahalleAra,
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
 * Toplam paket 8,2 MB; merkez iki ilçe 1,9 MB. İlçe dosyaları İSTENDİĞİNDE
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
 *   kapi-<ilce>.json:[[mahOid, kapino, lat, lng, yolSira], …]
 *   Koordinatlar tam sayı: derece × 1e6.
 *   `yolSira` = kapının bağlı olduğu sokağın, aynı ilçenin yol dizisindeki
 *   sıra numarası (-1 = bağ yok). Gerçek objectid saklanmıyor çünkü pakette
 *   aynı adlı yol parçaları birleştiriliyor; yükleyici oid'leri aynı sırada
 *   ürettiği için sıra numarası birebir tutuyor.
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
  const _yolIndeks = new Map();          // yolOid -> yol (kapı bağı için)
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
    /* Bu ilçenin ilk yol oid'i. Kapılar sokağı SIRA NUMARASIYLA gösteriyor
       (pakette gerçek objectid'ler yok, bkz. veri/paket-uret.js); sıra
       numarası + bu taban = oid. İkisi aynı dizide üretildiği için tutuyor. */
    const yolTabanOid = _sonrakiYolOid;
    for (const [mahOid, ad, adAra, tur, cizgiler] of yollar) {
      const oid = _sonrakiYolOid++;
      const kayit = { oid, ad, adAra, tur, mahOid };
      if (!_yolMah.has(mahOid)) _yolMah.set(mahOid, []);
      _yolMah.get(mahOid).push(kayit);
      _yolIndeks.set(oid, kayit);
      _cizgi.set(oid, cizgiler.map((c) => c.map(([la, ln]) => [coz(la), coz(ln)])));
    }

    const kapilar = await oku(`kapi-${ilceOid}`);
    for (const [mahOid, kapino, lat, lng, yolSira] of kapilar) {
      if (!_kapiMah.has(mahOid)) _kapiMah.set(mahOid, new Map());
      const m = _kapiMah.get(mahOid);
      /* Arama anahtarı sadeleştirilmiş, gösterilen değer özgün. */
      const anahtar = sade(kapino);
      if (!m.has(anahtar)) m.set(anahtar, []);
      m.get(anahtar).push({
        kapino, lat: coz(lat), lng: coz(lng),
        /* -1 ya da eksik = belediye kaydında bağ yok. Eski paketlerde bu
           alan hiç bulunmuyor; undefined da bağsız sayılıyor. */
        yolOid: (yolSira == null || yolSira < 0) ? null : yolTabanOid + yolSira,
      });
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

    /* Bir yolun kimliği — kapının bağlı olduğu sokağın ADINI öğrenmek için.
       Uzun caddeler mahalle sınırında bölünüyor ve kapı, komşu mahallede
       kayıtlı bir parçaya bağlanabiliyor; bağ o yüzden adla da doğrulanıyor. */
    yolBilgi: (oid) => _yolIndeks.get(oid) || null,

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
const bolge = require('./bolge');

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
  let sonucNotu = null;

  /* Her kaynağı kendi biçimine uygun ayrıştır.
     EKLEME SIRASI ÖNEMLİ: aynı değer birden çok kaynakta geçerse ilk ekleyen
     sahiplenir ve o kaynağın puanını alır. Teslimat bloğu en başta. */
  const kaynaklar = {};

  /* TESLİMAT ADRESİ ≠ FATURA ADRESİ — ölçülmüş yanlış-adres tuzağı.
     Satış belgesinde ikisi yan yana basılıyor ve sık sık farklı oluyor
     (fatura kurumsal merkeze, teslimat eve). OCR sütunları tek satırda
     birleştirdiği için düz metinden ayrılamıyorlar; sözcük kutularıyla
     ayrılıyorlar. Gerçek örnek:
        Fatura adresi: 3. SANAYİ SİTESİ 52 SOK 34   (Denizli merkez)
        Teslimat adresi: ÇAKMAK MAH 134/1 SOK 9 DAİRE 6
     Ayrım yapılmazsa motor emin adımlarla yanlış eve gönderiyordu. */
  const kutulu = Array.isArray(belge.ocrKelimeler) &&
    belge.ocrKelimeler.some((k) => k && Number.isFinite(k.x0)) ? belge.ocrKelimeler : null;
  let teslimatBlogu = null;
  if (kutulu) {
    teslimatBlogu = bolge.bolumMetni(kutulu, bolge.TESLIMAT_DESENLERI, { sag: 0.45, yayilma: 10 });
    if (teslimatBlogu) {
      kaynaklar.teslimat = metin.ayiklaSerbest(teslimatBlogu, ilceler);
      const faturaBlogu = bolge.bolumMetni(kutulu, bolge.FATURA_DESENLERI, { sag: 0.32, yayilma: 9 });
      if (faturaBlogu) kaynaklar.faturaAdresi = metin.ayiklaSerbest(faturaBlogu, ilceler);
    }
  }

  /* FOTOĞRAFTAN OKUNAN ETİKETİ YAPILANDIR.
     Teslimat etiketinde alanlar adıyla yazılı (İl/İlçe, Semt/Mahalle,
     Alıcı Adres) ama fotoğraf yolunda hepsi tek metin yığınına giriyor ve
     "hangi satır ne" bilgisi kayboluyor.
     Ölçülmüş sonuç: etiket DOĞRU okunmuşken motor sayfadaki fatura adresini
     seçti (kapı numarası taşıdığı için daha yüksek puan aldı) ve sürücüyü
     yanlış mahalleye gönderecekti. Sözcük kutuları varken alanları adıyla
     geri okumak bu bilgiyi kurtarıyor. */
  if (!belge.etiket && kutulu) {
    const A = bolge.ETIKET_ALANLARI;
    const okunan = {
      ilIlce: bolge.satirDegeri(kutulu, A.ilIlce),
      semtMahalle: bolge.satirDegeri(kutulu, A.semtMahalle),
      acikAdres: bolge.satirDegeri(kutulu, A.acikAdres),
    };
    if (okunan.semtMahalle || okunan.acikAdres) {
      kaynaklar.etiket = metin.ayiklaEtiket(okunan, ilceler);
      kaynaklar.etiket.fotograftan = true;
    }
  }

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

  /* ══ "Mh." YAZMAYAN MAHALLE ══
     Ayıklayıcı mahalleyi ekinden buluyor ("Karaman MH."). Ama sanayi/köy
     adreslerinde ek çoğu zaman yazılmıyor:
        "KALE ULUÇAM 3. SANAYİ NO:5"
        "HONAZ KAKLIK ORGANİZE SANAYİ NO:3"
        "özdemirci asvalt üzeri sanayi sitesi pazar yeri cad 10"
     Bu adreslerde mahalle adı METİNDE VAR ama işaretsiz; motor hiç mahalle
     bulamayıp sokak seviyesine bile inemiyordu.

     Çare: ek bulunamadıysa metni GAZETTEER'a karşı tara. Uydurma değil —
     yalnız o ilçede GERÇEKTEN VAR OLAN mahalle adları aranıyor, en uzun
     eşleşme kazanıyor ("1200 EVLER" > "EVLER"). İlçe biliniyorsa arama o
     ilçeyle sınırlı; bilinmiyorsa tüm il taranıyor ama sonuç zaten
     ilçesizlik yüzünden düşük güvenli kalıyor. */
  if (!adaylar.mahalle.some((x) => x.deger != null)) {
    const ham = [belge.serbest, belge.govde, belge.elYazisi,
      belge.etiket && belge.etiket.semtMahalle, teslimatBlogu].filter(Boolean).join(' ');
    const bulunan = adres.metindeMahalleAra(db, ham, ilceler2[0] || null);
    if (bulunan) {
      adaylar.mahalle.unshift({ deger: bulunan, kaynak: 'gazetteer' });
      sonucNotu = `Mahalle adı "Mh." yazmadan geçiyor — "${bulunan}" olarak okundu`;

      /* SOKAĞI DA YENİDEN ARA — mahalle ADI artık çapa.
         Sokak arayıcı normalde mahalle EKİNDEN sonrasına bakıyor; ek yoksa
         hiç aday üretemiyordu. Mahalle adı bulunduğuna göre sokak ondan
         sonra başlıyor: "KALE ULUÇAM | 3. SANAYİ NO:5". */
      if (!adaylar.yol.some((x) => x.deger != null)) {
        const yeniden = metin.ayiklaSerbest(ham, ilceler, bulunan);
        for (const d of (yeniden.yolAdaylar || [])) {
          if (d && !adaylar.yol.some((x) => x.deger != null && metin.sade(x.deger) === metin.sade(d))) {
            adaylar.yol.unshift({ deger: d, kaynak: 'gazetteer' });
          }
        }
      }
    }
  }

  /* ══ BELGE NE YAZDIYSA O — KISA ÖN EKE KAÇMA ══
     Aday listesinde hem "3" hem "3 sanayi" varsa ve İKİSİ DE gazetteer'da
     gerçek sokaksa, belge "3. SANAYİ" yazdığı için uzun olan doğrudur.
     Kısa olanı bırakmak gerekiyor, yoksa şu oluyor (ölçüldü):

       belge : "KALE ULUÇAM 3. SANAYİ NO:5"
       veri  : 3.SANAYİ'de 5 numaralı kapı YOK, "3 NOLU"da VAR
       motor : "3 NOLU / no 5" · 91 puan YEŞİL   ← sessizce yanlış sokak

     Doğrusu: sokak 3.SANAYİ, kapı bulunamadı → sokak seviyesi, sarı.
     Motor burada "kesin olan yanlışı" "belirsiz olan doğruya" tercih
     ediyordu; aynı kalıp etiket/fatura ayrımında da görülmüştü. */
  {
    const yasayanMah = adaylar.mahalle.filter((x) => x.deger != null);
    const varMi = (ad) => yasayanMah.some((mm) => {
      for (const il of (ilceler2.length ? ilceler2 : [null])) {
        const m2 = adres.mahalleBul(db, mm.deger, il);
        if (!m2.adaylar.length) continue;
        const y2 = adres.yolBul(db, m2.adaylar[0].objectid, ad);
        if (y2.yollar.length && y2.eslesme === 'tam') return true;
      }
      return false;
    });
    const dolu = adaylar.yol.filter((x) => x.deger != null);
    if (dolu.length > 1) {
      const atilacak = new Set();
      for (const kisa of dolu) {
        const ks = metin.sade(kisa.deger);
        for (const uzun of dolu) {
          const us = metin.sade(uzun.deger);
          if (us === ks || !us.startsWith(ks + ' ')) continue;
          /* Uzun ad gerçekten varsa kısa olanı at. */
          if (varMi(uzun.deger)) { atilacak.add(ks); break; }
        }
      }
      if (atilacak.size) {
        adaylar.yol = adaylar.yol.filter((x) => x.deger == null || !atilacak.has(metin.sade(x.deger)));
      }
    }
  }

  /* TESLİMAT ETİKETİ MAHALLE VERİYORSA O BAĞLAYICIDIR.
     İlçe için aşağıda uygulanan kuralın aynısı. Etiket, kargonun üstüne
     teslimat için basılıyor; İL/İLÇE ve SEMT/MAHALLE alanları büyük
     puntolu ve temiz (dosya başındaki kaynak değerlendirmesi). Sokak ve
     kapı numarası bozuk olabiliyor — onlara dokunulmuyor.

     Ölçülmüş sessiz yanlış: bir belgede etiket "Mehmet Akif Ersoy Mh."
     diyordu ve DOĞRU okunmuştu; ama aynı sayfadaki FATURA adresi
     (Zafer Mah 1016 sk 29/2) kapı numarası taşıdığı için 95 puan aldı ve
     seçildi. Motor "kesin olan yanlışı" "belirsiz olan doğruya" tercih
     etti. Puan artırmak yetmiyor (50'ye karşı 95); mahalleyi kısıtlamak
     gerekiyor — çünkü mesele puan değil, hangi mahalleye gidileceği. */
  const etiketMahalle = adaylar.mahalle.filter((a) => a.kaynak === 'etiket' && a.deger != null);
  if (etiketMahalle.length) adaylar.mahalle = etiketMahalle;

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
          /* "No:" AÇIKÇA YAZIYORSA "Apt:"tan ÖNCE GELİR.
             Kullanıcının kuralı: kapı no yazan yeri doğal olarak kapı no say;
             apartman numarasını ancak kapı no YOKSA kapı no yerine kullan.
             Önceden ikisi de aday havuzundaydı ve hangisinin kazanacağı
             puanlamanın tesadüfüne kalıyordu; artık açık olan küçük bir
             öncelik puanı alıyor. */
          const acikKapiNo = Object.values(kaynaklar).some((k) =>
            k && Array.isArray(k.kapinoAdaylar) && Array.isArray(k.kapinoAdaylar.acik) &&
            kapino.deger != null && k.kapinoAdaylar.acik.includes(kapino.deger));
          /* MAĞAZANIN KENDİ ADRESİNİ TESLİMAT SANMA.
             Tam sayfa okutulduğunda belgenin başlığındaki Media Markt adresi
             de metne giriyor ve Denizli'de gerçek bir adres olduğu için
             gazetteer onu memnuniyetle çözüyor — sürücüyü mağazanın kapısına
             gönderirdi. */
          if (metin.gondericiAdresiMi(bilesen.mahalle, bilesen.yol)) continue;
          const c = adres.coz(db, bilesen);
          /* Öncelik puanı yalnız SIRALAMA için; sonuçtaki güven değeri
             değişmiyor, yoksa kullanıcıya olduğundan emin görünürdü. */
          c.siraPuani = c.guven + (acikKapiNo && c.keskinlik === 'kapi' ? 6 : 0);
          /* Belgede "Teslimat adresi" ayrı yazılmışsa oradan gelen bileşen
             kazanır; yalnız "Fatura adresi" bloğunda geçen bileşen kaybeder.
             Puan farkı, ikisi de gerçek adres olduğunda (ki genelde öyle)
             belirleyici olacak kadar büyük tutuldu. */
          if (kaynaklar.teslimat) {
            const kaynakSeti = [mahalle.kaynak, yol.kaynak, kapino.kaynak];
            if (kaynakSeti.includes('teslimat')) c.siraPuani += 14;
            if (kaynakSeti.includes('faturaAdresi')) c.siraPuani -= 14;
          }
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
          const oncekiPuan = enIyi ? (enIyi.cozum.siraPuani ?? enIyi.guven) : -1;
          if (!enIyi || c.siraPuani > oncekiPuan ||
              (c.siraPuani === oncekiPuan && c.keskinlik === 'kapi' && enIyi.cozum.keskinlik === 'kapi' &&
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
  /* Mahalle adı ekinden değil gazetteer taramasından geldiyse sürücü bilsin —
     doğru olma ihtimali yüksek ama belgede işaretsiz duruyor. */
  if (sonucNotu && enIyi.kaynak.mahalle === 'gazetteer') sonuc.uyarilar.push(sonucNotu);

  /* --- Sürücüye gösterilecek uyarılar --- */

  /* El yazısı varsa her hâlükârda kontrol istenir. Bir belgede basılı adres
     tamamen çizilip yerine el yazısı yenisi yazılmıştı; bunu sessizce geçmek
     sürücüyü yanlış eve gönderir. */
  if (belge.elYazisi) {
    sonuc.uyarilar.unshift('Belgede el yazısıyla adres var — basılı adresle karşılaştır');
    sonuc.elYazisiVar = true;
    if (sonuc.guven > adres.ESIK.sari) sonuc.guven = adres.ESIK.sari;   // en fazla "sarı"
  }

  /* BELGEDE AYRI BİR TESLİMAT ADRESİ VARSA VE ÇÖZÜLEMEDİYSE SUSMA.
     Gerçek belge (fotoğraf 45): fatura adresi Honaz'daki organize sanayide
     bir fabrika, teslimat adresi ise Pamukkale'de bir ev. Teslimat satırında
     mahalle yazmadığı için çözülemiyor ve motor fatura adresini seçiyor —
     sürücüyü 25 km öteye, fabrikaya gönderirdi. Üstelik fatura adresi gerçek
     bir adres olduğu için güven puanı da yüksek çıkıyor; hata sessiz kalıyor.
     Bu yüzden: teslimat bloğu VAR ama seçilen çözümün hiçbir parçası oradan
     GELMİYORSA sonuç yeşil olamaz ve sürücüye açıkça söylenir. */
  if (kaynaklar.teslimat && !Object.values(sonuc.kaynak || {}).includes('teslimat')) {
    sonuc.uyarilar.unshift(
      'Belgede ayrı bir TESLİMAT ADRESİ yazıyor ama okunamadı — aşağıdaki adres ' +
      'fatura adresi olabilir. Belgeye bakıp doğrula.');
    sonuc.teslimatOkunamadi = true;
    if (sonuc.guven > adres.ESIK.sari) sonuc.guven = adres.ESIK.sari;
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

  /* SOKAK ADI NET OKUNAMADIYSA SONUÇ YEŞİL OLAMAZ.
     Kapı numarası için zaten yapılıyordu; sokak için de gerekli olduğu
     ölçümle çıktı. Kapı↔sokak bağı kurulduktan sonra motor, YANLIŞ okunmuş
     ama gerçek olan bir sokakta kapıyı bulup 95 puan veriyor — çünkü veri
     onu doğruluyor. Veri "bu okuma doğru mu" sorusuna cevap veremiyor;
     buna yalnız OCR'ın kendi güveni cevap verebiliyor.
     Gerçek örnek (köy adresleri): "CUMAALANI/28" → "CUMAALANI/2" okunuyor,
     ikisi de gerçek sokak, sapma 223 m ve hiçbir uyarı yok. */
  if (sonuc.yol && Array.isArray(belge.ocrKelimeler) && belge.ocrKelimeler.length) {
    const parcalar = metin.sade(sonuc.yol).split(' ').filter((p) => p.length >= 2);
    let enDusuk = null;
    for (const p of parcalar) {
      const ilgili = belge.ocrKelimeler.filter((k) => metin.sade(k.metin).includes(p));
      if (!ilgili.length) continue;
      const enIyi = Math.max(...ilgili.map((k) => k.guven));
      if (enDusuk === null || enIyi < enDusuk) enDusuk = enIyi;
    }
    if (enDusuk !== null && enDusuk < 70 && sonuc.guven > adres.ESIK.sari) {
      sonuc.guven = adres.ESIK.sari;
      sonuc.uyarilar.push(`Sokak adı net okunamadı (%${Math.round(enDusuk)}) — "${sonuc.yol}" doğru mu, bir bak`);
      sonuc.ocrSupheli = true;
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

  /**
   * MAHALLE DEĞİŞTİRME BEDELİ (metre karşılığı).
   *
   * NEDEN VAR — kullanıcının bildirdiği durum: "iki adres Yenişafak
   * mahallesinde ama araya bir de Adalet mahallesi atıyor."
   *
   * Ölçüldü (test/mahalle-kumesi.js, 150 gün × 20 durak, gerçek Denizli
   * koordinatları): sıralayıcı bunu yaptığında HATA YAPMIYOR — kusursuz
   * optimum da aynı oranda bölüyor (%100 aynı maliyet, ikisinde de günde
   * 0,25 mahalle bölünüyor). Yani kısa yol gerçekten oradan geçiyor.
   *
   * AMA mesafe modeli sahadaki bir maliyeti GÖRMÜYOR: yeni bir mahalleye
   * girince park yeri aramak, sokağı ve apartmanı bulmak baştan başlıyor.
   * Aynı mahalledeki ikinci teslimatta bunların çoğu atlanıyor.
   *
   * Bu sabit, o görünmeyen maliyetin metre cinsinden karşılığı. Ölçülen
   * bedel tablosu (aynı testten):
   *
   *   K        ortalama fazladan   en kötü gün   bölünen mahalle/gün
   *   0                        —             —                  0,26
   *   600 m             +0,03 km      +0,60 km                  0,10
   *   1000 m            +0,04 km      +0,81 km                  0,08   ← seçildi
   *   2500 m            +0,11 km      +1,78 km                  0,03
   *   5000 m            +0,22 km      +4,46 km                  0,00
   *
   * 1000 m seçildi: günde ortalama 40 metreye mal oluyor, en kötü günde bile
   * 1 km'yi aşmıyor, buna karşılık mahalle bölünmesini %70 azaltıyor.
   * Daha büyüğü bölünmeyi tamamen bitiriyor ama kötü günlerde 4-5 km
   * yazdırıyor — o zaman "gereksiz yere uzağa gitti" şikâyeti haklı olurdu.
   *
   * Bölünme yine de olabiliyor: o zaman kazanç 1 km'den fazla demektir,
   * yani gerçekten değiyor.
   */
  grupBedeliMetre: 1000,
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

/**
 * 1. aşama — en yakın komşu. Başlangıç her zaman 0 indeksli düğüm.
 *
 * @param {number} [ilkAtla=0] ilk adımda en yakın yerine (ilkAtla+1). en
 *        yakını seç. Farklı tohumlar üretip yerel en iyiden kaçmak için.
 */
function enYakinKomsu(m, ilkAtla = 0) {
  const n = m.length;
  const gidildi = new Uint8Array(n);
  const sira = [0];
  gidildi[0] = 1;
  let simdi = 0;
  for (let adim = 1; adim < n; adim++) {
    const kalan = [];
    for (let j = 1; j < n; j++) if (!gidildi[j]) kalan.push(j);
    kalan.sort((p, q) => m[simdi][p] - m[simdi][q]);
    const secim = kalan[adim === 1 ? Math.min(ilkAtla, kalan.length - 1) : 0];
    sira.push(secim); gidildi[secim] = 1; simdi = secim;
  }
  return sira;
}

/**
 * 2-opt — iki kenarı kesip aradaki parçayı TERS ÇEVİRİR.
 * Başlangıç düğümü (indeks 0) sabit kalır.
 *
 * ⚠️ BU FONKSİYON BİR KEZ YANLIŞ YAZILDI VE ROTAYI BOZDU — nedeni burada:
 *
 * Önceki hâli parçayı ters çevirmenin maliyetini yalnız İKİ UÇ KENARDAN
 * hesaplıyordu (m[a][b] + m[c][e] → m[a][c] + m[b][e]). Bu, matris
 * SİMETRİKSE doğrudur: ters çevrilen parçanın içindeki kenarlar aynı
 * maliyette kalır. Gerçek yol süreleri ise ASİMETRİKTİR (tek yönler,
 * dönüş yasakları): A→B ile B→A farklıdır ve parçanın içi de değişir.
 *
 * O yüzden 2-opt, gerçek yol matrisi kullanıldığında TAMAMEN KAPATILIYORDU.
 * Geriye yalnız en-yakın-komşu + Or-opt kalıyordu ve ortaya çıkan rota
 * kullanıcının bildirdiği hâle geliyordu: aynı mahalledeki iki teslimatın
 * arasına 10 kilometrelik bir sıçrama giriyor, çünkü hiçbir adım o çaprazı
 * çözemiyor — çaprazları çözen tam olarak 2-opt'tur.
 *
 * Doğrusu: parçanın İÇİNİ de hesaba katmak. Ters çevrilmiş parçanın iç
 * maliyeti, aynı kenarların ters yönde toplamıdır; O(parça uzunluğu) ek iş.
 * Toplam maliyet O(n³) oluyor — 60 durak için milisaniyeler. Bu hâliyle
 * simetrik matriste de doğru çalışıyor (ileri = geri çıkıyor), yani artık
 * tek bir 2-opt var ve HER ZAMAN açık.
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
        /* Parçanın içi: ileri ve geri yöndeki toplamlar. */
        let ileri = 0, geri = 0;
        for (let k = i; k < j; k++) {
          ileri += m[sira[k]][sira[k + 1]];
          geri += m[sira[k + 1]][sira[k]];
        }
        /* Son düğümden sonrası olmadığı için o kenar hesaba katılmaz. */
        const once = m[a][b] + ileri + (e >= 0 ? m[c][e] : 0);
        const sonra = m[a][c] + geri + (e >= 0 ? m[b][e] : 0);
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
 * Or-opt — 1-3 duraklık bir parçayı başka bir yere taşır.
 * Parça hem olduğu gibi hem TERS çevrilmiş olarak deneniyor; ters çevirmek
 * asimetrik matriste de doğru hesaplanıyor çünkü maliyet baştan sona
 * yeniden ölçülüyor.
 */
function orOpt(sira, m, enFazlaParca = 3) {
  const n = sira.length;
  let iyilesti = true;
  while (iyilesti) {
    iyilesti = false;
    for (let uzunluk = 1; uzunluk <= enFazlaParca && !iyilesti; uzunluk++) {
      for (let i = 1; i + uzunluk <= n && !iyilesti; i++) {
        const parca = sira.slice(i, i + uzunluk);
        const tersParca = parca.slice().reverse();
        const kalan = sira.slice(0, i).concat(sira.slice(i + uzunluk));
        const simdikiMaliyet = maliyet(sira, m);
        for (let k = 1; k <= kalan.length && !iyilesti; k++) {
          for (const p of (uzunluk > 1 ? [parca, tersParca] : [parca])) {
            if (k === i && p === parca) continue;       // aynı yere aynı yönde koymak anlamsız
            const aday = kalan.slice(0, k).concat(p, kalan.slice(k));
            if (maliyet(aday, m) < simdikiMaliyet - 1e-9) {
              sira.length = 0; sira.push(...aday);
              iyilesti = true; break;
            }
          }
        }
      }
    }
  }
  return sira;
}

/* --------------------------------------------- yerel en iyiden kaçış */

/**
 * Sıralı rastgele sayı üreteci (xorshift32).
 *
 * Math.random KULLANILMIYOR: aynı duraklar aynı sırayı vermeli. Sürücü
 * "rotayı çıkar"a iki kez basınca farklı iki rota görürse hangisine
 * güveneceğini bilemez; ayrıca testler yeniden üretilebilir olmaz.
 */
function uretec(tohum) {
  let x = (tohum | 0) || 2463534242;
  return () => {
    x ^= x << 13; x |= 0;
    x ^= x >>> 17;
    x ^= x << 5; x |= 0;
    return ((x >>> 0) % 1000000) / 1000000;
  };
}

/**
 * ÇİFT KÖPRÜ — rotayı dört parçaya bölüp ortadaki ikisinin yerini değiştirir.
 *
 * 2-opt ve Or-opt'un ikisi de "yerel" adımlar: iyileştiremeyecekleri bir
 * noktaya gelince dururlar, ama o nokta en iyi rota olmak zorunda değil.
 * Çift köprü, hiçbir 2-opt adımının tek başına yapamayacağı bir karıştırma
 * uyguluyor; ardından yerel iyileştirme tekrar çalışıyor. Daha iyi çıkarsa
 * saklanıyor, çıkmazsa atılıyor. Böylece sonuç ASLA kötüleşmiyor.
 */
function ciftKopru(sira, rast) {
  const n = sira.length;
  if (n < 8) return sira.slice();
  const kesim = [1 + Math.floor(rast() * (n - 3)), 0, 0];
  kesim[1] = kesim[0] + 1 + Math.floor(rast() * (n - kesim[0] - 2));
  kesim[2] = kesim[1] + 1 + Math.floor(rast() * (n - kesim[1] - 1));
  const [p, q, r] = kesim;
  return sira.slice(0, p).concat(sira.slice(q, r), sira.slice(p, q), sira.slice(r));
}

/** Yerel iyileştirme: 2-opt ve Or-opt sırayla, artık iyileşme kalmayana dek. */
function yerelIyilestir(sira, m) {
  let onceki = Infinity;
  for (let tur = 0; tur < 6; tur++) {
    sira = ikiOpt(sira, m);
    sira = orOpt(sira, m);
    const c = maliyet(sira, m);
    if (c >= onceki - 1e-9) break;
    onceki = c;
  }
  return sira;
}

/**
 * MAHALLE (grup) DEĞİŞTİRME BEDELİNİ MATRİSE İŞLER.
 *
 * `secenek.grup` her durağın grup etiketi (mahalle adı). Boş/null olanlar
 * KENDİ BAŞINA bir grup sayılıyor — adresi çözülememiş bir durak yüzünden
 * yanlışlıkla kümelenme olmasın.
 *
 * Birim önemli: matris saniye cinsindense bedel de saniyeye çevriliyor,
 * yoksa 1000 "metre" saniye sanılıp 16 dakikalık bir ceza olurdu.
 */
function grupCezasi(m, secenek, N) {
  const grup = secenek.grup;
  if (!Array.isArray(grup) || grup.length !== N) return m;
  const bedelMetre = secenek.grupBedeli != null ? secenek.grupBedeli : VARSAYILAN.grupBedeliMetre;
  if (!bedelMetre) return m;
  const bedel = secenek.birim === 'sure'
    ? bedelMetre / 1000 / VARSAYILAN.hizKmS * 3600      // metre → saniye
    : bedelMetre;

  /* Etiketsiz duraklar benzersiz kılınıyor. */
  const etiket = grup.map((g, i) =>
    (g == null || String(g).trim() === '') ? ' tek' + i : String(g));

  const n = m.length;
  const c = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      /* 0. düğüm başlangıç konumu; onun mahallesi yok, geçiş sayılmıyor. */
      const gecis = i > 0 && j > 0 && etiket[i - 1] !== etiket[j - 1];
      c[i][j] = m[i][j] + (gecis ? bedel : 0);
    }
  }
  return c;
}

/** Rotada kaç mahalle birden fazla parçaya bölünmüş? (uyarı göstermek için) */
function bolunenGruplar(sira, grup) {
  if (!Array.isArray(grup)) return [];
  const dizi = sira.map((i) => grup[i]).filter((g) => g != null && String(g).trim() !== '');
  const parca = {};
  for (let i = 0; i < dizi.length; i++) {
    if (i === 0 || dizi[i] !== dizi[i - 1]) parca[dizi[i]] = (parca[dizi[i]] || 0) + 1;
  }
  return Object.keys(parca).filter((g) => parca[g] > 1);
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

  /* ARAMA MATRİSİ ≠ ÖLÇÜM MATRİSİ.
     Sıralama, mahalle değiştirmeye küçük bir bedel EKLENMİŞ matris üzerinde
     yapılıyor; ama sonuçta kullanıcıya söylenen mesafe/süre HER ZAMAN gerçek
     matristen ölçülüyor. Yoksa ekranda uydurma bir km yazardı. */
  const aramaMatrisi = grupCezasi(m, secenek, N);

  /* BİRDEN ÇOK BAŞLANGIÇ.
     En yakın komşu kısa görüşlü: ilk adımda en yakına gitmek, sonraki
     adımları çıkmaza sokabiliyor. Bu yüzden "en yakın komşu" ile birlikte
     "ilk durak olarak 2., 3., 4. en yakını seç" varyantları da deneniyor;
     hepsi yerel iyileştirmeden geçip en iyisi alınıyor. Ucuz ve tek
     başlangıcın sistematik körlüğünü kırıyor. */
  const sureTavaniBas = secenek.sureTavani != null ? secenek.sureTavani : 1200;
  const anBaslangic = Date.now();

  /* Durak sayısı büyüdükçe her tohum pahalılaşıyor (yerel iyileştirme O(n³)).
     50 durakta dört tohum tek başına saniyeleri buluyor; telefonda bu
     düğmeye bastıktan sonra beklenen süre demek. Tohum sayısı ölçeğe göre
     kısılıyor ve süre tavanı BURADA DA geçerli. */
  const tohumSayisi = N <= 20 ? 4 : N <= 35 ? 3 : 2;
  const tohumlar = [enYakinKomsu(aramaMatrisi)];
  for (let k = 1; k <= Math.min(tohumSayisi - 1, N - 1); k++) tohumlar.push(enYakinKomsu(aramaMatrisi, k));

  let enIyi = null, enIyiMaliyet = Infinity;
  for (const t of tohumlar) {
    if (enIyi && Date.now() - anBaslangic > sureTavaniBas * 0.6) break;
    const s = yerelIyilestir(t.slice(), aramaMatrisi);
    const c = maliyet(s, aramaMatrisi);
    if (c < enIyiMaliyet) { enIyiMaliyet = c; enIyi = s; }
  }

  /* ÇİFT KÖPRÜ TURLARI — yerel en iyiden kaçış.
     Durak sayısıyla ölçekleniyor; 12 durakta ~34 tur, 60 durakta 120 tur.
     Her tur birkaç milisaniye; kullanıcı farkı hissetmiyor ama rota
     gözle görülür biçimde düzeliyor (ölçüm: test/rota.test.js). */
  const turSayisi = secenek.turSayisi != null ? secenek.turSayisi
    : Math.min(120, 10 + N * 2);
  /* SÜRE TAVANI — telefonda düğmeye basınca beklenen süre.
     Yerel iyileştirme O(n³); 80 durakta tur başına ~40 ms ediyor ve 120 tur
     masaüstünde 4,5 sn sürüyordu. Telefonda bu kabul edilemez. Tur sayısı
     değil GEÇEN SÜRE sınırlanıyor: küçük günlerde turların hepsi çalışıyor,
     büyük günlerde elde olan en iyi rotayla yetiniliyor (sonuç asla
     kötüleşmiyor, yalnız arama kısalıyor). */
  const rast = uretec(N * 7919 + Math.round((m[0][1] || 1) * 1000));
  let tur = 0;
  for (; tur < turSayisi; tur++) {
    if (Date.now() - anBaslangic > sureTavaniBas) break;
    const aday = yerelIyilestir(ciftKopru(enIyi, rast), aramaMatrisi);
    const c = maliyet(aday, aramaMatrisi);
    if (c < enIyiMaliyet - 1e-9) { enIyiMaliyet = c; enIyi = aday; }
  }

  /* Ölçüm GERÇEK matrisle — ceza yalnız aramaya aitti. */
  const cikti = sonuclandir(enIyi, m, duraklar, secenek, '2opt+oropt+ciftkopru');
  if (Array.isArray(secenek.grup)) {
    /* Ceza olmasına rağmen bölünen mahalle varsa, orada kazanç bedelden
       büyük demektir — sürücüye "hata değil, bilerek" diyebilmek için
       çağırana bildiriliyor. */
    cikti.bolunenGruplar = bolunenGruplar(cikti.sira, secenek.grup);
  }
  return cikti;
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
  enYakinKomsu, ikiOpt, orOpt, yerelIyilestir, ciftKopru, uretec,
  grupCezasi, bolunenGruplar, VARSAYILAN,
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

  kayit['./bolge'] = function (module, exports, require) {
'use strict';
/**
 * BÖLGE — ADRES SAYFANIN NERESİNDE?
 * =================================
 *
 * NEDEN GEREKLİ
 * -------------
 * Bir e-İrsaliye A4 sayfasında müşteri adresi TEK bir 7 puntoluk satır.
 * Sayfanın tamamı 2480 piksel genişliğe getirildiğinde o satırın harfleri
 * ~14 piksel yüksekliğinde kalıyor. Tesseract ~30 piksel istiyor, ML Kit
 * ~20. Yani tam sayfa çekimde adres, motorun okuyabileceğinin altında.
 *
 * Ölçülen fark bunu doğruluyor: kullanıcı yalnız etiketi/adresi kırpıp
 * çektiğinde okuma tutuyor, aynı belgenin tam sayfası tutmuyor. Sorun
 * "OCR kötü" değil, adrese YETERİNCE YAKLAŞILMAMASI.
 *
 * NE YAPIYOR
 * ----------
 * Birinci geçişte sayfa normal ölçekte okunuyor. Adres satırı bozuk çıksa
 * bile ONU İŞARET EDEN ETİKETLER (SAYIN, Alıcı Adres, Semt/Mahalle,
 * İl/İlçe, Fatura adresi) daha büyük ve kalın basıldığı için okunuyor.
 * Bu modül o etiketlerin kutularından adresin bulunduğu dikdörtgeni
 * çıkarıyor; çağıran taraf orayı kırpıp 2-5 kat büyüterek İKİNCİ KEZ
 * okutuyor. İnsanın "okuyamadım, yaklaşayım" davranışının aynısı.
 *
 * KOORDİNAT SİSTEMİ
 * -----------------
 * Giren satır kutuları da çıkan dikdörtgen de KAYNAK FOTOĞRAFIN pikselleri
 * cinsinden. Ölçekleme/döndürme çağıranın işi; burada saf geometri var.
 */

const { sade } = require('./metin');

/* Adresi işaret eden etiketler.
   Her biri sade() sonrası aranıyor, yani "İl/İlçe:" → "il ilce" oluyor ve
   Türkçe harf farkı sorun çıkarmıyor.

   `yayilma`: etiketin ALTINDA kaç satır yüksekliği kadar yer taranacağı.
   Etikete bitişik yazan biçimler (etiket solda, değer sağda) için küçük;
   "SAYIN" gibi altına blok açan başlıklar için büyük. */
const ETIKETLER = [
  { desen: 'teslimat adresi', yayilma: 8, sag: 0.50, agirlik: 5 },
  { desen: 'alici adres',    yayilma: 2,  sag: 0.60, agirlik: 4 },
  { desen: 'semt mahalle',   yayilma: 3,  sag: 0.60, agirlik: 4 },
  { desen: 'il ilce',        yayilma: 4,  sag: 0.60, agirlik: 3 },
  { desen: 'sayin',          yayilma: 11, sag: 0.52, agirlik: 3 },
  { desen: 'fatura adresi',  yayilma: 9,  sag: 0.45, agirlik: 2 },
  { desen: 'teslimat zamani', yayilma: 6, sag: 0.60, agirlik: 2 },
  { desen: 'cikis belgesi',  yayilma: 8,  sag: 0.60, agirlik: 2 },
  { desen: 'musterino',      yayilma: 1,  sag: 0.45, agirlik: 1 },
];

/**
 * ADRES BİÇİMLİ SATIR — ikinci ve ASIL çapa.
 *
 * İlk tasarımda yalnız bölüm başlıkları ("SAYIN", "Alıcı Adres") çapa
 * olarak kullanılıyordu ve ÖLÇÜM GÖSTERDİ Kİ ÇALIŞMIYOR: tam sayfa
 * çekilen e-İrsaliyelerin çoğunda o başlıklar bile okunamıyor. 45
 * fotoğrafın hiçbirinde yakınlaştırma tetiklenmedi.
 *
 * Oysa dökümlere bakınca şu görüldü: ADIN kendisi bozulsa bile ADRES
 * EKLERİ ayakta kalıyor. Gerçek örnek (fotoğraf 24, tam sayfa):
 *     yazan  : "Pınarkent Mh.53 sokak Apt: 23 D: 3 K: 3"
 *     okunan : "ile Mh.53 sokak Apt: 23D:3K:3"
 * Mahalle adı tamamen kaybolmuş ama "Mh", "sokak", "Apt" duruyor. Çünkü
 * bunlar kısa, sık geçen ve OCR'ın dilinde güçlü kalıplar.
 *
 * Yani "burada bir adres var" demek için adresin OKUNMASI gerekmiyor;
 * biçimini tanımak yetiyor. Yakınlaştırma da zaten okunmayanı okumak için.
 */
const ADRES_EKLERI = [
  'mh', 'mah', 'mahallesi', 'mahalle',
  'sk', 'sok', 'sokak', 'sokagi', 'cd', 'cad', 'cadde', 'caddesi',
  'blv', 'bulvar', 'bulvari', 'apt', 'apartmani', 'blok', 'no', 'daire',
];

/** Satır adres gibi mi duruyor? (en az iki farklı ek ya da ek + numara) */
function adresBicimliMi(sadeMetin) {
  const kelimeler = sadeMetin.split(' ').filter(Boolean);
  if (kelimeler.length < 2) return 0;
  let ek = 0, sayi = 0;
  for (const k of kelimeler) {
    if (ADRES_EKLERI.includes(k)) ek++;
    else if (/^\d{1,5}$/.test(k)) sayi++;
  }
  if (ek >= 2) return 3;                 // "mh … sokak … apt" — güçlü
  if (ek === 1 && sayi >= 1) return 2;   // "mh 53" ya da "sokak 9"
  return 0;
}

/* Bir dikdörtgen sayfanın bundan büyük bir bölümünü kaplıyorsa yakınlaştırma
   kazanç getirmiyor; ikinci geçişin anlamı kalmıyor. */
const AZAMI_ALAN_ORANI = 0.55;

/* Bundan küçük bir kırpma büyük olasılıkla yanlış yakalanmış tek bir
   sözcüktür; adres blokları her zaman bundan geniştir. */
const ASGARI_GENISLIK_ORANI = 0.12;

/**
 * Adres satırının GERÇEK sağ kenarı.
 *
 * Satırın son adres ekinden (mh/sokak/apt/no…) sonra en çok üç sözcük daha
 * alınıyor — kapı, kat, daire numaraları oraya düşüyor. Ötesi başka bir
 * sütuna ait. Sözcük kutusu yoksa satırın yarısıyla yetiniliyor.
 */
function adresSagKenari(satir, kelimeler, satirBoyu) {
  if (!Array.isArray(kelimeler) || !kelimeler.length) {
    return satir.x0 + (satir.x1 - satir.x0) * 0.5;
  }
  const icinde = kelimeler
    .filter((k) => k && Number.isFinite(k.x0) &&
      k.y0 < satir.y1 && k.y1 > satir.y0 && k.x0 >= satir.x0 - 2 && k.x1 <= satir.x1 + 2)
    .sort((a, b) => a.x0 - b.x0);
  if (icinde.length < 2) return satir.x0 + (satir.x1 - satir.x0) * 0.5;

  let sonEk = -1;
  for (let i = 0; i < icinde.length; i++) {
    if (ADRES_EKLERI.includes(sade(icinde[i].metin))) sonEk = i;
  }
  if (sonEk < 0) return satir.x0 + (satir.x1 - satir.x0) * 0.5;
  const bitis = Math.min(icinde.length - 1, sonEk + 3);
  return Math.max(icinde[bitis].x1, satir.x0 + satirBoyu * 6);
}

/** İki dikdörtgen kesişiyor mu? */
function kesisiyorMu(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** Birleşim dikdörtgeni. */
function birlestirKutu(a, b) {
  return {
    x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1),
  };
}

/**
 * Etiketlerden adres dikdörtgenlerini çıkarır.
 *
 * @param {Array<{metin:string,x0:number,y0:number,x1:number,y1:number}>} satirlar
 *        OCR'ın döndürdüğü satırlar, kaynak fotoğraf pikselinde.
 * @param {number} genislik kaynak fotoğrafın genişliği
 * @param {number} yukseklik kaynak fotoğrafın yüksekliği
 * @returns {Array<{x0,y0,x1,y1,puan:number,etiketler:string[]}>}
 *          Puanı yüksekten düşüğe sıralı. Boş dizi = etiket bulunamadı.
 */
function adresBolgeleri(satirlar, genislik, yukseklik, kelimeler) {
  if (!Array.isArray(satirlar) || !satirlar.length) return [];

  const gecerli = satirlar.filter(
    (s) => s && typeof s.metin === 'string' &&
      Number.isFinite(s.x0) && Number.isFinite(s.y0) &&
      Number.isFinite(s.x1) && Number.isFinite(s.y1) && s.x1 > s.x0 && s.y1 > s.y0
  );
  if (!gecerli.length) return [];

  /* Satır yüksekliğinin ortancası. Ortalama değil: tek bir devasa el yazısı
     ya da başlık ortalamayı kaydırıp yayılmayı bozuyor. */
  const yukseklikler = gecerli.map((s) => s.y1 - s.y0).sort((a, b) => a - b);
  const satirBoyu = yukseklikler[yukseklikler.length >> 1] || 1;

  const adaylar = [];
  for (const s of gecerli) {
    const d = sade(s.metin);

    /* ÇAPA 2 — adres biçimli satır. Etiket okunamasa da bu ayakta kalıyor.
       Satırın kendisi ve komşuları (üstte alıcı adı, altta ilçe/posta kodu)
       birlikte kırpılıyor. */
    const bicim = adresBicimliMi(d);
    if (bicim) {
      /* SATIR KUTUSU OLDUĞU GİBİ KULLANILAMIYOR — ölçüldü.
         Tam sayfa belgede OCR, soldaki adresle sağdaki tabloyu TEK SATIR
         sayıyor: "ile mh 53 sokak apt 23d 3k 3 | irsaliye zamani 16 39 38".
         Satır kutusu sayfanın %92'sini kaplıyor, yakınlaştırma kazancı
         1,09 kat çıkıyor ve bölge elenip ikinci geçiş hiç çalışmıyordu.
         Bu yüzden sağ kenar, SON ADRES EKİNİN bittiği yere çekiliyor. */
      const sag = adresSagKenari(s, kelimeler, satirBoyu);
      adaylar.push({
        x0: s.x0 - satirBoyu * 2, y0: s.y0 - satirBoyu * 2.5,
        x1: Math.min(genislik, sag + satirBoyu * 2),
        y1: s.y1 + satirBoyu * 3.5,
        puan: bicim, etiketler: ['adres-bicimli'],
      });
    }

    for (const e of ETIKETLER) {
      if (!d.includes(e.desen)) continue;
      /* Etiketin çevresinde taranacak alan: kendi satırından bir miktar
         yukarısı (üstte kalan alıcı adı için), altında `yayilma` satır,
         sağında sayfanın `sag` oranı kadarı (etiket solda değer sağda). */
      const bolge = {
        x0: s.x0 - satirBoyu,
        y0: s.y0 - satirBoyu * 1.5,
        x1: Math.min(genislik, s.x0 + genislik * e.sag),
        y1: s.y1 + satirBoyu * e.yayilma,
      };
      /* O alana düşen satırların gerçek kutuları birleştiriliyor. Böylece
         sabit bir dikdörtgen değil, metnin gerçekten olduğu yer kırpılıyor. */
      let kutu = null;
      for (const t of gecerli) {
        if (!kesisiyorMu(bolge, t)) continue;
        kutu = kutu ? birlestirKutu(kutu, t) : { x0: t.x0, y0: t.y0, x1: t.x1, y1: t.y1 };
      }
      if (!kutu) continue;
      adaylar.push({ ...kutu, puan: e.agirlik, etiketler: [e.desen] });
      break;   // bir satır birden çok etikete uymasın
    }
  }
  if (!adaylar.length) return [];

  /* Aynı bloğa ait etiketler (etikette Alıcı Adres + Semt/Mahalle + İl/İlçe
     hep bir aradadır) tek dikdörtgende toplanıyor. Üst üste binen adaylar
     birleştirilirken puanlar da toplanıyor: çok etiketli bölge, tek etiketli
     bölgeye tercih edilsin. */
  const birlesik = [];
  for (const a of adaylar) {
    const eslesen = birlesik.find((b) => kesisiyorMu(a, b));
    if (eslesen) {
      Object.assign(eslesen, birlestirKutu(eslesen, a));
      eslesen.puan += a.puan;
      for (const et of a.etiketler) if (!eslesen.etiketler.includes(et)) eslesen.etiketler.push(et);
    } else {
      birlesik.push({ ...a });
    }
  }

  /* Kenar payı: OCR kutuları harflerin tam sınırında biter; harflerin
     tepesindeki nokta ve altındaki kuyruk dışarıda kalırsa okuma bozulur. */
  const sonuc = [];
  for (const b of birlesik) {
    const pay = Math.max(satirBoyu * 0.9, (b.x1 - b.x0) * 0.03);
    const k = {
      x0: Math.max(0, Math.round(b.x0 - pay)),
      y0: Math.max(0, Math.round(b.y0 - pay)),
      x1: Math.min(genislik, Math.round(b.x1 + pay)),
      y1: Math.min(yukseklik, Math.round(b.y1 + pay)),
      puan: b.puan,
      etiketler: b.etiketler,
    };
    const g = k.x1 - k.x0, y = k.y1 - k.y0;
    if (g < genislik * ASGARI_GENISLIK_ORANI) continue;
    if ((g * y) / (genislik * yukseklik) > AZAMI_ALAN_ORANI) continue;
    k.buyutme = genislik / g;      // ikinci geçişte kazanılacak kat sayısı
    sonuc.push(k);
  }

  /* Yakınlaştırma kazancı 1,25 katın altındaysa ikinci geçiş boşuna zaman. */
  return sonuc
    .filter((k) => k.buyutme >= 1.25)
    .sort((a, b) => b.puan - a.puan || b.buyutme - a.buyutme);
}

/**
 * EĞİKLİK AÇISI
 * -------------
 * Etiket kâğıda düz yapıştırılmıyor; fotoğraflarda 15-20 derece yatık
 * örnekler var. OCR motorları birkaç dereceyi tolere ediyor, bu kadarını
 * etmiyor.
 *
 * Yöntem — yatay izdüşüm profili: görüntü bir açıyla döndürülüp her satırın
 * koyu piksel sayısı toplanır. Metin DÜZ durduğunda satır aralarında boşluk,
 * satırların üstünde yığılma olur; yani profilin VARYANSI tepe yapar. Eğik
 * durduğunda harfler satırlara yayılıp profil düzleşir. En yüksek varyansı
 * veren açı, metnin gerçek açısıdır.
 *
 * Görüntü matrisi üzerinde çalışır (0-255 gri), böylece hem tarayıcıda
 * (ImageData) hem Node'da (Jimp) aynı kod kullanılabiliyor.
 *
 * @param {Uint8ClampedArray|Uint8Array} gri tek kanallı gri piksel dizisi
 * @param {number} g genişlik
 * @param {number} y yükseklik
 * @param {number} [azami] taranacak azami açı (derece)
 * @returns {number} düzeltmek için uygulanacak açı (derece); 0 = eğiklik yok
 */
function egiklikAcisi(gri, g, y, azami = 22) {
  if (g < 40 || y < 40) return 0;

  /* Koyu piksel eşiği: ortalamanın altı. Sabit eşik gölgeli fotoğrafta
     tüm sayfayı koyu sayıyor. */
  let toplam = 0;
  for (let i = 0; i < gri.length; i++) toplam += gri[i];
  const esik = toplam / gri.length - 25;

  /* Hız için satır atlanıyor: metin açısını bulmak için her pikseli
     saymak gerekmiyor, altıda biri yetiyor. */
  const adim = Math.max(1, Math.round(y / 400));

  let enIyiAci = 0, enIyiPuan = -1;
  for (let aci = -azami; aci <= azami; aci += 1) {
    const t = Math.tan((aci * Math.PI) / 180);
    const profil = new Float64Array(y);
    for (let sy = 0; sy < y; sy += adim) {
      for (let sx = 0; sx < g; sx += 2) {
        if (gri[sy * g + sx] >= esik) continue;
        /* Bu pikselin, görüntü `aci` kadar döndürülseydi düşeceği satır. */
        const hedef = sy + ((sx - (g >> 1)) * t) | 0;
        if (hedef >= 0 && hedef < y) profil[hedef]++;
      }
    }
    /* Varyans: satırlar arası fark ne kadar keskinse o kadar büyük. */
    let ort = 0;
    for (let i = 0; i < y; i++) ort += profil[i];
    ort /= y;
    let vary = 0;
    for (let i = 0; i < y; i++) { const f = profil[i] - ort; vary += f * f; }
    if (vary > enIyiPuan) { enIyiPuan = vary; enIyiAci = aci; }
  }

  /* Bir derecelik gürültüyü düzeltmeye çalışmak fayda değil zarar:
     her döndürme yeniden örnekleme, yani biraz bulanıklık demek. */
  return Math.abs(enIyiAci) < 3 ? 0 : -enIyiAci;
}

/**
 * BİR ETİKETİN ALTINDAKİ/SAĞINDAKİ METNİ ÇIKARIR
 * ==============================================
 *
 * NEDEN GEREKLİ — ölçülmüş bir yanlış-adres tuzağı:
 * Satış belgesinde "Fatura adresi" ile "Teslimat adresi" YAN YANA iki sütun
 * hâlinde basılıyor ve çoğu zaman FARKLI adresler oluyor. Örnek belge:
 *
 *   Fatura adresi:                    Teslimat adresi:
 *   3. SANAYİ SİTESİ 52 SOK 34        ÇAKMAK MAH 134/1 SOK 9 DAİRE 6
 *
 * OCR sayfayı satır satır okuduğu için ikisi TEK SATIRDA birleşiyor:
 *   "3. SANAYİ SİTESİ 52 SOK 34 ÇAKMAK MAH 134/1 SOK 9 DAİRE 6 29397961"
 * Düz metinde bunları ayırmanın yolu yok. Motor da fatura adresini seçip
 * sürücüyü emin adımlarla YANLIŞ ADRESE gönderiyordu — hatanın en kötü
 * türü, çünkü kırmızı bile yanmıyor.
 *
 * Ayırt edici tek bilgi KONUM: teslimat sütunu, etiketinin sağında ve
 * altında. Sözcük kutuları elimizde olduğu için bunu ayırmak kolay.
 *
 * @param {Array<{metin,x0,y0,x1,y1}>} kelimeler kutulu OCR sözcükleri
 * @param {string[]} desenler sade() edilmiş etiket kalıpları
 * @param {object} [ayar] {sag:0.5, yayilma:8}
 * @returns {string|null} bloğun metni, etiket bulunamazsa null
 */
function bolumMetni(kelimeler, desenler, ayar) {
  if (!Array.isArray(kelimeler) || !kelimeler.length) return null;
  const kutulu = kelimeler.filter((k) => k && Number.isFinite(k.x0) && Number.isFinite(k.y0));
  if (!kutulu.length) return null;

  const a = ayar || {};
  const sagOran = a.sag == null ? 0.5 : a.sag;
  const yayilma = a.yayilma == null ? 8 : a.yayilma;

  const boylar = kutulu.map((k) => k.y1 - k.y0).sort((x, y) => x - y);
  const satirBoyu = boylar[boylar.length >> 1] || 10;
  const enSag = Math.max(...kutulu.map((k) => k.x1));
  const enSol = Math.min(...kutulu.map((k) => k.x0));
  const sayfaGenislik = enSag - enSol || 1;

  /* Etiket iki sözcük ("teslimat adresi") — art arda gelen sözcükler
     birleştirilerek aranıyor. */
  let etiket = null;
  for (let i = 0; i < kutulu.length && !etiket; i++) {
    for (let n = 1; n <= 3 && i + n <= kutulu.length; n++) {
      const dizi = kutulu.slice(i, i + n);
      /* Sözcükler aynı satırda olmalı, yoksa iki sütunun sözcükleri
         yan yana gelip olmayan bir etiket uydurur. */
      if (Math.abs(dizi[dizi.length - 1].y0 - dizi[0].y0) > satirBoyu * 0.7) break;
      const d = sade(dizi.map((k) => k.metin).join(' '));
      if (desenler.some((p) => d === p || d.startsWith(p))) {
        etiket = { x0: dizi[0].x0, y0: dizi[0].y0, y1: dizi[dizi.length - 1].y1 };
        break;
      }
    }
  }
  if (!etiket) return null;

  /* Etiketin sütunu: solunda küçük bir pay, sağında sayfanın bir bölümü. */
  const solSinir = etiket.x0 - satirBoyu * 1.2;
  const sagSinir = etiket.x0 + sayfaGenislik * sagOran;
  const altSinir = etiket.y1 + satirBoyu * yayilma;

  const secilen = kutulu.filter((k) =>
    k.x0 >= solSinir && k.x0 <= sagSinir && k.y0 >= etiket.y0 && k.y0 <= altSinir);
  if (secilen.length < 2) return null;

  /* Okuma sırasına diz: önce satır (yuvarlanmış y), sonra x. */
  secilen.sort((p, q) => {
    const fark = p.y0 - q.y0;
    if (Math.abs(fark) > satirBoyu * 0.6) return fark;
    return p.x0 - q.x0;
  });
  const satirlar = [];
  let sonY = null;
  for (const k of secilen) {
    if (sonY === null || Math.abs(k.y0 - sonY) > satirBoyu * 0.6) { satirlar.push([]); sonY = k.y0; }
    satirlar[satirlar.length - 1].push(k.metin);
  }
  return satirlar.map((s) => s.join(' ')).join('\n');
}

/**
 * BİR ETİKETİN AYNI SATIRDAKİ DEĞERİ — "Semt/Mahalle: Fatih Mh."
 *
 * NEDEN GEREKLİ — ölçülmüş sessiz yanlış:
 * Teslimat etiketinde alanlar ADIYLA yazılı (İl/İlçe, Semt/Mahalle, Alıcı
 * Adres). Fotoğraf yoluyla okunduğunda hepsi tek bir metin yığınına
 * giriyor ve "hangi satır ne" bilgisi kayboluyor. Sonra motor, sayfadaki
 * BAŞKA bir adresi (fatura adresi) seçebiliyor.
 *
 * Gerçek örnek: etikette "Semt/Mahalle: Mehmet Akif Ersoy Mh." ve
 * "Alıcı Adres: bağdat sitesi f blok 49/1. sk., daire: 2" DOĞRU okunmuştu.
 * Ama aynı sayfadaki fatura adresi (ZAFER MAH 1016 SK 29/2) kapı numarası
 * taşıdığı için daha yüksek puan aldı ve %95 güvenle seçildi — sürücü
 * yanlış mahalleye giderdi. Motor "kesin olan yanlışı" "belirsiz olan
 * doğruya" tercih etmişti.
 *
 * Bu işlev alanı yeniden ADIYLA okuyor: etiketin sağında, aynı satırda
 * kalan sözcükler. Böylece etiket yapılandırılmış bir kaynak olarak geri
 * geliyor (bkz. metin.ayiklaEtiket).
 *
 * @param {Array<{metin,x0,y0,x1,y1}>} kelimeler kutulu OCR sözcükleri
 * @param {string[]} desenler sade() edilmiş etiket kalıpları
 * @returns {string|null}
 */
function satirDegeri(kelimeler, desenler) {
  if (!Array.isArray(kelimeler) || !kelimeler.length) return null;
  const kutulu = kelimeler.filter((k) => k && Number.isFinite(k.x0) && Number.isFinite(k.y0));
  if (!kutulu.length) return null;

  const boylar = kutulu.map((k) => k.y1 - k.y0).sort((a, b) => a - b);
  const satirBoyu = boylar[boylar.length >> 1] || 10;
  const enSag = Math.max(...kutulu.map((k) => k.x1));

  /* Etiketi bul — bir, iki ya da üç sözcük ("alıcı adres", "semt mahalle"). */
  let etiket = null;
  for (let i = 0; i < kutulu.length && !etiket; i++) {
    for (let n = 1; n <= 3 && i + n <= kutulu.length; n++) {
      const dizi = kutulu.slice(i, i + n);
      if (Math.abs(dizi[dizi.length - 1].y0 - dizi[0].y0) > satirBoyu * 0.7) break;
      const d = sade(dizi.map((k) => k.metin).join(' '));
      if (desenler.some((p) => d === p || d.startsWith(p))) {
        etiket = { x1: dizi[dizi.length - 1].x1, y0: dizi[0].y0, y1: dizi[dizi.length - 1].y1 };
        break;
      }
    }
  }
  if (!etiket) return null;

  /* Aynı satırda, etiketin sağında kalanlar. Satır ortası ölçütü:
     sözcüğün dikey merkezi etiketin dikey aralığında olmalı. */
  const orta = (k) => (k.y0 + k.y1) / 2;
  const etiketOrta = (etiket.y0 + etiket.y1) / 2;
  const secilen = kutulu
    .filter((k) => k.x0 >= etiket.x1 - satirBoyu * 0.3 && k.x1 <= enSag + 2 &&
      Math.abs(orta(k) - etiketOrta) < satirBoyu * 0.6)
    .sort((a, b) => a.x0 - b.x0);
  if (!secilen.length) return null;

  /* Sağdaki başka bir sütuna taşmasın: sözcükler arasında satır boyunun
     6 katından büyük bir boşluk varsa orada kesiliyor. */
  const parcalar = [secilen[0].metin];
  for (let i = 1; i < secilen.length; i++) {
    if (secilen[i].x0 - secilen[i - 1].x1 > satirBoyu * 6) break;
    parcalar.push(secilen[i].metin);
  }
  const metin = parcalar.join(' ').replace(/^[:\s.]+/, '').trim();
  return metin.length >= 2 ? metin : null;
}

/* Bölüm etiketleri — sade() edilmiş hâlleriyle. */
/* "teslimat" TEK BAŞINA DESEN OLARAK KULLANILMIYOR — ölçüldü:
   belgede "Teslimat tarihi:" ve "Teslimat türü:" de geçiyor ve blok yanlış
   yerden, sayfanın üst tarafından başlıyordu. */
const TESLIMAT_DESENLERI = ['teslimat adresi', 'teslimat adres'];
const FATURA_DESENLERI = ['fatura adresi', 'fatura adres'];

/* Teslimat etiketinin alan adları — `satirDegeri` ile okunuyor. */
const ETIKET_ALANLARI = {
  ilIlce: ['il ilce', 'ililce'],
  semtMahalle: ['semt mahalle', 'semtmahalle'],
  acikAdres: ['alici adres', 'aliciadres'],
};

module.exports = {
  adresBolgeleri, egiklikAcisi, bolumMetni, satirDegeri,
  ETIKETLER, TESLIMAT_DESENLERI, FATURA_DESENLERI, ETIKET_ALANLARI,
};

  };

  global.Motor = {
    metin: require('./metin'),
    adres: require('./adres'),
    kaynakPaket: require('./kaynak-paket'),
    fatura: require('./fatura'),
    rota: require('./rota'),
    ors: require('./ors'),
    bolge: require('./bolge'),
    surum: '20260831002802',
  };
})(typeof self !== 'undefined' ? self : this);
