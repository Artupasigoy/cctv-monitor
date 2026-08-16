# Streaming — go2rtc, RTSP, WebRTC

## Camera Model

Aplikasi harus mendukung kamera EZVIZ selama kamera menyediakan RTSP/stream lokal yang kompatibel.

Jangan mengasumsikan seluruh model EZVIZ menggunakan URL RTSP yang sama. Camera configuration harus configurable.

Minimal konfigurasi: `id`, `name`, `host`, `port`, `username`, `password`, `rtspPath`, `enabled`, `preferredStream`.

```yaml
cameras:
  - id: cam1
    name: Depan
    host: 192.168.x.x
    port: 554
    username: admin
    password: ********
    rtspPath: /...
    enabled: true
```

Jangan memasukkan password kamera ke source code.

## go2rtc

go2rtc digunakan sebagai media gateway/relay. Tanggung jawabnya:

- menerima RTSP
- menjaga koneksi source
- restream
- menyediakan WebRTC/browser-compatible stream
- membantu reconnect
- mengurangi direct connection ke camera

Jangan memasukkan business logic aplikasi ke go2rtc. Business logic tetap di aplikasi.

## No Unnecessary Transcoding

Prioritas: `RTSP Camera -> go2rtc`. Tidak perlu transcoding jika stream kamera sudah kompatibel. Membuat 4-camera monitoring lebih ringan. Jika perpindahan stream menyebabkan masalah stabilitas, prioritaskan stabilitas dibanding kualitas.

## Auto Reconnect (WAJIB)

Jika kamera reboot, WiFi putus, kabel/network putus, RTSP connection timeout, atau go2rtc kehilangan source — aplikasi harus mencoba memulihkan stream.

Gunakan exponential backoff atau strategi reconnect yang masuk akal. Jangan membuat reconnect loop yang agresif.

Contoh interval:

```
1s, 2s, 5s, 10s, 15s, 30s
```

Setelah berhasil: status = ONLINE.

**Batas percobaan (anti-beban terus-menerus):**

- Maksimal 20 percobaan (`MAX_RECONNECT_ATTEMPTS`). Setelah itu kamera dianggap **offline** dan hanya dicoba ulang otomatis setiap **5 menit** (`SLOW_RETRY_DELAY_MS`) — tidak membebani jaringan/kamera/CCTV secara agresif saat offline permanen.
- Tombol **"Coba Lagi"** (`retryNow`) memicu koneksi ulang manual kapan saja.
- **Stall detector** (`handleStall`) memakai `reconnectWithBackoff` (jalur backoff yang sama), BUKAN langsung reconnect tanpa jeda.
- **Proteksi autoplay**: video yang `paused` karena autoplay diblokir browser TIDAK dianggap stall (mencegah reconnect loop palsu).
- Status `offline`/`reconnecting` selalu membawa pesan (`lastError`) yang ditampilkan di UI tile.

## Stream Lifecycle

Setiap kamera memiliki lifecycle:

```
IDLE
  ↓
CONNECTING
  ↓
ONLINE
  ↓
DISCONNECTED
  ↓
RECONNECTING
  ↓
ONLINE
```

Saat camera tile dihapus dari layout:

- stop unnecessary playback
- release unused WebRTC resources
- cleanup listeners
- cleanup timers

Jika kamera tidak ditampilkan, jangan mempertahankan resource streaming yang tidak diperlukan kecuali ada alasan UX yang jelas.

## Long Running Stability

Aplikasi harus berjalan 1 jam, 8 jam, 24 jam, bahkan lebih lama. Jangan membuat timer/listener/subscription yang terus menumpuk.

Perhatikan: memory leak, event listener cleanup, WebRTC cleanup, video element cleanup, reconnect timer cleanup, React component lifecycle, launcher resource cleanup, go2rtc process lifecycle. Setiap resource harus punya cleanup yang jelas.

## Performance

- Target: 4 camera live, stable 24/7, low CPU/memory.
- Tidak ada unnecessary polling; gunakan event-driven mechanism.
- Jangan jalankan proses CPU-heavy di frontend.
- Jangan lakukan image processing per frame.

## No Recording / No Playback

- TIDAK ada recording: recording button, service, storage, archive, timeline, event/automatic recording.
- TIDAK ada playback: hanya LIVE. Tidak ada history, timeline, archive.
- Jika future requirement membutuhkan recording/playback, itu perubahan arsitektur tersendiri.
