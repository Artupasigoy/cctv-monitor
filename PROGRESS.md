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
| Build multi-arch + install | SELESAI | `scripts/build.sh` (amd64/arm64/arm/386, go2rtc diunduh otomatis per-arch saat cross-build) + `install.sh` (desktop + CLI-only) |
| Uninstall bersih | SELESAI | `scripts/uninstall.sh [--purge-data]` — hapus /opt + symlink + systemd + desktop entry (+ data dir) |
| Smart installer | SELESAI | `install-release.sh` one-liner: deteksi arch, fresh/update + approval versi, autostart, info akses akhir |
| Subcommand launcher | SELESAI | `help`, `version`, `status`, `open-browser`, `close-browser`, `enable/disable-autostart`, `uninstall` |
| Auto-start saat reboot | SELESAI | systemd user service + enable-linger (aktif default saat install) |
| Package release | SELESAI | `scripts/package.sh` → `dist-package/release/cctv-monitor-linux-<arch>.tar.gz` |
| Browser standarisasi | SELESAI | Chromium-family only (firefox/epiphany/falkon ditolak), autoplay flag, auto-install chromium (menolak = instalasi berhenti) |
| Installer hardening | SELESAI | Semua cek & persetujuan di awal; fallback install chromium utk Ubuntu modern (chromium-browser/snap); deteksi /snap/bin (installer + launcher); detect_runuser tahan logname kosong; download retry+cache-buster; preflight+rollback |
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

### 2026-08-16 — Sesi 9 (Audit hardening: anti-beban terus-menerus + error reporting jelas)
- Audit penuh jalur streaming/reconnect/lifecycle/launcher. Temuan: (1) reconnect loop tanpa batas saat autoplay diblokir, (2) reconnect tak pernah berhenti saat kamera offline permanen, (3) `handleStall` reconnect tanpa backoff, (4) orphan go2rtc saat launcher SIGKILL terus menarik RTSP, (5) kode mati `iceTrickleSupported`.
- Perbaikan:
  - `streamService.ts`: `MAX_RECONNECT_ATTEMPTS=20` → setelah itu **offline** + slow retry **5 menit** (`SLOW_RETRY_DELAY_MS`) dengan pesan jelas; `retryNow()` (tombol Coba Lagi); `reconnectWithBackoff()` untuk stall; hapus `iceTrickleSupported`; pesan per skenario.
  - `cameraService.ts`: `setCameraStatus` menyimpan `lastError` (dibersihkan saat online).
  - `useStream.ts`: `handleStall` memakai backoff (bukan reconnect langsung); **proteksi autoplay** — video `paused` karena autoplay diblokir TIDAK dianggap stall; return `retry`.
  - `CameraTile.tsx`: tombol "↻ Coba Lagi" (saat offline/error/reconnecting) + pesan status (`lastError`) di tile.
  - `launcher/go2rtc.go`: **reclaim orphan** — jika port API 1984 terisi, deteksi go2rtc milik aplikasi via `/proc` cmdline (path config) & bunuh sebelum spawn baru.
- Verifikasi: go build/vet OK, typecheck OK. Orphan test: go2rtc manual di port 1984 → launcher membunuh orphan & spawn baru (log terbukti). Dev server + playwright: tombol Coba Lagi & pesan "WebSocket error" tampil; retry memicu koneksi ulang.
- Docs: `docs/agents/streaming.md` (batas reconnect + slow retry + autoplay guard), `docs/agents/desktop.md` (orphan reclaim).

### 2026-08-16 — Sesi 8 (Suara live CCTV: toggle Bisu/Suara, default off)
- Fitur suara: `settings.soundEnabled` (default `false`). Tombol di topbar — ikon speaker **tercoret** saat nonaktif (Bisu), speaker normal saat aktif (Suara). Global untuk semua tile.
- `StreamConnection` menambah `addTransceiver('audio', recvonly)` agar track audio diterima via WebRTC; `<video muted={!soundEnabled}>`.
- `loadConfig()` di-merge dengan default settings agar config lama (tanpa `soundEnabled`) tidak error.
- Komponen `SpeakerIcon.tsx` (SVG lokal, no CDN — sesuai UI dependency policy).
- Terverifikasi via dev server + playwright: default Bisu, toggle dua arah, persistensi localStorage, ikon coret hadir.
- Docs: `docs/agents/frontend.md` (Audio Policy), PROGRESS.md.

### 2026-08-16 — Sesi 7 (Browser standarisasi: Chromium-family only + auto-install gate)
- Keputusan user: **hanya Chromium-family** yang didukung resmi (chromium, chromium-browser, google-chrome, google-chrome-stable, microsoft-edge). Firefox/Epiphany/Falkon ditolak.
- `launcher/browser.go` (rewrite): daftar browser disaring chromium-only; cabang Firefox/Epiphany dihapus; flag `--autoplay-policy=no-user-gesture-required` untuk semua mode; `--no-sandbox` otomatis saat root; pesan error runtime berisi cara install per distro + catatan SELinux/Fedora; `--browser` non-chromium ditolak. Hapus `resolveCmd`/xvfb auto-wrap (xvfb jadi manual). Hapus `execLookPath` duplikat di main.go.
- `scripts/lib-install.sh`: tambah `ensure_browser` — deteksi chromium ada (PATH + bundled); jika tidak ada → deteksi package manager (`apt`/`dnf`/`pacman`/`zypper`/`apk`) → tawarkan install `chromium`; **user menolak → instalasi exit 1** dengan pesan jelas per distro.
- `install.sh` & `install-release.sh`: panggil `ensure_browser` di awal (wajib sebelum lanjut).
- Verifikasi `ensure_browser`: (A) chromium ada → lanjut; (B) tidak ada + menolak → exit 1; (C) tidak ada + setuju → auto-install mock → lanjut.
- Docs: README, architecture.md, desktop.md, testing.md di-update ke Chromium-only.

### 2026-08-16 — Sesi 6 (Smart installer + subcommand launcher + auto-start)
- Launcher Go: tambah subcommand `help/version/status/open-browser/close-browser/enable-autostart/disable-autostart/uninstall` (launcher/cmd.go) + versi di-ldflags.
- `build.sh`: bake versi (`-X main.version`), tulis file `version` di dist-package.
- `scripts/lib-install.sh`: fungsi bersama (detect_arch, detect_runuser, enable/disable_autostart, create_desktop_entry, print_access_info).
- `install.sh`: pakai lib, **aktifkan autostart default** (systemd user service + enable-linger), tampilkan info akses akhir (buka GUI, tutup/buka browser, help, uninstall, keterangan reboot).
- `install-release.sh` (rewrite): smart installer — deteksi arch, cek fresh/update (versi sama → info + konfirmasi; beda → saran update + persetujuan user), install, autostart, info akhir. Env `RAW_BASE`/`REL_BASE` untuk testing/self-host.
- `scripts/package.sh`: buat tarball `cctv-monitor-linux-<arch>.tar.gz` (4 arch, berisi launcher+dist+go2rtc+scripts).
- Verifikasi di host:
  - `cctv-monitor version/help/status` OK; `status` deteksi server+go2rtc; `open-browser`/`close-browser` pesan benar tanpa display.
  - Smart installer (mock server): fresh install v0.1.0 OK; versi sama → "sudah terbaru" + batal; versi beda v0.2.0 → tawaran update + setuju → sukses.
  - `uninstall.sh --purge-data` bersih (hapus /opt, symlink, desktop, service, data dir).
- Docs: README.md (alur smart install, command reference, best practice, autostart, to-do), PROGRESS.md.

### 2026-08-16 — Sesi 5 (Verifikasi install/uninstall multi-device)
- Analisis install per device: mini PC (x86_64) aman; Raspi/STB butuh build per-arch.
- Fix `scripts/build.sh`: cross-build kini **mengunduh go2rtc sesuai arch target** (sebelumnya copy go2rtc x86-64 apa adanya → salah arch di arm64/arm/386). Terverifikasi: `dist-package/{arm64,arm,386}` launcher + go2rtc arch benar.
- Fix `scripts/install-release.sh`: `PKGDIR` dipakai sebelum didefinisikan (blok subshell `cp -rn . "$PKGDIR"` dead code) → rapi & copy hanya sekali.
- Tambah `scripts/uninstall.sh`: hapus bersih `/opt/cctv-monitor`, symlink `/usr/local/bin/cctv-monitor`, systemd user service, desktop entry; data dir `~/.config/cctv-monitor` DIKEEP kecuali `--purge-data`.
- Verifikasi end-to-end di host: `install.sh` OK → launcher headless OK (`/health` 200, go2rtc API OK, SIGTERM cleanup tanpa orphan) → `uninstall.sh --yes` OK (semua artefak terhapus, data dir tetap).
- Docs: `desktop.md` ditambah tabel "Install per Device" + "Uninstall Bersih".

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
- Verifikasi di WSL (headless): `curl /health` OK; `curl /api/streams` (go2rtc) `{}`; `curl "/scan?range=<IP_KAMERA>,..."` → `{host:"<IP_KAMERA>",ports:[554,8000]}` (kamera EZVIZ terdeteksi); config go2rtc.yaml digenerate di `~/.config/cctv-monitor/`; SIGTERM mematikan go2rtc (no orphan). Package tanpa Chromium = **12MB**.
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

### 2026-08-16 — Sesi 10 (Installer: semua cek & approval di awal, pre-flight, rollback)
- Permasalahan: alur installer lama punya persetujuan DI TENGAH (setelah download), cek arch setelah browser, tidak ada verifikasi paket sebelum copy, dan tanpa rollback → risiko menunggu lama lalu gagal / meninggalkan sampah di `/opt` bila install terhenti.
- Perubahan `scripts/lib-install.sh`:
  - `ask_yes_no <prompt>`: baca jawaban dari `/dev/tty` — aman walau stdin adalah pipe (`curl | sudo bash`); tanpa ini, `read` mendapat EOF dan prompt "Setuju install?" selalu dianggap "n"/DITOLAK tanpa benar-benar menanyai user.
  - `find_chromium <pkg_dir>`: bundled chromium juga terdeteksi dari folder paket (belum ter-copy), bukan hanya INSTALL_DIR.
  - `ensure_browser <runuser> <pkg_dir>`: meneruskan pkg_dir untuk deteksi bundled; menjelaskan aplikasi butuh Chromium + tawarkan install 'chromium' via `ask_yes_no` (pilihan paling ringan & compatible dari repo distro).
  - `preflight_package <pkg>`: jalankan `${pkg}/cctv-monitor version` (exit 0 = arkh cocok & binary jalan) + cek `dist/` dan `resources/go2rtc` ada → gagal = berhenti, sistem belum berubah.
  - `check_disk_space <dst> <need>`: cek ruang disk cukup sebelum copy; otomatis naik ke ancestor terdekat yang sudah ada bila folder tujuan belum dibuat (fix: df gagal pada path baru).
  - `install_with_rollback <src> <dst>`: backup INSTALL_DIR lama → copy baru → verifikasi launcher hasil copy → hapus backup; gagal di tengah → restore backup (update) atau hapus folder parsial (fresh). Tanpa sampah.
- Perubahan `scripts/install-release.sh`: urutan baru = root → arch (fail cepat) → tag + ringkasan + **persetujuan sebelum download** → `ensure_browser` → download ke temp → ekstrak → `preflight_package` + `check_disk_space` → `install_with_rollback` → symlink → autostart → desktop entry. Update-path: `disable_autostart` dulu (matikan service lama), enable kembali setelah sukses.
- Perubahan `scripts/install.sh`: pre-flight (`preflight_package` + `check_disk_space`) sebelum copy; `ensure_browser` menerima SRC (deteksi bundled); `install_with_rollback`; matikan auto-start lama sebelum update.
- Docs: `docs/agents/desktop.md` (alur installer + pre-flight + rollback), `PROGRESS.md`.
- Catatan: repo `Artupasigoy/cctv-monitor` private — `raw.githubusercontent.com`/`api.github.com` mengembalikan 404 tanpa token, jadi one-liner install gagal hingga repo dibuat public.
- Perbaikan lanjutan (unduh tangguh): `fetch_url`/`fetch_file` di `install-release.sh` — **retry 3x + cache-buster** (query string unik) untuk mengatasi DNS sementara dan **cache 404 CDN raw** yang masih melekat sesaat setelah repo dibuat public. `source <(fetch_url ...)` kini di-guard: kalau `lib-install.sh` gagal diunduh, keluar dengan pesan jelas "GAGAL mengunduh lib-install.sh" (bukan `detect_runuser: command not found`), plus `command -v detect_runuser` sebagai cek dependensi setelah source. Download aset release memakai `fetch_file` (retry + cache-buster).
