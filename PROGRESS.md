# PROGRESS — Local CCTV Monitor (Webbase)

> Catatan progres agar mudah dilanjutkan. Update file ini di setiap akhir sesi kerja.

## Status Umum

| Area | Status | Catatan |
|------|--------|---------|
| Frontend (Vite+React+TS) | SELESAI | Build lolos, UI terverifikasi di browser |
| Launcher Go (webbase) | SELESAI | serve dist + `/scan` + spawn go2rtc + buka browser; headless/kiosk; multi-arch |
| go2rtc sidecar | SELESAI | `resources/go2rtc` (linux multi-arch); config `go2rtc.yaml` digenerate, process cleanup saat exit |
| Browser strategy | SELESAI | Bundled Chromium OPSIONAL; default pakai browser sistem (low-spec friendly) |
| Streaming/Reconnect | SELESAI | WebRTC client + auto reconnect via go2rtc API |
| Settings | SELESAI | Form kamera + aplikasi, credential terenkripsi AES-GCM, hapus kredensial |
| Auto-detect RTSP path | SELESAI | `detectRtspPath` via go2rtc probe (kandidat EZVIZ) |
| Scan kamera (LAN) | SELESAI | Launcher Go `/scan` (auto-detect subnet + connect-scan 554/8000) + filter RTSP-only di frontend |
| Mode scan-only | SELESAI | Input manual IP/port/path dihapus; alur Scan → Masukkan Kredensial → Simpan & Terapkan |
| Settings minimal | SELESAI | Hanya Default Layout + nama/enabled/kredensial kamera yang editable; go2rtc/scan jadi info otomatis |
| Build multi-arch + install | SELESAI | `scripts/build.sh` (amd64/arm64/arm/386) + `install.sh` (desktop + CLI-only) |
| Verifikasi Playwright full | TODO | Verifikasi UI di dalam launcher (served dist) bila ada environment dengan display |

## Langkah Berikutnya (urutan)

1. ~~Scaffold Vite + React + TypeScript~~ ✅
2. ~~Types, config service, services, hooks, UI, settings~~ ✅
3. ~~Enkripsi credential kamera (AES-GCM, key non-extractable di IndexedDB)~~ ✅
4. ~~Auto-detect RTSP path (kandidat EZVIZ via go2rtc probe)~~ ✅
5. ~~Mode scan-only: scan server Node dev + alur Scan → kredensial → terapkan~~ ✅
6. ~~Pivot arsitektur: webbase + launcher Go (bukan Tauri/Windows)~~ ✅
7. ~~Launcher Go: serve dist + /scan + spawn/ensure/cleanup go2rtc + buka browser~~ ✅
8. ~~Scripts: fetch-go2rtc.sh, fetch-chromium.sh, build.sh, install.sh~~ ✅
9. Uji end-to-end launcher di device nyata (raspi/STB/low-spec) + verifikasi UI di served dist.
10. Verifikasi streaming kamera EZVIZ nyata saat kredensial tersedia.

## Catatan Penting

- **Prioritas: efisiensi untuk device low-spec** (PC, mini PC, Raspi, server, STB). Browser bundle optional; default pakai browser sistem.
- Arsitektur webbase: web app di-serve launcher Go, ditampilkan di bundled/system browser. Tanpa Tauri, tanpa Node.js saat runtime produksi.
- Rule utama ada di `AGENTS.md` + `docs/agents/`.
- LAN-only, offline-first, tanpa recording/playback/cloud.
- Jangan hardcode IP kamera. Semua configurable (mode scan-only).
- Tanpa credential di source code/log/git.
- Tanpa dependency CDN/eksternal di runtime.

## Environment

- OS: Linux (dev + target produksi). Target arch: amd64, arm64, armv7, i386.
- Node: v22.x (hanya untuk build/dev), Go: 1.26 (launcher).
- go2rtc: v1.9.14 (binary di `resources/go2rtc`, fetch via `scripts/fetch-go2rtc.sh`).
- Working dir: `/root/cctv-monitor-webbase`
- Dev server: `npm run dev` → http://localhost:1420 (tanpa launcher)
- Launcher: `./dist-package/<arch>/cctv-monitor --headless` (test) atau `cctv-monitor` (dengan browser).
- Scan server dev (Node): `npm run scan-server` → port 1986. Produksi: `/scan` bawaan launcher (port sama 1986).

## Sesi Kerja

### 2026-08-15 — Sesi 4 (Pivot: Webbase Linux, low-spec)
- Keputusan user (menjawab dialog): 
  - **Buang arah Windows-native/Tauri** yang baru di-scaffold. Buat salinan project (`cctv-monitor-webbase`) dan rombak di salinan.
  - Aplikasi **webbase saja**: launcher lokal + bundled Chromium menunjuk ke localhost.
  - Stack: **Go single binary** untuk launcher/server/scan (bisa compile 386/arm).
  - **Hanya 64-bit** (ralat dari rencana 32-bit), **terbuka penyesuaian stack demi kompatibilitas semua device** (PC, mini PC, raspi, server, STB) + efisiensi resource untuk low-spec.
  - "Linux CLI" = bisa diinstall/dijalankan dari terminal (walaupun Linux tanpa desktop, Chromium tetap GUI untuk menampilkan app).
- Implementasi:
  - `launcher/` (Go 1.26, stdlib only, tanpa dependency eksternal):
    - `main.go`: flags (`--port` 1986, `--go2rtc-port` 1984, `--browser`, `--kiosk`, `--headless`, `--no-go2rtc`, `--data-dir`), path relatif ke exeDir, SPA fallback serve dist, graceful shutdown (SIGINT/SIGTERM), cleanup go2rtc.
    - `scanner.go`: `/scan` API ekuivalen scan-server.mjs — auto-detect subnet privat via `net.Interfaces`, parse range CIDR/host-range, connect-scan port 554+8000 (timeout 400ms, concurrency 100), JSON `{found:[{host,ports}]}`.
    - `go2rtc.go`: ensure config `go2rtc.yaml` (streams kosong) di data dir, spawn child `-config`, polling TCP port API, deteksi exit tak terduga, kill saat exit.
    - `browser.go`: resolve browser — default **sistem** (chromium/chromium-browser/google-chrome/edge/firefox-esr/firefox/epiphany/falkon) lalu fallback bundled Chromium (`resources/chromium/chrome`); flag `--browser`; mode `--kiosk`; profile terpisah di data dir.
  - Scripts:
    - `fetch-go2rtc.sh`: unduh go2rtc sesuai arch host (amd64/arm64/arm/armv6/i386).
    - `fetch-chromium.sh`: unduh Chrome for Testing **opsional** (hanya amd64/arm64; armv7/386 → browser sistem).
    - `build.sh <arch>`: build frontend + launcher (CGO=0, `-s -w`, GOARCH/GOARM) → `dist-package/<arch>/` (cctv-monitor + dist + resources).
    - `install.sh`: copy ke `/opt/cctv-monitor`, symlink `/usr/local/bin/cctv-monitor`, systemd user service (jika ada sesi), desktop entry.
  - `resources/go2rtc`: v1.9.14 linux-amd64 (5.7MB). Chromium bundle dihapus dari package default (opsional, 392MB).
  - Bersihkan artifact Tauri/Windows dari salinan: `src-tauri/`, `@tauri-apps/*`, go2rtc.exe.
  - Docs: architecture.md, desktop.md, AGENTS.md, PROGRESS.md di-update ke arsitektur webbase.
- Verifikasi di WSL (headless): `curl /health` OK; `curl /api/streams` (go2rtc) `{}`; `curl "/scan?range=192.168.18.57,..."` → `{host:"192.168.18.57",ports:[554,8000]}` (kamera EZVIZ terdeteksi); config go2rtc.yaml digenerate di `~/.config/cctv-monitor/`; SIGTERM mematikan go2rtc (no orphan). Package tanpa Chromium = **12MB**.
- Catatan: frontend tidak diubah (config default sudah cocok: go2rtc 127.0.0.1:1984, scan port 1986 = port launcher). Comment scanService.ts di-update (produksi = launcher Go).

### 2026-08-15 — Sesi 3 (Mode scan-only)
- Keputusan user: **ubah ke mode scan saja** — user tidak perlu tahu IP/port/path; alur: Scan → pilih kamera aktif → input kredensial → otomatis terapkan; putus sesi = Hapus Kredensial di Settings.
- Implementasi:
  - `scripts/scan-server.mjs` (Node, dev): HTTP `GET /scan` → TCP connect-scan port 554+8000 di subnet auto-detect (interface host) atau range yang di-override; CORS; JSON `{found:[{host,ports}]}`.
  - `scanService.ts`: default `httpScanner` — panggil scan server via `go2rtc.host:scan.port`, **filter hanya host dengan port 554 (RTSP)** agar yang tampil hanya kamera yang bisa di-stream.
  - `types/settings.ts` + `config.example.json`: tambah `settings.scan {port, range}` (range kosong = auto-detect).
  - `Settings.tsx`: **input manual host/port/path/username/password dihapus**. Alur baru: tombol "Scan Kamera" → daftar kamera (nama+host+port) → "Masukkan Kredensial" (form Nama/Username/Password) → "Simpan & Terapkan" (tambah kamera + auto-detect path + PUT ke go2rtc). Kartu kamera: info host/port (read-only), status kredensial, tombol "Hapus Kredensial" (putus sesi), "Ganti", "Hapus Kamera".
  - `isCameraConfigured` (streamService + cameraService): kini butuh kredensial → setelah Hapus Kredensial, frontend berhenti streaming (sesi benar-benar putus).
  - `config.example.json`: `cameras` default jadi `[]` (mulai dari scan, bukan 4 placeholder).
  - Settings disederhanakan: input go2rtc host/port, scan port, rentang scan dihapus dari UI → hanya "Default Layout" yang editable; streaming server & scan jaringan tampil sebagai info read-only.
- Catatan go2rtc: config `streams: {}` ditolak parser go2rtc (yaml line 12 error) saat PUT — gunakan `streams:` (kosong). go2rtc 1.9.14 menulis kembali stream hasil PUT ke file config (jadi credential RTSP ada di file go2rtc lokal — wajar, file lokal milik user).

### 2026-08-15 — Sesi 1
- AGENTS.md dipecah jadi indeks + `docs/agents/*.md` (7 file).
- Scaffold Vite + React + TS selesai (`npm install` OK, `npm run build` lolos).
- Implementasi:
  - `src/types/`: camera, layout, settings
  - `src/services/`: configService (localStorage + config.example.json), cameraService (status store), streamService (WebRTC client ke go2rtc `/api/ws` + exponential backoff reconnect 1s→30s)
  - `src/hooks/`: useCamera, useStream, useFullscreen, useCameraStatusesSummary
  - `src/components/`: CameraGrid, CameraTile, CameraSelector, LayoutSelector, StatusIndicator
  - `src/pages/`: Monitor, Settings
  - CSS dark theme lokal (`src/styles.css`)
- UI terverifikasi via Playwright: layout 1/3, pemilihan kamera slot, fullscreen + Esc, status RECONNECTING ketika go2rtc tidak ada, status bar summary.
- Catatan: streamService menghubungi `ws://<go2rtcHost>:<apiPort>/api/ws?src=cam_<id>`. go2rtc belum jalan, sehingga status reconnecting = perilaku yang benar.

### 2026-08-15 — Sesi 2 (UI Redesign ala EZVIZ Studio)
- Research mendalam UI EZVIZ Studio (萤石工作室 PC client).
- Redesign UI mengikuti pola EZVIZ Studio:
  - **Topbar**: brand (logo + "CCTV MONITOR"), layout switcher (1|2|3|4), tombol Settings.
  - **Left sidebar** (`CameraList.tsx`): daftar "Kamera Saya" dengan status dot, tombol play ▶/stop ■ (tampilkan/hapus kamera di grid).
  - **Grid + tile** (`CameraTile.tsx`): overlay nama kiri-atas, status kanan-atas, controls hover reveal (camera selector + fullscreen) di bawah, double-click fullscreen, hint Esc + tombol ✕ saat fullscreen.
  - **Statusbar**: Online/Reconnecting/Offline dengan status dot.
  - **Tema dark biru** ala EZVIZ (`--accent: #2ea8ff`, panel #0b0f14/#11161d/#151b24).
- Monitor.tsx: kamera di sidebar bisa di-toggle ke grid; pemilihan slot tetap via dropdown di tile; assignment kamera unik (satu kamera hanya di satu slot).
- Build lolos, UI terverifikasi via Playwright (toggle sidebar, fullscreen+Esc, shortcut layout 1-4).

## Konvensi Teknis yang Sudah Ditetapkan

- Stream name di go2rtc: `cam_<cameraId>` (dari `go2rtcStreamName()`).
- Config default: `config.example.json` (tanpa credential), di-load saat localStorage kosong.
- Config tersimpan di localStorage browser (profil browser terpisah di data dir launcher).
- go2rtc host/port default: `127.0.0.1:1984` (dikendalikan launcher; tidak editable di UI).
- Scan: launcher `/scan` port 1986 (default `settings.scan.port`); range kosong = auto-detect subnet.
