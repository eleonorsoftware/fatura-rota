/* HİZMET ÇALIŞANI — ÇEVRİMDIŞI ÇALIŞMA
 * ====================================
 *
 * Sürücü Denizli kırsalında çekmeyen yerlere gidiyor. Uygulamanın orada da
 * açılması ve adres çözmesi gerekiyor; bu yüzden hem arayüz hem 7 MB'lık
 * adres verisi önbelleğe alınıyor.
 *
 * İKİ FARKLI STRATEJİ
 * -------------------
 * - KABUK (html/css/js): önce ağ, olmazsa önbellek. Güncelleme anında gelsin.
 * - ADRES VERİSİ (veri/*.json): önce önbellek. Her açılışta 8 MB indirmenin
 *   anlamı yok.
 *
 * ⚠️ İKİ AYRI SÜRÜM SABİTİ VAR VE İKİSİ DE DERLEME SIRASINDA YAZILIYOR
 * (veri/web-derle.js). Elle dokunmayın.
 *
 * Neden ayrı: kabuk her yayında değişiyor, veri nadiren. Tek sabit
 * kullanılsaydı ya güncelleme gelmezdi ya da sürücü her yayında 8 MB
 * indirirdi.
 *
 * Bu ayrım bir hatadan doğdu: kapı↔sokak bağı sunucuya çıktı ama telefon
 * eski adres verisini önbellekten vermeye devam etti — düzeltilen veri
 * kullanıcıya hiç ulaşmadı. Veri damgası artık paket üretilince değişiyor
 * ve eski önbellek siliniyor.
 */

const KABUK_SURUM = '20260831004739';
const VERI_SURUM = '20260830234838';
const KABUK = 'kabuk-' + KABUK_SURUM;
const VERI = 'veri-' + VERI_SURUM;

/* Sürüm damgalı adresler (js/app.js?s=…) burada listelenmiyor: her yayında
   değişiyorlar ve eski liste 404 üretirdi. Kurulumda yalnız sabit adresler
   önbelleğe alınıyor; damgalı dosyalar ilk istekte ağdan gelip aşağıdaki
   kural gereği önbelleğe yazılıyor. */
const KABUK_DOSYALARI = [
  './', './index.html', './manifest.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(KABUK).then((c) => c.addAll(KABUK_DOSYALARI)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((adlar) => Promise.all(adlar.filter((a) => a !== KABUK && a !== VERI).map((a) => caches.delete(a))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const istek = e.request;
  if (istek.method !== 'GET') return;
  const url = new URL(istek.url);
  if (url.origin !== self.location.origin) return;

  /* Adres verisi ve OCR dosyaları — değişmezler, önce önbellek.
     OCR çekirdeği ve Türkçe modeli birlikte ~7 MB (sıkıştırılmış). Bunlar
     KURULUMDA İNMİYOR; ilk kez fotoğraf okutulduğunda iniyor ve orada
     kalıyor. Böylece uygulama saniyeler içinde açılıyor, ağır indirme
     kullanıcı gerçekten kamerayı kullandığında oluyor. */
  if (url.pathname.includes('/veri/') || url.pathname.includes('/ocr/')) {
    e.respondWith(
      caches.open(VERI).then((c) => c.match(istek).then((v) => v || fetch(istek).then((y) => {
        if (y.ok) c.put(istek, y.clone());
        return y;
      })))
    );
    return;
  }

  /* Kabuk — önce ağ, çevrimdışıysa önbellek. */
  e.respondWith(
    fetch(istek)
      .then((y) => {
        if (y.ok) caches.open(KABUK).then((c) => c.put(istek, y.clone()));
        return y;
      })
      .catch(() => caches.match(istek).then((v) => v || caches.match('./index.html')))
  );
});
