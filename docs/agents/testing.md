# Testing & Definition of Done

## Testing Minimum

### Functional

- application starts
- camera list loads
- layout 1, 2, 3, 4 works
- camera selection works
- fullscreen works
- Escape exits fullscreen
- camera offline state works
- reconnect works

### Network

1. Camera online.
2. Disconnect camera.
3. Wait.
4. Reconnect camera.
5. Verify application reconnects automatically.

### Long-running

Run application for several hours. Monitor RAM, CPU, stream stability, reconnect behavior. Ideal test: 24 hours.

## Manual Test Matrix

```
[ ] 1 camera layout
[ ] 2 camera layout
[ ] 3 camera layout
[ ] 4 camera layout

[ ] Camera 1 selection
[ ] Camera 2 selection
[ ] Camera 3 selection
[ ] Camera 4 selection

[ ] Fullscreen
[ ] Exit fullscreen
[ ] Window maximize
[ ] Window resize

[ ] Camera disconnect
[ ] Camera reconnect

[ ] PC internet disconnected
[ ] LAN still active
[ ] CCTV still works

[ ] Application restart
[ ] System restart (Linux)
[ ] go2rtc restart
```

## Offline Test (Mandatory)

Setelah build:

1. Start application.
2. Disconnect PC dari internet.
3. Keep LAN connected.
4. Verify semua kamera.
5. Change layout.
6. Change camera.
7. Enter fullscreen.
8. Exit fullscreen.
9. Disconnect satu kamera.
10. Reconnect kamera.

Expected:

```
Internet OFF
CCTV still works
```

Jika ada fitur yang membutuhkan internet: investigasi dan hapus dependency-nya.

## Security Test

Verify:

- Tidak ada outbound request ke external services.
- Tidak ada analytics / telemetry / cloud authentication.
- Tidak ada external CDN.
- Tidak ada credential leakage dalam logs.
- Tidak ada password dalam source code.
- Tidak ada automatic port forwarding / UPnP.
- Tidak ada internet requirement.

## Browser Test (Chromium-Family Only)

- Hanya Chromium-family yang diuji: `chromium`, `chromium-browser`, `google-chrome`, `microsoft-edge`.
- Autoplay: video live harus play otomatis (flag `--autoplay-policy=no-user-gesture-required`).
- Kiosk: `--kiosk` fullscreen berfungsi.
- Browser non-Chromium (firefox/epiphany/falkon) harus ditolak dengan pesan jelas.
- Tanpa browser: installer harus berhenti (atau auto-install dengan persetujuan user).

## Definition of Done (v1.0)

Version 1.0 selesai jika:

- 4 kamera EZVIZ dapat ditampilkan.
- Semua kamera menggunakan LAN/RTSP.
- Internet tidak diperlukan.
- Layout 1, 2, 3, 4 bekerja.
- Kamera dapat dipilih untuk setiap slot.
- Fullscreen bekerja.
- Kamera offline ditampilkan dengan status jelas.
- Kamera dapat reconnect otomatis.
- Tidak ada recording / playback / cloud dependency / external CDN.
- Tidak ada credential yang bocor.
- Aplikasi berjalan minimal beberapa jam tanpa masalah.
- Build production dapat dijalankan di Linux tanpa Node.js/Python/PHP (launcher Go + dist + go2rtc + browser).
- Aplikasi tetap berfungsi saat internet PC dimatikan tetapi LAN tetap aktif.
