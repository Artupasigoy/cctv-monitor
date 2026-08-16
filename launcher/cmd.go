package main

import (
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// version di-override saat build via ldflags: -X main.version=<ver>
var version = "0.1.0"

const helpText = `CCTV Monitor — monitoring live CCTV lokal (LAN-only, offline-first)

PEMAKAIAN:
  cctv-monitor                       Buka tampilan GUI monitor CCTV (browser)
  cctv-monitor help                  Tampilkan bantuan ini
  cctv-monitor version               Tampilkan versi aplikasi
  cctv-monitor status                Status server, go2rtc, dan akses
  cctv-monitor open-browser          Buka kembali browser ke tampilan monitor
  cctv-monitor close-browser         Tutup browser (server tetap berjalan)
  cctv-monitor enable-autostart      Aktifkan auto-start saat reboot
  cctv-monitor disable-autostart     Nonaktifkan auto-start saat reboot
  cctv-monitor uninstall             Uninstall bersih dari sistem

FLAGS SAAT MENJALANKAN (contoh):
  cctv-monitor --kiosk               Mode fullscreen untuk STB/Raspi/TV
  cctv-monitor --headless            Tanpa browser (serve + go2rtc saja)
  cctv-monitor --port 1986           Ganti port server web
  cctv-monitor --browser chromium   Paksa browser Chromium tertentu (chromium-family)

CARA MENUTUP / MEMBUKA BROWSER:
  Tutup browser (tetap akses CLI):   cctv-monitor close-browser
  Buka kembali browser:              cctv-monitor open-browser
  Akses manual dari browser lain:    http://127.0.0.1:1986

CARA UNINSTALL:
  cctv-monitor uninstall             (jalankan sebagai root bila perlu)
  # atau manual:
  sudo /opt/cctv-monitor/scripts/uninstall.sh            # data dir DIKEEP
  sudo /opt/cctv-monitor/scripts/uninstall.sh --purge-data  # hapus juga data

AUTO-START (disarankan, diaktifkan saat install):
  Setelah reboot, aplikasi otomatis terbuka langsung ke tampilan video CCTV —
  praktis jika mati lampu lalu listrik hidup kembali.
  Untuk mengatur ulang: cctv-monitor enable-autostart / disable-autostart

LOG:
  systemctl --user status cctv-monitor
  journalctl --user -u cctv-monitor -f

LIHAT JUGA:
  docs/agents/desktop.md dan README.md di repo
`

func mustExeDir() string {
	exe, err := os.Executable()
	if err != nil {
		return "."
	}
	return filepath.Dir(exe)
}

func httpGetOK(url string) bool {
	client := &http.Client{Timeout: 500 * time.Millisecond}
	resp, err := client.Get(url)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode >= 200 && resp.StatusCode < 300
}

func statusStr(ok bool) string {
	if ok {
		return "BERJALAN"
	}
	return "TIDAK BERJALAN"
}

func printVersion() {
	fmt.Printf("cctv-monitor %s (%s/%s)\n", version, runtime.GOOS, runtime.GOARCH)
}

func runStatus() {
	exeDir := mustExeDir()
	fmt.Printf("Versi      : %s\n", version)
	fmt.Printf("Arsitektur : %s/%s\n", runtime.GOOS, runtime.GOARCH)
	if p := filepath.Join(exeDir, "version"); fileExists(p) {
		if v, err := os.ReadFile(p); err == nil {
			fmt.Printf("Versi paket: %s\n", strings.TrimSpace(string(v)))
		}
	}
	fmt.Printf("Server web : %s (http://127.0.0.1:1986)\n", statusStr(httpGetOK("http://127.0.0.1:1986/health")))
	fmt.Printf("go2rtc     : %s (http://127.0.0.1:1984)\n", statusStr(httpGetOK("http://127.0.0.1:1984/api/streams")))
	fmt.Printf("Autostart  : cek dengan: systemctl --user status cctv-monitor\n")
}

func runOpenBrowser() {
	exeDir := mustExeDir()
	opts := options{
		dist:      filepath.Join(exeDir, "dist"),
		resources: filepath.Join(exeDir, "resources"),
		port:      1986,
		browser:   browserFlagFromName(""),
	}
	if !httpGetOK(fmt.Sprintf("http://127.0.0.1:%d/health", opts.port)) {
		fmt.Printf("Server belum berjalan di http://127.0.0.1:%d.\n", opts.port)
		fmt.Println("Jalankan dulu: cctv-monitor")
		return
	}
	if err := openBrowser(opts, opts.browser); err != nil {
		fmt.Printf("Gagal buka browser: %v\n", err)
		return
	}
	fmt.Printf("Browser dibuka -> http://127.0.0.1:%d\n", opts.port)
}

func runCloseBrowser() {
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	profileDir := filepath.Join(home, ".config", "cctv-monitor", "browser-profile")
	out, err := exec.Command("pkill", "-f", profileDir).CombinedOutput()
	if err != nil {
		fmt.Println("Tidak ada proses browser yang ditemukan untuk ditutup.")
		return
	}
	_ = out
	fmt.Println("Browser ditutup. Server tetap berjalan.")
	fmt.Println("Untuk membuka kembali: cctv-monitor open-browser")
}

func runUninstall() {
	exeDir := mustExeDir()
	script := filepath.Join(exeDir, "scripts", "uninstall.sh")
	if !fileExists(script) {
		fmt.Println("Script uninstall tidak ditemukan di package ini.")
		fmt.Println("Jika aplikasi terinstal, jalankan manual:")
		fmt.Println("  sudo /opt/cctv-monitor/scripts/uninstall.sh --purge-data")
		return
	}
	if os.Geteuid() != 0 {
		fmt.Println("Uninstall butuh root. Jalankan salah satu:")
		fmt.Printf("  sudo %s\n", script)
		fmt.Printf("  sudo %s --purge-data   # + hapus data dir (kredensial/config)\n", script)
		return
	}
	fmt.Println("Menjalankan uninstall...")
	cmd := exec.Command(script, "--purge-data")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	if err := cmd.Run(); err != nil {
		fmt.Printf("Gagal: %v\n", err)
	}
}

func runAutostart(enable bool) {
	action, label := "enable", "DIATIFKAN"
	if !enable {
		action, label = "disable", "DINONAKTIFKAN"
	}
	cmd := exec.Command("systemctl", "--user", action, "cctv-monitor")
	out, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Printf("Gagal %s autostart: %v\n%s", action, err, out)
		return
	}
	fmt.Printf("Autostart %s (systemd user service).\n", label)
}