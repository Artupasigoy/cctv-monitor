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
- Hindari multiple go2rtc: config file persisten di data dir; port API konsisten 1984.

## Browser Strategy (Efisiensi Low-Spec)

- **Bundled Chromium (Chrome for Testing) OPSIONAL** — ~400MB ter-install. Hanya untuk amd64 & arm64 (tidak ada untuk armv7/386).
- Default: launcher **memakai browser sistem** yang sudah terpasang (`chromium`, `chromium-browser`, `chrome`, `firefox`, `epiphany`, `falkon`) — lebih hemat RAM/disk di device low-spec.
- Flag `--browser`: `chromium|firefox|system|bundled|<nama-binary>`.
- Flag `--kiosk`: mode fullscreen untuk STB/raspi display.
- Profil browser terpisah di `~/.config/cctv-monitor/browser-profile` (tidak menyentuh profil user).

### Linux CLI (headless) — browser tetap muncul GUI
- Jika environment punya display server (Xorg/Wayland terhubung TV/monitor, atau X11 forwarding), `cctv-monitor` otomatis membuka Chromium.
- Jika `$DISPLAY` kosong dan `xvfb-run` tersedia, launcher membungkus Chromium dalam `xvfb-run -a` (X virtual framebuffer). Install dep opsional: `apt-get install -y chromium xvfb`.
- Browser terbuka lepas dari launcher: menutup jendela browser **tidak menghentikan** launcher. Launcher tetap serve + go2rtc berjalan; untuk buka ulang browser buka `http://127.0.0.1:1986` atau jalankan `cctv-monitor --port 1987`.

## Linux Priority (Device Compatible)

Target: Linux **x64, arm64, armv7, i386** (PC, mini PC, Raspi, server, STB).

- Build: `./scripts/build.sh <arch>` (amd64|arm64|arm|386).
- Install: `sudo ./scripts/install.sh` → `/opt/cctv-monitor` + symlink `/usr/local/bin/cctv-monitor` + systemd user service + desktop entry.
- User non-developer cukup meng-copy folder package dan menjalankan `cctv-monitor`.
- Tidak mengharuskan user install Node.js / npm / Python / PHP / database server.
- Untuk raspi/STB armhf (tidak didukung Chrome for Testing), install browser sistem dari repo distro (mis. `chromium`).

## Development Environment

- Node.js hanya untuk development/build frontend (`npm install`, `npm run dev`).
- Production application tidak boleh membutuhkan Node.js (launcher + dist + go2rtc + browser).

## Project Structure (Webbase)

```
cctv-monitor/
├── src/                     # frontend React (sama)
├── launcher/                # Go launcher (serve + scan + go2rtc + browser)
│   ├── main.go              # entry, flags, lifecycle, HTTP server
│   ├── scanner.go           # scan LAN (/scan API)
│   ├── go2rtc.go            # sidecar process management
│   └── browser.go           # resolve & buka browser (bundled/system)
├── resources/
│   ├── go2rtc               # sidecar binary (fetch-go2rtc.sh)
│   └── chromium/            # OPSIONAL (fetch-chromium.sh)
├── scripts/
│   ├── build.sh             # build frontend + launcher per-arch
│   ├── install.sh           # install ke /opt + symlink + service
│   ├── fetch-go2rtc.sh
│   └── fetch-chromium.sh
└── dist-package/<arch>/     # hasil build siap-package
```

## Flags Launcher

| Flag | Default | Fungsi |
|------|---------|--------|
| `--port` | 1986 | port server web + scan |
| `--go2rtc-port` | 1984 | port API go2rtc |
| `--browser` | auto | `chromium\|firefox\|system\|bundled\|<nama>` |
| `--kiosk` | false | mode fullscreen (STB/raspi) |
| `--headless` | false | serve + go2rtc saja, tanpa browser |
| `--no-go2rtc` | false | jangan spawn go2rtc (dev frontend) |
| `--data-dir` | auto | override folder data |
