# Desktop — Launcher Go, go2rtc Process, Startup, Linux

## Arsitektur (Webbase + Bundled/System Browser)

Aplikasi adalah **web app** yang di-serve oleh **launcher Go** lokal, dan ditampilkan di **browser** (bundled Chromium atau browser sistem). Tanpa Tauri, tanpa WebView embedding.

```
cctv-monitor (launcher Go, Linux single binary)
  ├─ serve frontend dist/  -> http://127.0.0.1:1986
  ├─ /scan API (scan kamera LAN)
  ├─ spawn/ensure go2rtc (child process) -> API 127.0.0.1:1984
  └─ buka browser (bundled Chromium | sistem) menunjuk http://127.0.0.1:1986
```

## Application Startup

User membuka `cctv-monitor` (CLI atau desktop entry), launcher:

1. Resolve path binary (exeDir) untuk menemukan `dist/`, `resources/go2rtc`, browser.
2. Create data dir (`~/.config/cctv-monitor`).
3. Ensure go2rtc tersedia (generate `go2rtc.yaml` jika belum ada, spawn child process).
4. Start HTTP server (frontend + `/scan` + `/health`).
5. Buka browser (mode app/kiosk) ke `http://127.0.0.1:1986`.
6. Cleanup go2rtc saat exit (tidak meninggalkan orphan).

Tidak boleh membutuhkan internet.

## go2rtc Process Management

Launcher menjalankan go2rtc sebagai **child process**:

- Spawn dengan `-config <dataDir>/go2rtc.yaml` (file di-generate jika belum ada, `streams:` kosong).
- Deteksi port API go2rtc dengan polling TCP; jika gagal, cancel dan lanjut tanpa go2rtc (frontend akan menunjukkan status Reconnecting).
- Deteksi process exit tak terduga (dilaporkan via goroutine `cmd.Wait`).
- Cleanup: `cmd.Process.Kill()` saat sinyal SIGINT/SIGTERM (graceful shutdown) — tidak ada orphan.
- **Reclaim orphan**: jika port API (1984) sudah terisi saat start (mis. launcher mati paksa/SIGKILL/power loss meninggalkan go2rtc yang terus menarik RTSP), launcher mendeteksi via `/proc` cmdline (path config milik aplikasi ini) dan mematikannya sebelum spawn go2rtc baru — mencegah go2rtc berganda & beban RTSP terus-menerus.
- Hindari multiple go2rtc: config file persisten di data dir; port API konsisten 1984.

## Browser Strategy (Chromium-Family Only)

- **Standarisasi: HANYA Chromium-family** (`chromium`, `chromium-browser`, `google-chrome`, `google-chrome-stable`, `microsoft-edge`). Firefox, Epiphany, Falkon **tidak didukung** — ditolak oleh launcher (konsistensi flags, codec H.264, WebRTC, autoplay).
- **Bundled Chromium (Chrome for Testing) OPSIONAL** — ~400MB ter-install. Hanya untuk amd64 & arm64 (tidak ada untuk armv7/386).
- Default: launcher **memakai browser sistem** Chromium-family yang sudah terpasang — lebih hemat RAM/disk di device low-spec.
- Flag `--browser`: `chromium|chromium-browser|google-chrome|microsoft-edge|system|bundled`.
- Flag `--kiosk`: mode fullscreen untuk STB/raspi display.
- Flag `--autoplay-policy=no-user-gesture-required` selalu dipakai agar video live play otomatis tanpa gestur.
- `--no-sandbox` ditambahkan otomatis saat berjalan sebagai root.
- Profil browser terpisah di `~/.config/cctv-monitor/browser-profile` (tidak menyentuh profil user).
- **Auto-install saat install**: jika tidak ada browser Chromium, installer (`ensure_browser` di `lib-install.sh`) menawarkan install `chromium` via package manager distro; **menolak = instalasi dihentikan**.
- **Pre-flight sebelum sistem berubah**: installer menjalankan binary launcher dari paket temp (`preflight_package`) + cek ruang disk (`check_disk_space`) **sebelum menyalin apa pun** ke `/opt`. Paket yang tidak compatible (arkh salah / binary corrupt / disk penuh) → instalasi berhenti dengan pesan jelas, **tidak ada file yang tertinggal**.
- **Rollback**: install memakai `install_with_rollback` — versi lama di-backup, copy baru, verifikasi; gagal di tengah → versi lama dipulihkan otomatis (tidak ada sampah).

### Linux CLI (headless) — browser tetap muncul GUI
- Jika environment punya display server (Xorg/Wayland terhubung TV/monitor, atau X11 forwarding), `cctv-monitor` otomatis membuka Chromium.
- Tanpa display, Chromium perlu display server. Opsi: jalankan dalam sesi grafis, atau gunakan `xvfb-run -a cctv-monitor` secara manual (dependency `xvfb` dari repo distro).
- Browser terbuka lepas dari launcher: menutup jendela browser **tidak menghentikan** launcher. Launcher tetap serve + go2rtc berjalan; untuk buka ulang browser gunakan `cctv-monitor open-browser`.

## Linux Priority (Device Compatible)

Target: Linux **x64, arm64, armv7, i386** (PC, mini PC, Raspi, server, STB).

- Build: `./scripts/build.sh <arch>` (amd64|arm64|arm|386). Untuk cross-build, `resources/go2rtc` otomatis diunduh sesuai arch target (tidak perlu fetch manual lagi).
- Install: `sudo ./scripts/install.sh` → `/opt/cctv-monitor` + symlink `/usr/local/bin/cctv-monitor` + systemd user service + desktop entry.
- Uninstall: `sudo ./scripts/uninstall.sh [--purge-data]` (bersih, lihat bawah).
- User non-developer cukup meng-copy folder package dan menjalankan `cctv-monitor`.
- Tidak mengharuskan user install Node.js / npm / Python / PHP / database server.
- Untuk raspi/STB armhf (tidak didukung Chrome for Testing), install browser sistem dari repo distro (mis. `chromium`).

### Install per Device

| Device | Arch (`uname -m`) | Build | Browser |
|--------|-------------------|-------|---------|
| Mini PC / PC desktop | `x86_64` | `./scripts/build.sh` (host) | bundled Chromium OPSIONAL atau browser sistem |
| Raspberry Pi 3/4/5 (64-bit) | `aarch64` | `./scripts/build.sh arm64` | bundled Chromium OPSIONAL atau browser sistem (`chromium`) |
| Raspberry Pi 2/3 (32-bit) | `armv7l` | `./scripts/build.sh arm` | browser sistem (`chromium`) — bundle tidak tersedia |
| STB / armhf | `armv7l` | `./scripts/build.sh arm` | browser sistem (`chromium`) — bundle tidak tersedia |
| Mini PC 32-bit | `i686` | `./scripts/build.sh 386` | browser sistem |

Raspi 1 / Zero (armv6) tidak didukung (launcher & go2rtc armv6 di luar target).

Alur install di device target (contoh arm64):
1. Di mesin dev: `./scripts/build.sh arm64`
2. Copy folder `dist-package/arm64/` ke device target
3. Di device target: `sudo ./scripts/install.sh`
4. Jalankan: `cctv-monitor` (atau `cctv-monitor --kiosk` untuk STB/raspi display penuh)

### Uninstall Bersih

```
sudo ./scripts/uninstall.sh              # hapus app + service + desktop entry (data dir DIKEEP)
sudo ./scripts/uninstall.sh --purge-data # juga hapus data dir (config, kredensial, browser profile)
```

Menghapus: `/opt/cctv-monitor`, `/usr/local/bin/cctv-monitor`, systemd user service, desktop entry, dan (dengan `--purge-data`) `~/.config/cctv-monitor`.

### Release Installer (one-liner)

Jika sudah ada GitHub release (tag berisi aset `cctv-monitor-linux-<arch>.tar.gz`):

```
curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/main/scripts/install-release.sh \
  | sudo bash -s -- OWNER REPO [tag]
```

Alur installer (semua pengecekan & persetujuan di AWAL, sistem belum tersentuh):
1. **Deteksi arkh** (`detect_arch`) — tidak didukung → berhenti segera.
2. **Ringkasan + persetujuan** (fresh / update / versi sama) **sebelum download** — tidak ada download besar bila user menolak.
3. **Browser Chromium** dicek/diinstall — menolak → berhenti, belum ada perubahan.
4. **Download + ekstrak ke temp** (bukan ke sistem).
5. **Pre-flight**: jalankan binary dari temp + cek ruang disk → paket tidak compatible → berhenti, `/opt` tidak tersentuh.
6. **Install dengan rollback** (backup versi lama, restore bila gagal) → symlink → autostart → desktop entry.

Catatan kegagalan unduh: `fetch_url`/`fetch_file` memakai **retry (3x) + cache-buster** (query string unik) untuk mengatasi DNS sementara atau **cache 404 CDN `raw.githubusercontent.com`** yang masih melekat sesaat setelah repo dibuat public (dari status private). Bila masih gagal, pesan keluar jelas "GAGAL mengunduh lib-install.sh/paket" — bukan `command not found`. Jika 404 berlanjut beberapa saat setelah repo public, tunggu beberapa menit (cache CDN) lalu jalankan ulang.

## Development Environment

- Node.js hanya untuk development/build frontend (`npm install`, `npm run dev`).
- Production application tidak boleh membutuhkan Node.js (launcher + dist + go2rtc + browser).

## Project Structure (Webbase)

```
cctv-monitor/
├── src/                     # frontend React (sama)
├── launcher/                # Go launcher (serve + scan + go2rtc + browser)
│   ├── main.go              # entry, flags, subcommand dispatch, lifecycle, HTTP server
│   ├── cmd.go               # subcommand: help/version/status/browser/autostart/uninstall
│   ├── scanner.go           # scan LAN (/scan API)
│   ├── go2rtc.go            # sidecar process management
│   └── browser.go           # resolve & buka browser (bundled/system)
├── resources/
│   ├── go2rtc               # sidecar binary (fetch-go2rtc.sh)
│   └── chromium/            # OPSIONAL (fetch-chromium.sh)
├── scripts/
│   ├── build.sh             # build frontend + launcher per-arch (go2rtc otomatis per-arch)
│   ├── package.sh           # tarball release per arch (dist-package/release/)
│   ├── install.sh           # install ke /opt + symlink + autostart + info akses (pre-flight + rollback)
│   ├── install-release.sh   # one-liner smart installer (cek & approval di awal, pre-flight, rollback)
│   ├── lib-install.sh       # fungsi bersama (autostart, desktop, preflight_package, rollback, print_access_info)
│   ├── uninstall.sh         # uninstall bersih (--purge-data untuk hapus data dir)
│   ├── fetch-go2rtc.sh
│   └── fetch-chromium.sh
└── dist-package/<arch>/     # hasil build siap-package
```

## Flags Launcher

| Flag | Default | Fungsi |
|------|---------|--------|
| `--port` | 1986 | port server web + scan |
| `--go2rtc-port` | 1984 | port API go2rtc |
| `--browser` | auto | `chromium\|chromium-browser\|google-chrome\|microsoft-edge\|system\|bundled` |
| `--kiosk` | false | mode fullscreen (STB/raspi) |
| `--headless` | false | serve + go2rtc saja, tanpa browser |
| `--no-go2rtc` | false | jangan spawn go2rtc (dev frontend) |
| `--data-dir` | auto | override folder data |
