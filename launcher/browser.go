package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Kebijakan browser — CHROMIUM-FAMILY ONLY (standarisasi):
//
//  1. Hanya browser berbasis Chromium yang didukung resmi: chromium,
//     chromium-browser, google-chrome, google-chrome-stable, microsoft-edge.
//     Alasan: konsistensi flags, codec H.264 bawaan, WebRTC lengkap, dan
//     perilaku autoplay yang dapat dikendalikan.
//  2. Bundled Chromium (resources/chromium/chrome) dipakai jika ada dan
//     --browser=bundled atau tidak ada browser sistem.
//  3. Firefox, Epiphany, Falkon, dan browser lain TIDAK didukung — ditolak
//     dengan pesan jelas agar user tidak terjebak pada perilaku yang tidak
//     teruji (codec, WebRTC, flags).
//
// Device low-spec (Raspi/STB armhf) umumnya tidak punya Chrome for Testing,
// jadi fallback ke browser sistem adalah jalur utama.

var systemBrowsers = []string{
	"chromium",
	"chromium-browser",
	"google-chrome",
	"google-chrome-stable",
	"microsoft-edge",
}

func resolveBrowser(opts options, browserFlag string) (string, error) {
	switch browserFlag {
	case "none":
		return "", fmt.Errorf("browser dimatikan")
	case "bundled":
		p := filepath.Join(opts.resources, "chromium", "chrome")
		if !fileExists(p) {
			return "", fmt.Errorf("bundled Chromium tidak ditemukan: %s (jalankan scripts/fetch-chromium.sh)", p)
		}
		return p, nil
	case "system":
		return findFirstSystemBrowser()
	case "chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "microsoft-edge":
		return execLookPath("", browserFlag)
	case "":
		// Default: system terlebih dahulu (lebih ringan di low-spec),
		// lalu bundled Chromium sebagai cadangan.
		if p, err := findFirstSystemBrowser(); err == nil {
			return p, nil
		}
		p := filepath.Join(opts.resources, "chromium", "chrome")
		if fileExists(p) {
			return p, nil
		}
		return "", fmt.Errorf("%s", noBrowserHelp())
	default:
		// Browser non-Chromium ditolak (standarisasi).
		return "", fmt.Errorf("browser '%s' tidak didukung. Program ini hanya mendukung browser Chromium-family (chromium, google-chrome, microsoft-edge).", browserFlag)
	}
}

func findFirstSystemBrowser() (string, error) {
	for _, name := range systemBrowsers {
		if p, err := exec.LookPath(name); err == nil {
			return p, nil
		}
	}
	// Chromium via snap (Ubuntu) ada di /snap/bin — mungkin tidak di PATH.
	for _, p := range []string{
		"/snap/bin/chromium",
		"/var/lib/snapd/snap/bin/chromium",
	} {
		if fileExists(p) {
			return p, nil
		}
	}
	return "", fmt.Errorf("browser sistem Chromium tidak ditemukan")
}

// noBrowserHelp: pesan jelas saat tidak ada browser Chromium sama sekali,
// termasuk cara install per distro dan catatan SELinux (Fedora).
func noBrowserHelp() string {
	return "tidak ada browser Chromium ditemukan (sistem maupun bundled).\n" +
		"Program hanya mendukung Chromium-family. Install salah satu, misalnya:\n" +
		"  Debian/Ubuntu/Raspberry Pi OS : sudo apt install chromium-browser  (Ubuntu 22.04+ install via snap)\n" +
		"                                  sudo apt install chromium          (Debian)\n" +
		"  Fedora                         : sudo dnf install chromium\n" +
		"  Arch/Manjaro                   : sudo pacman -S chromium\n" +
		"  Alpine                         : sudo apk add chromium\n" +
		"  OpenSUSE                       : sudo zypper install chromium\n" +
		"Setelah terinstall, jalankan lagi: cctv-monitor"
}

// openBrowser membuka Chromium dalam mode aplikasi menunjuk ke server lokal,
// dengan profil terpisah (data dir/<profile>).
func openBrowser(opts options, browserFlag string) error {
	chrome, err := resolveBrowser(opts, browserFlag)
	if err != nil {
		return err
	}
	profileDir := filepath.Join(opts.dataDir, "browser-profile")
	if err := os.MkdirAll(profileDir, 0o755); err != nil {
		return err
	}

	url := fmt.Sprintf("http://127.0.0.1:%d", opts.port)

	// Chromium-family flags (konsisten untuk semua browser resmi).
	args := []string{
		"--user-data-dir=" + profileDir,
		"--no-first-run",
		"--no-default-browser-check",
		"--disable-features=Translate",
		"--disable-background-networking",
		"--disable-component-update",
		"--disable-sync",
		// Biarkan video autoplay tanpa gestur user (stream CCTV live).
		"--autoplay-policy=no-user-gesture-required",
	}
	if opts.kiosk {
		args = append(args, "--kiosk")
	} else {
		args = append(args, "--app="+url)
	}

	// Chrome/Chromium butuh --no-sandbox saat berjalan sebagai root
	// (umum di container/STB). Gunakan hanya jika perlu.
	if os.Geteuid() == 0 {
		args = append(args, "--no-sandbox")
	}

	cmd := exec.Command(chrome, args...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("gagal menjalankan Chromium (%s): %w — cek sandbox/SELinux (Fedora), atau jalankan sebagai user biasa", chrome, err)
	}
	log.Printf("[browser] dibuka: %s (pid %d)", chrome, cmd.Process.Pid)
	return nil
}

// execLookPath: cari binary di resources; jika tidak ada, cari di PATH.
func execLookPath(dir, name string) (string, error) {
	candidate := filepath.Join(dir, name)
	if fileExists(candidate) {
		return candidate, nil
	}
	p, err := exec.LookPath(name)
	if err != nil {
		return "", fmt.Errorf("binary %s tidak ditemukan (cari: %s)", name, candidate)
	}
	return p, nil
}

func browserFlagFromName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}