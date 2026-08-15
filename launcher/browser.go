package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Kebijakan browser (efisiensi untuk low-spec):
//
//  1. Jika --browser ditentukan, gunakan itu (chromium|firefox|system|bundled).
//  2. Bundled Chromium (resources/chromium/chrome) hanya dipakai jika ada dan
//     --browser=bundled atau default dan tidak ada browser sistem yang ringan.
//  3. Default: cari browser sistem yang sudah terpasang (Chromium/Firefox
//     konvensional lebih hemat RAM daripada Chrome for Testing di beberapa
//     device). Bundled Chromium dipakai sebagai cadangan.
//
// Device low-spec (Raspi/STB armhf) umumnya tidak punya Chrome for Testing,
// jadi fallback ke browser sistem adalah jalur utama.

var systemBrowsers = []string{
	"chromium",
	"chromium-browser",
	"google-chrome",
	"google-chrome-stable",
	"microsoft-edge",
	"firefox",
	"firefox-esr",
	"epiphany",
	"falkon",
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
	case "chromium":
		return execLookPath("", "chromium")
	case "firefox":
		return execLookPath("", "firefox")
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
		return "", fmt.Errorf("tidak ada browser ditemukan (browser sistem maupun bundled Chromium)")
	default:
		return execLookPath("", browserFlag)
	}
}

func findFirstSystemBrowser() (string, error) {
	for _, name := range systemBrowsers {
		if p, err := exec.LookPath(name); err == nil {
			return p, nil
		}
	}
	return "", fmt.Errorf("browser sistem tidak ditemukan")
}

// openBrowser membuka browser terpilih dalam mode aplikasi menunjuk ke
// server lokal, dengan profil terpisah (data dir/<profile>).
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
	base := filepath.Base(chrome)

	var args []string
	switch {
	case base == "firefox":
		args = []string{
			"--no-remote",
			"--new-window",
			"-profile", profileDir,
			url,
		}
	case base == "epiphany":
		args = []string{"--profile=" + profileDir, url}
	default:
		// Chromium-family (bundled chromium, chromium, chrome, edge).
		args = []string{
			"--user-data-dir=" + profileDir,
			"--no-first-run",
			"--no-default-browser-check",
			"--disable-features=Translate",
			"--disable-background-networking",
			"--disable-component-update",
			"--disable-sync",
		}
		if opts.kiosk {
			args = append(args, "--kiosk")
		} else {
			args = append(args, "--app="+url)
		}
	}
	// Chrome/Chromium butuh --no-sandbox saat berjalan sebagai root
	// (umum di container/STB). Gunakan hanya jika perlu.
	if os.Geteuid() == 0 && base != "firefox" && base != "epiphany" {
		args = append(args, "--no-sandbox")
	}
	if opts.kiosk && len(args) > 0 && args[0] == "--app="+url {
		// kiosk sudah di-set
	} else if opts.kiosk {
		// tidak ada penanganan khusus; cukup buka URL
		if len(args) == 0 || args[len(args)-1] != url {
			args = append(args, url)
		}
	}

	cmdName, cmdArgs := resolveCmd(chrome, url, base, args)
	cmd := exec.Command(cmdName, cmdArgs...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return err
	}
	log.Printf("[browser] dibuka: %s (pid %d)", chrome, cmd.Process.Pid)
	return nil
}

// resolveCmd memilih binary + argumen. Untuk environment tanpa DISPLAY
// (Linux CLI/headless), bungkus Chromium dalam `xvfb-run -a` agar tetap
// muncul GUI (X virtual framebuffer). Firefox/epiphany tidak butuh ini.
func resolveCmd(chrome, url, base string, args []string) (cmdName string, cmdArgs []string) {
	if base == "chromium" || base == "chromium-browser" || base == "google-chrome" ||
		base == "google-chrome-stable" || base == "microsoft-edge" ||
		strings.HasSuffix(base, "chrome") || strings.HasSuffix(base, "chrome.exe") {
		// Xvfb fallback hanya untuk chromium-family di headless CLI.
		if os.Getenv("DISPLAY") == "" {
			if p, err := exec.LookPath("xvfb-run"); err == nil {
				cmdName = p
				cmdArgs = append([]string{"-a"}, chrome)
				cmdArgs = append(cmdArgs, args...)
				return cmdName, cmdArgs
			}
			// display masih harus diset manual (Xvfb) — beri petunjuk
			cmdName = chrome
			cmdArgs = append([]string{chrome}, args...)
			return cmdName, cmdArgs
		}
	}
	cmdName = chrome
	cmdArgs = append([]string{chrome}, args...)
	return cmdName, cmdArgs
}

func browserFlagFromName(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}
