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
 * - ADRES VERİSİ (veri/*.json): önce önbellek. Bu dosyalar değişmiyor,
 *   her açılışta 7 MB indirmenin anlamı yok. Belediye verisi tazelendiğinde
 *   SURUM değiştirilip yeni önbellek oluşturuluyor.
 */

const SURUM = 'rota-v1';
const KABUK = 'kabuk-' + SURUM;
const VERI = 'veri-' + SURUM;

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
