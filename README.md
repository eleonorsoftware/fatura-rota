# Fatura Rota

Denizli'de teslimat yapan sürücü için: faturayı kameraya okutur, adresi bulur,
günün rotasını çıkarır.

**Uygulama:** https://eleonorsoftware.github.io/fatura-rota/

## Nasıl çalışıyor

- Fatura fotoğrafı → cihaz içi OCR (Tesseract.js, Türkçe)
- Metin → Denizli Büyükşehir Belediyesi'nin açık adres kaydıyla eşleştirme
  (718.413 kapı numarası, 132.562 yol, 620 mahalle, 19 ilçe)
- Adresler → o anki konumdan başlayan en kısa sıra
- Durak durak Google Maps'e devir

## Veri nerede duruyor

**Cihazda.** Müşteri adı, telefonu ve adresi hiçbir sunucuya gitmiyor.
Uygulamanın sunucusu yok; adres verisi de dâhil her şey tarayıcıda çalışıyor.

## iPhone'a kurmak

Safari ile adresi aç → Paylaş → **Ana Ekrana Ekle**.
Android için ayrı bir APK var (ML Kit ile daha hızlı okuma, arka planda
varış bildirimi).

---
Powered by Eleonor Software
