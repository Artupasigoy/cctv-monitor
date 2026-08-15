// Launcher CCTV Monitor (Linux x64)
//
// Tugas:
//  1. Serve frontend build (dist/) + endpoint scan LAN (/scan, /health).
//  2. Ensure go2rtc berjalan sebagai child process dengan config yang digenerate.
//  3. Buka bundled Chromium menunjuk ke http://127.0.0.1:port.
//  4. Cleanup go2rtc saat exit (tidak meninggalkan orphan).
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

// Versi/binary dan path direlativisasi dari lokasi binary launcher (ExeDir).
// Layout instalasi:
//
//	cctv-monitor/
//	  cctv-monitor      <- launcher ini
//	  resources/
//	    go2rtc
//	    chromium/chrome
//	  dist/             <- frontend build
var (
	flagDist      = flag.String("dist", "", "path ke folder frontend dist (default: <exedir>/dist)")
	flagResources = flag.String("resources", "", "path ke folder resources (default: <exedir>/resources)")
	flagPort      = flag.Int("port", 1986, "port server web")
	flagGo2rtc    = flag.Int("go2rtc-port", 1984, "port API go2rtc")
	flagHeadless  = flag.Bool("headless", false, "serve + go2rtc saja, tanpa membuka browser")
	flagNoBrowser = flag.Bool("no-browser", false, "alias headless: jangan buka browser")
	flagNoGo2rtc  = flag.Bool("no-go2rtc", false, "jangan spawn go2rtc (untuk dev frontend)")
	flagBrowser   = flag.String("browser", "", "paksa browser: chromium|firefox|system|bundled|<nama-binary> (default: auto)")
	flagKiosk     = flag.Bool("kiosk", false, "mode kiosk/fullscreen (untuk STB/raspi display)")
	flagDataDir   = flag.String("data-dir", "", "folder data aplikasi (default: ~/.config/cctv-monitor)")
)

type options struct {
	dist          string
	resources     string
	port          int
	go2rtcAPIPort int
	headless      bool
	noGo2rtc      bool
	kiosk         bool
	browser       string
	dataDir       string
	exeDir        string
}

func main() {
	flag.Parse()

	exe, err := os.Executable()
	if err != nil {
		log.Fatalf("resolve executable: %v", err)
	}
	exeDir := filepath.Dir(exe)

	opts := options{
		dist:          first(*flagDist, filepath.Join(exeDir, "dist")),
		resources:     first(*flagResources, filepath.Join(exeDir, "resources")),
		port:          *flagPort,
		go2rtcAPIPort: *flagGo2rtc,
		headless:      *flagHeadless || *flagNoBrowser,
		noGo2rtc:      *flagNoGo2rtc,
		kiosk:         *flagKiosk,
		browser:       browserFlagFromName(*flagBrowser),
		exeDir:        exeDir,
	}
	if *flagDataDir != "" {
		opts.dataDir = *flagDataDir
	} else if xdg := os.Getenv("XDG_CONFIG_HOME"); xdg != "" {
		opts.dataDir = filepath.Join(xdg, "cctv-monitor")
	} else if home, err := os.UserHomeDir(); err == nil {
		opts.dataDir = filepath.Join(home, ".config", "cctv-monitor")
	} else {
		opts.dataDir = filepath.Join(exeDir, "data")
	}

	if !dirExists(opts.dist) {
		log.Fatalf("folder dist tidak ditemukan: %s (build frontend dulu: npm run build)", opts.dist)
	}

	if err := os.MkdirAll(opts.dataDir, 0o755); err != nil {
		log.Fatalf("buat data dir: %v", err)
	}

	// go2rtc
	var gctx context.CancelFunc
	if !opts.noGo2rtc {
		gctx, err = ensureGo2rtc(opts)
		if err != nil {
			log.Printf("peringatan: go2rtc gagal start (%v); lanjut tanpa go2rtc", err)
		} else {
			log.Printf("[go2rtc] berjalan pada http://127.0.0.1:%d", opts.go2rtcAPIPort)
		}
	}

	// HTTP server
	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth)
	mux.HandleFunc("/scan", handleScan(opts))
	fileServer := http.FileServer(http.Dir(opts.dist))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// SPA fallback: route yang bukan file nyata -> index.html
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p != "" && fileExists(filepath.Join(opts.dist, p)) {
			fileServer.ServeHTTP(w, r)
			return
		}
		http.ServeFile(w, r, filepath.Join(opts.dist, "index.html"))
	})

	addr := fmt.Sprintf("127.0.0.1:%d", opts.port)
	srv := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	errc := make(chan error, 1)
	go func() { errc <- srv.ListenAndServe() }()
	log.Printf("[server] listening on http://%s", addr)

	// Browser
	if !opts.headless {
		if err := openBrowser(opts, opts.browser); err != nil {
			log.Printf("peringatan: gagal buka browser (%v); buka manual: http://%s", err, addr)
		}
	}

	// Graceful shutdown
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	select {
	case s := <-sig:
		log.Printf("menerima sinyal %v, shutdown", s)
	case err := <-errc:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("server error: %v", err)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	if gctx != nil {
		gctx()
	}
	log.Println("selesai")
}

func first(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func dirExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.IsDir()
}

func fileExists(p string) bool {
	st, err := os.Stat(p)
	return err == nil && !st.IsDir()
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"ok":true}`))
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
