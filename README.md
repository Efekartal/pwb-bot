# PWB Bot

Pro Wrestling Bosphorus için hafif operasyon paneli.

## MVP amacı

- Kadroyu tek yerde görmek
- Kişileri `Aktif`, `Gelişim`, `Geri Dönüş`, `Yeni Aday`, `Beklemede`, `Aday Havuzu` statülerinde takip etmek
- Botun ürettiği önerileri bir **Onay Kutusu** içinde göstermek
- Yönetici onayı olmadan hiçbir aksiyon uygulamamak
- Sonraki aşamada WhatsApp Cloud API ile birebir mesaj akışlarını bağlamak

## Yerelde çalıştır

```bash
npm install
npm run dev
```

Ardından `http://localhost:3000`.

## Şu anda ne çalışıyor?

- Demo roster
- Statü sayımları
- Onay / Beklet / Reddet akışı
- Karar sonrası demo statü güncelleme
- Son işlemler kaydı
- Kadro görünümü

Veri şu anda tarayıcı state'inde demo olarak tutuluyor. Sayfayı yenileyince sıfırlanır.

## Supabase'e geçiş

1. Supabase projesi oluştur.
2. `supabase/schema.sql` dosyasını SQL Editor'da çalıştır.
3. `.env.example` dosyasını `.env.local` olarak kopyala.
4. Project URL ve publishable key'i doldur.
5. Mock datayı `people` / `approvals` tablolarına bağla.

## WhatsApp aşaması

1. WhatsApp webhook mesajı alır.
2. Telefon numarasından kişiyi bulur veya yeni başvuru oluşturur.
3. Kural motoru öneri çıkarır.
4. `approvals` tablosuna `pending` kayıt açar.
5. Yönetici panelden Onayla / Beklet / Reddet seçer.
6. Yalnızca onay sonrası mesaj gönderilir veya statü değiştirilir.

## Güvenlik prensibi

PWB Bot **otonom yönetici değildir**. İnsan çıkarmak, statü değiştirmek veya WhatsApp mesajı göndermek gibi dış etkili işlemler yönetici onayı olmadan yapılmaz.
