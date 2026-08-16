# Frontend — React + TypeScript

## UI Philosophy

- UI menyerupai aplikasi CCTV monitoring profesional tetapi sederhana.
- Video adalah elemen utama; kontrol mudah ditemukan.
- Tidak banyak menu, tidak banyak dialog.
- Dark theme (default), minim distraksi, nyaman untuk monitoring lama.
- Fokus pada: LIVE VIDEO.

Hindari: animasi berlebihan, card besar, rounded corner berlebihan, gradient tidak perlu, marketing UI, dashboard statistics yang tidak penting, navigasi tidak perlu, sidebar rumit.

## Core Features

### Camera Grid

Layout: 1, 2, 3, 4 kamera. User dapat berpindah layout dengan cepat.

### Camera Slot Assignment

Setiap slot dapat memilih kamera mana pun (tidak harus urutan ID). Contoh:

```
Layout 3:
  Slot 1 -> Camera 4
  Slot 2 -> Camera 1
  Slot 3 -> Camera 3
```

Mapping slot harus dapat diubah.

### Camera Selection UI

UI sederhana untuk memilih kamera. Contoh:

```
Camera 1 — Depan
Camera 2 — Garasi
Camera 3 — Ruang Tamu
Camera 4 — Belakang
```

Jangan buat UI terlalu kompleks.

## Camera Tile

Setiap tile minimal memiliki:

- video
- camera name
- online/offline status
- fullscreen action
- optional camera menu

Contoh:

```
┌──────────────────────────────┐
│ CAM 1 — DEPAN       ● ONLINE │
│                              │
│          LIVE VIDEO          │
│                              │
│                         ⛶   │
└──────────────────────────────┘
```

Controls harus auto-hide jika memungkinkan agar UI bersih.

### Camera Status

Status: Connecting, Online, Offline, Reconnecting, Error.

```
● ONLINE
● OFFLINE
● CONNECTING
● RECONNECTING
```

Status terlihat jelas tetapi tidak mengganggu video.

### Error UX

Jangan tampilkan tile hitam kosong tanpa penjelasan:

```
┌─────────────────────────┐
│                         │
│      CAMERA OFFLINE     │
│                         │
│    Reconnecting...      │
│                         │
└─────────────────────────┘
```

Jangan tampilkan stack trace ke user biasa. Developer mode boleh.

## Fullscreen

Setiap camera tile harus punya fullscreen:

- tombol fullscreen
- double click pada video jika memungkinkan
- keyboard Escape untuk keluar

Saat fullscreen: video memenuhi area, kontrol minimal, UI tidak mengganggu video, status tetap dapat ditampilkan minimal.

## Layout Requirements

- Responsive terhadap ukuran window (small, normal, maximized, fullscreen).
- Video mempertahankan aspect ratio.
- Default: `object-fit: contain`.
- Jangan stretching video.
- Jika mode crop dimasa depan, gunakan opsi terpisah.

## Keyboard Shortcuts

```
1 -> layout 1
2 -> layout 2
3 -> layout 3
4 -> layout 4
F -> fullscreen selected camera
Esc -> exit fullscreen
```

Disable shortcut saat user sedang mengetik di input field.

## Performance UX

- Video mendapatkan mayoritas ruang UI.
- Kontrol unobtrusive.
- Mouse idle: hide kontrol yang tidak perlu.
- Mouse move: show kontrol.
- Jangan hide status indicator yang kritikal.

## Settings UI

Settings harus sederhana.

### Camera

- camera name
- IP/hostname
- RTSP port
- RTSP path
- username
- password
- enabled/disabled
- stream preference

### Application

- default layout
- default camera assignment
- auto-start
- start minimized
- theme

Jangan membuat settings page yang kompleks.

## TypeScript

Gunakan TypeScript secara konsisten. Hindari `any` kecuali benar-benar diperlukan. Gunakan interface/type untuk: `Camera`, `CameraSlot`, `Layout`, `StreamState`, `ApplicationSettings`.

```ts
interface Camera {
  id: string
  name: string
  host: string
  port: number
  rtspPath: string
  enabled: boolean
}
```

## State Management

- Jangan langsung tambahkan Redux/Zustand jika state masih sederhana.
- Gunakan React state / Context jika diperlukan.
- Jika state kompleks dan memang butuh library, pilih solusi ringan.
- Jangan tambah dependency hanya karena populer.

## UI Dependency Policy

Jangan pasang UI framework besar hanya untuk button/grid/modal/icon. Gunakan asset/icon lokal. Jangan gunakan icon CDN.

## Audio Policy

- **Default: Audio = OFF** (`settings.soundEnabled: false`). Video element selalu `muted` kecuali user menyalakan suara.
- Tombol suara di topbar (`topbar-sound`): ikon speaker dengan **garis coret** saat nonaktif (Bisu), speaker normal saat aktif (Suara). State tersimpan di config (`localStorage`).
- Suara bersifat global (semua tile kamera), bukan per-kamera.
- WebRTC: `StreamConnection` menambahkan `addTransceiver('audio', { direction: 'recvonly' })` agar track audio diterima; `muted` attribute pada `<video>` mengontrol output.
- Jangan aktifkan microphone atau audio recording.
- Audio hanya jika ada alasan dan desain yang jelas.
