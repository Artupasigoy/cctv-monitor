package main

import (
	"context"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// ensureGo2rtc menjalankan go2rtc sebagai child process dengan config yang
// digenerate. Mengembalikan cancel yang mematikan process.
//
// go2rtc 1.9.x TIDAK memiliki flag CLI untuk listen port (hanya -config,
// -daemon, -version). Karena itu config file ditulis ULANG setiap start
// dengan port API yang benar, TETAPI blok "streams:" dari file lama
// dipertahankan — sehingga stream yang di-persist go2rtc (hasil PUT frontend)
// tetap aktif antar restart. Perilaku tanpa file lama: streams kosong.
func ensureGo2rtc(opts options) (context.CancelFunc, error) {
	bin, err := execLookPath(opts.resources, "go2rtc")
	if err != nil {
		return nil, err
	}

	cfgPath := filepath.Join(opts.dataDir, "go2rtc.yaml")

	// Reclaim orphan go2rtc: jika port API sudah terisi, berarti ada go2rtc
	// yang ditinggal launcher mati paksa (SIGKILL/power loss) dan terus
	// menarik RTSP dari kamera. Bunuh sebelum spawn yang baru.
	killOrphanGo2rtc(cfgPath, opts.go2rtcAPIPort)

	oldStreams := extractStreamsBlock(cfgPath)
	// Format listen go2rtc: ":port" (atau "host:port"). Nilainya harus string
	// yang memuat port; "1984" saja di- tolak go2rtc ("missing port in address").
	apiListen := ":" + strconv.Itoa(opts.go2rtcAPIPort)
	cfg := "log:\n  level: warn\napi:\n  listen: \"" + apiListen + "\"\n  origin: \"*\"\nrtsp:\n  listen: \":8554\"\nwebrtc:\n  listen: \":8555\"\n"
	if oldStreams == "" {
		cfg += "streams:\n"
	} else {
		cfg += oldStreams
	}
	if err := os.WriteFile(cfgPath, []byte(cfg), 0o644); err != nil {
		return nil, err
	}

	ctx, cancel := context.WithCancel(context.Background())
	cmd := exec.CommandContext(ctx, bin, "-config", cfgPath)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		cancel()
		return nil, err
	}
	// Deteksi fail-fast: jika process langsung mati (mis. config rusak),
	// laporkan.
	go func() {
		<-ctx.Done()
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
		}
	}()
	go func() {
		waitCh := make(chan error, 1)
		go func() { waitCh <- cmd.Wait() }()
		select {
		case err := <-waitCh:
			if err != nil && ctx.Err() == nil {
				log.Printf("[go2rtc] process keluar tak terduga: %v", err)
			}
		case <-ctx.Done():
		}
	}()
	// Beri waktu go2rtc bind port; jika gagal, batalkan.
	if err := waitForPort(opts.go2rtcAPIPort); err != nil {
		cancel()
		return nil, err
	}
	return cancel, nil
}

func waitForPort(port int) error {
	const attempts = 20
	for i := 0; i < attempts; i++ {
		conn, err := net.DialTimeout("tcp", "127.0.0.1:"+strconv.Itoa(port), 200*time.Millisecond)
		if err == nil {
			conn.Close()
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return net.ErrClosed
}

func portInUse(port int) bool {
	conn, err := net.DialTimeout("tcp", "127.0.0.1:"+strconv.Itoa(port), 200*time.Millisecond)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

// killOrphanGo2rtc mematikan go2rtc orphan yang masih hidup dari launcher
// sebelumnya (mati paksa/SIGKILL). Orphan terus menarik RTSP dari kamera
// tanpa pengelola launcher, membebani jaringan/device CCTV.
//
// Strategi: jika port API sudah terisi, cari proses yang cmdline-nya memuat
// path config go2rtc milik aplikasi ini lalu bunuh. Tidak menyentuh go2rtc
// milik proses lain.
func killOrphanGo2rtc(cfgPath string, apiPort int) {
	if !portInUse(apiPort) {
		return
	}
	log.Printf("[go2rtc] port API %d sudah terisi — mendeteksi go2rtc orphan, mematikan...", apiPort)
	entries, err := os.ReadDir("/proc")
	if err != nil {
		log.Printf("[go2rtc] tidak bisa membaca /proc untuk deteksi orphan: %v", err)
		return
	}
	killed := false
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		pid, err := strconv.Atoi(e.Name())
		if err != nil {
			continue
		}
		cmdline, err := os.ReadFile(filepath.Join("/proc", e.Name(), "cmdline"))
		if err != nil {
			continue
		}
		if strings.Contains(string(cmdline), "go2rtc") && strings.Contains(string(cmdline), cfgPath) {
			if p, err := os.FindProcess(pid); err == nil {
				log.Printf("[go2rtc] matikan orphan pid=%d (config %s)", pid, cfgPath)
				_ = p.Kill()
				killed = true
			}
		}
	}
	if !killed {
		log.Printf("[go2rtc] port %d terisi tapi tidak ada go2rtc milik aplikasi ini — biarkan (kemungkinan service lain).", apiPort)
		return
	}
	// Tunggu port bebas agar go2rtc baru bisa bind.
	for i := 0; i < 30; i++ {
		if !portInUse(apiPort) {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	log.Printf("[go2rtc] peringatan: port %d masih terisi setelah kill orphan.", apiPort)
}

// extractStreamsBlock mengembalikan bagian "streams:" (baris itu sendiri dan
// semua isi di bawahnya) dari file config go2rtc, atau "" jika tidak ada.
// go2rtc menulis stream hasil PUT ke file config dengan indentasi 2 spasi
// (mis. "  cam_xxx: rtsp://..."), jadi blok ini bisa dipertahankan saat
// config ditulis ulang.
func extractStreamsBlock(cfgPath string) string {
	data, err := os.ReadFile(cfgPath)
	if err != nil {
		return ""
	}
	lines := strings.Split(string(data), "\n")
	for i, line := range lines {
		if strings.HasPrefix(line, "streams:") {
			return strings.Join(lines[i:], "\n") + "\n"
		}
	}
	return ""
}
