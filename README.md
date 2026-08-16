# CCTV Monitor (Webbase)

Aplikasi monitoring **live CCTV lokal** (LAN-only, offline-first) berbasis web untuk Linux. Monitor kamera EZVIZ via RTSP lokal, tanpa recording, tanpa playback, tanpa cloud, tanpa internet.

```
┌──────────────────────────────────────────────────────────┐
│  cctv-monitor  (launcher Go, single binary)              │
│  ├─ serve frontend  → http://127.0.0.1:1986             │
│  ├─ /scan API       → deteksi kamera di LAN              │
│  ├─ spawn go2rtc    → RTSP → WebRTC (API :1984)          │
│  └─ buka browser    → bundled Chromium | browser sistem  │
└──────────────────────────────────────────────────────────┘
```

## Fitur

- **Live streaming multi-kamera** — 4 kamera, layout 1/2/3/4 (shortcut keyboard `1`–`4`).
- **Scan kamera otomatis** — deteksi subnet LAN + connect-scan port 554/8000, tanpa perlu tahu IP manual.
- **Auto-detect RTSP path** — probe kandidat jalur RTSP EZVIZ via go2rtc.
- **Kredensial aman** — terenkripsi AES-GCM, key non-extractable di IndexedDB, tidak pernah di-hardcode.
- **Mode fullscreen / kiosk** — untuk display penuh di STB/Raspi.
- **Reconnect otomatis** — WebRTC client dengan exponential backoff.
- **Offline-first** — kamera & go2rtc berjalan penuh saat internet OFF, LAN ON.

## Prioritas Proyek

1. Stabilitas streaming
2. LAN-only / offline-first
3. Ringan (low-spec friendly)
4. Security
5. UX monitoring CCTV
6. Maintainability

## Persyaratan

- Linux **x64 (amd64), arm64, armv7, i386** (PC, mini PC, Raspi, server, STB).
- Browser: **Chromium-family saja** (`chromium`, `google-chrome`, `microsoft-edge`) atau bundled Chromium (opsional). Firefox/Epiphany/Falkon **tidak didukung**.
- Node.js hanya untuk build/dev — **tidak diperlukan saat runtime**.
- Raspi 1 / Zero (armv6) **tidak didukung**.

> **Browser adalah prasyarat wajib.** Saat install, installer mendeteksi browser Chromium yang terpasang. Jika tidak ada, installer menawarkan auto-install `chromium` via package manager distro; jika user **menolak, instalasi tidak dilanjutkan** sampai Chromium terpasang.

## Install

### Opsi A — One-liner smart installer (disarankan, dari GitHub release)

Copy-paste satu perintah di CLI device target. Installer otomatis:

1. **Deteksi spesifikasi device** (`uname -m`) dan pilih paket arch yang paling compatible (`amd64`/`arm64`/`arm`/`386`).
2. **Cek instalasi lama**: fresh install langsung jalan; versi sama → info "sudah terbaru"; versi beda → **menunggu persetujuan user** sebelum update.
3. **Pastikan browser Chromium tersedia** — auto-install `chromium` (pakai `apt`/`dnf`/`pacman`/`apk`/`zypper`) dengan konfirmasi; **menolak = instalasi berhenti**.
4. Install ke `/opt/cctv-monitor` + symlink + **auto-start saat reboot** (systemd).
5. Tampilkan info akses: cara buka GUI, tutup/buka browser, help, uninstall.

```bash
curl -fsSL https://raw.githubusercontent.com/Artupasigoy/cctv-monitor/main/scripts/install-release.sh \
  | sudo bash -s -- Artupasigoy cctv-monitor
```

Saat release tersedia, alur ini langsung pakai. Tanpa release, pakai Opsi B.

### Opsi B — Dari source (build di mesin dev, install di target)

Di mesin dev:

```bash
git clone https://github.com/Artupasigoy/cctv-monitor.git
cd cctv-monitor
npm install

# build untuk arch target (cross-build mengunduh go2rtc otomatis per-arch)
./scripts/build.sh                # arch host
./scripts/build.sh arm64          # Raspi 3/4/5 64-bit
./scripts/build.sh arm            # Raspi 2/3 / STB (armv7l)
./scripts/build.sh 386            # Mini PC 32-bit

# buat tarball release (jika mau dipasang via one-liner)
./scripts/package.sh              # semua arch -> dist-package/release/*.tar.gz
```

Copy folder `dist-package/<arch>/` ke device target, lalu di device target:

```bash
sudo ./scripts/install.sh
cctv-monitor                      # normal (pakai browser sistem)
cctv-monitor --kiosk              # STB/Raspi display penuh
```

`install.sh` membuat: `/opt/cctv-monitor`, symlink `/usr/local/bin/cctv-monitor`, **systemd autostart (jalan otomatis saat reboot)**, dan desktop entry (jika ada desktop).

### Opsi C — Browser bundled (opsional, ~400 MB, hanya amd64/arm64)

```bash
./scripts/fetch-chromium.sh
```

## Panduan Penggunaan

1. Jalankan `cctv-monitor` → browser terbuka ke `http://127.0.0.1:1986`.
2. Buka **Settings** → **Scan Kamera** → pilih kamera aktif (filter otomatis: hanya yang punya RTSP).
3. **Masukkan Kredensial** (Nama / Username / Password) → **Simpan & Terapkan** (auto-detect RTSP path + daftarkan ke go2rtc).
4. Kembali ke monitor, pilih kamera dari sidebar, dan pilih slot di grid (toggle ▶ / stop ■).
5. Fullscreen: double-click tile atau tombol ✕ (Esc untuk keluar).
6. Putus sesi: **Settings** → kamera → **Hapus Kredensial**.

## Command Reference

```
cctv-monitor                       Buka tampilan GUI monitor CCTV (browser)
cctv-monitor help                  Help lengkap (semua perintah & best practice)
cctv-monitor version               Versi aplikasi
cctv-monitor status                Status server, go2rtc, dan akses
cctv-monitor open-browser          Buka kembali browser ke tampilan monitor
cctv-monitor close-browser         Tutup browser (server tetap berjalan)
cctv-monitor enable-autostart      Aktifkan auto-start saat reboot
cctv-monitor disable-autostart     Nonaktifkan auto-start saat reboot
cctv-monitor uninstall             Uninstall bersih dari sistem
```

**Best practice:**
- **Tutup browser / akses CLI**: `cctv-monitor close-browser` (server tetap jalan), buka lagi dengan `cctv-monitor open-browser`.
- **Akses manual**: buka `http://127.0.0.1:1986` di browser mana pun di device.
- **Mode STB/Raspi di TV**: `cctv-monitor --kiosk` (fullscreen).
- **Log**: `journalctl --user -u cctv-monitor -f`.
- **Auto-start aktif sejak install**: setelah reboot (mis. mati lampu lalu hidup), aplikasi langsung terbuka ke tampilan video CCTV tanpa perintah apa pun.

## Flags Launcher

| Flag | Default | Fungsi |
|------|---------|--------|
| `--port` | 1986 | port server web + scan |
| `--go2rtc-port` | 1984 | port API go2rtc |
| `--browser` | auto | `chromium\|chromium-browser\|google-chrome\|microsoft-edge\|system\|bundled` |
| `--kiosk` | false | mode fullscreen (STB/Raspi) |
| `--headless` | false | serve + go2rtc saja, tanpa browser |
| `--no-go2rtc` | false | jangan spawn go2rtc (dev frontend) |
| `--data-dir` | auto | override folder data (`~/.config/cctv-monitor`) |

## Uninstall Bersih

```bash
sudo ./scripts/uninstall.sh               # hapus app + service + desktop entry (data dir DIKEEP)
sudo ./scripts/uninstall.sh --purge-data  # + hapus data dir (config, kredensial, browser profile)
```

Menghapus: `/opt/cctv-monitor`, `/usr/local/bin/cctv-monitor`, systemd user service, desktop entry, dan (dengan `--purge-data`) `~/.config/cctv-monitor`.

## Development

```bash
npm install
npm run dev          # Vite dev server → http://localhost:1420 (tanpa launcher)
npm run scan-server  # scan server Node (dev) → port 1986
npm run build        # build frontend (tsc + vite)
npm run typecheck    # typecheck TypeScript
```

## Struktur Proyek

```
cctv-monitor/
├── src/                      # frontend React + TypeScript
│   ├── components/           # CameraGrid, CameraTile, CameraList, dst.
│   ├── hooks/                # useCamera, useStream, useFullscreen, dst.
│   ├── pages/                # Monitor, Settings
│   ├── services/             # config, camera, scan, stream (WebRTC client)
│   ├── types/                # camera, layout, settings
│   └── styles.css            # tema dark biru ala EZVIZ Studio
├── launcher/                 # Go launcher (stdlib only, tanpa dependency)
│   ├── main.go               # flags, lifecycle, HTTP server, graceful shutdown
│   ├── scanner.go            # /scan API — scan LAN kamera
│   ├── go2rtc.go             # sidecar go2rtc: config, spawn, cleanup
│   └── browser.go            # resolve browser (bundled/system) + kiosk
├── resources/
│   └── go2rtc                # sidecar binary (sesuai arch)
├── scripts/
│   ├── build.sh              # build frontend + launcher per-arch (go2rtc per-arch)
│   ├── package.sh            # buat tarball release per arch
│   ├── install.sh            # install ke /opt + symlink + autostart + info akses
│   ├── install-release.sh    # one-liner smart installer (deteksi arch, fresh/update)
│   ├── lib-install.sh        # fungsi bersama (autostart, desktop, info akhir)
│   ├── uninstall.sh          # uninstall bersih
│   ├── fetch-go2rtc.sh       # unduh go2rtc untuk arch host
│   ├── fetch-chromium.sh     # unduh bundled Chromium (opsional)
│   └── scan-server.mjs       # scan server dev (Node)
├── docs/agents/              # dokumentasi arsitektur & konvensi
├── dist-package/<arch>/      # hasil build siap-paket
└── config.example.json       # contoh config (tanpa credential)
```

## Konvensi & Batasan

- Tanpa recording / playback / NVR / cloud / AI / motion detection / notifikasi (di luar scope).
- Tanpa credential di source code / log / git.
- IP kamera tidak pernah di-hardcode — semuanya hasil scan / configurable.
- Config tersimpan di localStorage browser (profil browser terpisah di data dir launcher).
- Stream name di go2rtc: `cam_<cameraId>`.
- go2rtc host/port default: `127.0.0.1:1984` (dikendalikan launcher, tidak editable di UI).

## To-Do

- [x] Smart installer one-liner: deteksi arch otomatis + cek fresh/update + approval user + info akses akhir.
- [x] Subcommand launcher: `help`, `version`, `status`, `open-browser`, `close-browser`, `enable/disable-autostart`, `uninstall`.
- [x] Auto-start systemd saat reboot (aktif default saat install; `enable-linger`).
- [x] Script `package.sh` untuk tarball release per arch.
- [ ] Buat GitHub release multi-arch (upload tarball `cctv-monitor-linux-<arch>.tar.gz`) agar one-liner `install-release.sh` bisa dipakai langsung.
- [ ] Uji end-to-end launcher di device nyata (Raspi / STB / mini PC low-spec) + verifikasi UI di served dist.
- [ ] Verifikasi streaming kamera EZVIZ nyata saat kredensial tersedia.
- [ ] Verifikasi UI di dalam launcher (served dist) via Playwright bila ada environment dengan display.
- [ ] Tambahkan CI workflow untuk build multi-arch otomatis di tiap tag.

## Teknologi

- **Frontend**: React 18 + TypeScript + Vite
- **Launcher**: Go (single binary, stdlib only, CGO=0, multi-arch)
- **Streaming**: go2rtc v1.9.14 (RTSP → WebRTC)
- **Browser**: bundled Chromium (opsional) atau browser sistem — low-spec friendly