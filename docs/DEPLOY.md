# PWB Bot canlı kurulum

Bu proje üç çalışma parçasından oluşur:

1. **Vercel**: Next.js yönetim paneli ve API.
2. **Supabase**: kişiler, WhatsApp olayları, kararlar ve outbox veritabanı.
3. **Railway**: 7/24 açık kalan WhatsApp Web listener.

> Grup listener katmanı Baileys kullanır. Baileys resmi bir WhatsApp ürünü değildir. PWB için ayrı bir bot numarası kullanılması önerilir.

## 1. Supabase

Yeni bir Supabase projesi oluştur.

SQL Editor içinde `supabase/schema.sql` dosyasının tamamını çalıştır.

Project Settings / API bölümünden:

- Project URL
- service_role key
- publishable key

değerlerini al.

## 2. Vercel

GitHub'daki `Efekartal/pwb-bot` reposunu Vercel'e import et.

Aşağıdaki environment variable'ları gir:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=

PWB_ADMIN_USER=efe
PWB_ADMIN_PASSWORD=<güçlü bir parola>
LISTENER_SHARED_SECRET=<uzun rastgele secret>
CRON_SECRET=<başka bir uzun rastgele secret>
```

Deploy sonrası:

`https://<domain>/api/health`

adresinde `ok: true` ve `supabaseConfigured: true` görülmeli.

## 3. Railway Listener

Aynı GitHub reposundan yeni Railway Service oluştur.

Root directory:

```
/listener
```

Railway servisine şu variable'ları gir:

```
PWB_API_BASE_URL=https://<vercel-domain>
LISTENER_SHARED_SECRET=<Vercel'deki ile aynı>
PWB_GROUP_NAME_PREFIX=PWB
PWB_GROUP_JIDS=
WA_AUTH_DIR=/data/wa-auth
PWB_INCLUDE_DMS=false
WA_PHONE_NUMBER=
```

`WA_PHONE_NUMBER` verilmezse QR kod loglarda görünür. Verilirse ülke koduyla sadece rakam kullan:

```
905xxxxxxxxx
```

ve listener loglarında pairing code çıkar.

### Kalıcı oturum

Railway'de volume ekle ve `/data` yoluna mount et.

Böylece WhatsApp auth dosyaları yeniden deploy sırasında kaybolmaz.

## 4. Bot numarasını WhatsApp'a bağla

PWB için ayrı bir WhatsApp numarasını kullan.

Telefon üzerinde:

**Bağlı cihazlar → cihaz bağla**

ile Railway loglarındaki QR / pairing code'u kullan.

Bot numarasını PWB gruplarına ekle.

Listener ilk mesaj geldiğinde logda grup adını ve JID'sini gösterir.

Örnek:

```
WhatsApp group discovered
group=PWB | Topluluk
jid=1203xxxxxxxx@g.us
```

Daha sıkı kontrol istersen bu JID'leri `PWB_GROUP_JIDS` içine virgülle yaz.

## 5. Canlı test

PWB grubuna test mesajı gönder.

Akış:

```
WhatsApp
  -> Railway listener
  -> POST /api/events/whatsapp
  -> Supabase messages + activity_log
  -> people.last_activity_at
  -> Vercel panel
```

Panel en geç yaklaşık 5 saniye içinde yeni aktiviteyi görür.

## 6. Onaylı geri mesaj

Günlük kural motoru uzun süredir inaktif kişilere `approvals` kaydı üretir.

Panelde **Onayla** denirse:

1. statü güncellenir,
2. önerilen mesaj `outbox` tablosuna girer,
3. Railway listener outbox'ı alır,
4. mesaj WhatsApp'tan gönderilir,
5. gönderim sonucu `activity_log` içine yazılır.

**Beklet** veya **Reddet** denirse WhatsApp mesajı gönderilmez.

## Güvenlik

- `SUPABASE_SERVICE_ROLE_KEY` tarayıcıya gönderilmez.
- Listener API uçları `LISTENER_SHARED_SECRET` ile korunur.
- Panel Basic Auth ile korunur.
- Listener yalnızca allowlist/prefix ile seçilen PWB gruplarını işler.
- İlk sürüm medya dosyasının kendisini indirmez; sadece mesaj tipi ve metadata kaydeder.
