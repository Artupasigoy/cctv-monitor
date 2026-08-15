# Architecture

## Arsitektur Utama

```
EZVIZ Camera
    |
    | RTSP
    v
 go2rtc (sidecar binary, di-spawn launcher)
    |
    | WebRTC / browser-compatible stream
    v
 Bundled/system Chromium (mode app) -> http://127.0.0.1:1986
    |
    v
React + TypeScript UI (dist/ di-serve launcher)
```

Komponen:

- Launcher: **Go single binary** (`launcher/`) — serve frontend, endpoint scan LAN, spawn/ensure go2rtc, buka browser
- Browser: bundled Chromium (opsional) atau browser sistem (chromium/firefox) — low-spec friendly
- Frontend: React
- Language: TypeScript
- Build tool: Vite
- Video gateway: go2rtc
- Camera protocol: RTSP
- Browser/Desktop playback: WebRTC jika memungkinkan
- Configuration: localStorage browser (profil browser terpisah di `~/.config/cctv-monitor/browser-profile`)
- Database: tidak diperlukan

## Technology Stack (Required)

### Frontend

- React
- TypeScript
- Vite

### Desktop shell

- Launcher Go single binary (Linux x64 + arm64 + armv7 + 386)
- Browser: bundled Chromium (opsional) / browser sistem

### Streaming

- go2rtc
- RTSP input
- WebRTC output jika memungkinkan

### Styling

Gunakan CSS biasa, CSS Modules, atau solusi ringan yang jelas manfaatnya. Jangan menambahkan UI framework besar tanpa alasan.

## Technologies NOT to use

Jangan gunakan berikut kecuali requirement berubah secara eksplisit:

- Laravel, PHP, Next.js, Node.js backend (produksi), Express, NestJS
- MySQL, PostgreSQL, Redis
- Firebase, Supabase, AWS, Cloudflare
- EZVIZ Cloud API, external streaming service, SaaS
- analytics service, remote monitoring service

Node.js hanya untuk development/build frontend. Produksi tanpa Node.js.

Project ini aplikasi desktop LAN-only, bukan aplikasi web cloud.

## Network Architecture

Kamera dan komputer monitoring berada pada jaringan LAN yang sama.

Contoh:

```
CCTV PC      192.168.1.10
Camera 1     192.168.1.101
Camera 2     192.168.1.102
Camera 3     192.168.1.103
Camera 4     192.168.1.104
```

- IP di atas hanya contoh.
- Jangan hardcode IP tersebut ke aplikasi.
- IP kamera harus configurable (mode scan-only: ditemukan via scan, bukan input manual).
- Aplikasi tidak boleh mengasumsikan subnet tertentu.

## Prinsip Akhir

```
EZVIZ -> RTSP -> go2rtc -> WebRTC -> React -> Launcher Go + Browser -> Linux
```

Tidak perlu: Cloud, Laravel, MySQL, Redis, Next.js, External API, Recording server.

Prinsip utama:

- LOCAL FIRST
- OFFLINE FIRST
- SECURITY FIRST
- STABILITY FIRST
- SIMPLE FIRST
- EFISIEN (target low-spec: Raspi, mini PC, STB, server)

Jika dua solusi sama-sama bekerja, pilih yang:

1. lebih sederhana
2. lebih ringan
3. lebih sedikit dependency
4. lebih aman
5. lebih mudah dipelihara
6. tidak membutuhkan internet

