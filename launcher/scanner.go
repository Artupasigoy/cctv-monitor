package main

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Scanner LAN — ekuivalen scripts/scan-server.mjs.
// Hanya host dengan port RTSP (554) yang dianggap kamera.

var scanPorts = []int{554, 8000}
var scanTimeout = 400 * time.Millisecond
var scanConcurrency = 100

type scanEntry struct {
	Host  string `json:"host"`
	Ports []int  `json:"ports"`
}

type scanResponse struct {
	Found  []scanEntry `json:"found"`
	Scanned int        `json:"scanned"`
	Ms     int64       `json:"ms"`
}

func handleScan(opts options) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Type", "application/json")

		rangeSpec := r.URL.Query().Get("range")
		var ranges []string
		if strings.TrimSpace(rangeSpec) != "" {
			for _, s := range strings.Split(rangeSpec, ",") {
				if s = strings.TrimSpace(s); s != "" {
					ranges = append(ranges, s)
				}
			}
		} else {
			ranges = autoRanges()
		}

		ips := make([]string, 0, 254*len(ranges))
		seen := make(map[string]bool)
		bad := false
		for _, rs := range ranges {
			list, err := parseRange(rs)
			if err != nil {
				bad = true
				continue
			}
			for _, ip := range list {
				if !seen[ip] {
					seen[ip] = true
					ips = append(ips, ip)
				}
			}
		}
		if bad {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Rentang tidak valid: " + strings.Join(ranges, ", ")})
			return
		}

		t0 := time.Now()
		found := scanAll(ips)
		writeJSON(w, http.StatusOK, scanResponse{Found: found, Scanned: len(ips), Ms: time.Since(t0).Milliseconds()})
	}
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func isPrivate(ip net.IP) bool {
	if ip4 := ip.To4(); ip4 != nil {
		switch {
		case ip4[0] == 10:
			return true
		case ip4[0] == 172 && ip4[1] >= 16 && ip4[1] <= 31:
			return true
		case ip4[0] == 192 && ip4[1] == 168:
			return true
		}
	}
	return false
}

// autoRanges mengembalikan subnet /24 dari interface IPv4 privat.
func autoRanges() []string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil
	}
	seen := map[string]bool{}
	var ranges []string
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, err := iface.Addrs()
		if err != nil {
			continue
		}
		for _, a := range addrs {
			ip, _, err := net.ParseCIDR(a.String())
			if err != nil {
				continue
			}
			ip4 := ip.To4()
			if ip4 == nil || !isPrivate(ip4) {
				continue
			}
			r := fmt.Sprintf("%d.%d.%d.0/24", ip4[0], ip4[1], ip4[2])
			if !seen[r] {
				seen[r] = true
				ranges = append(ranges, r)
			}
		}
	}
	sort.Strings(ranges)
	return ranges
}

func intToIP(n uint32) string {
	return fmt.Sprintf("%d.%d.%d.%d", byte(n>>24), byte(n>>16), byte(n>>8), byte(n))
}

func parseRange(spec string) ([]string, error) {
	spec = strings.TrimSpace(spec)
	var out []string

	if parts := strings.Split(spec, "/"); len(parts) == 2 {
		a, b, c, d, ok := parseIPv4(parts[0])
		if !ok {
			return nil, fmt.Errorf("IP tidak valid")
		}
		prefix, err := strconv.Atoi(parts[1])
		if err != nil || prefix < 16 || prefix > 30 {
			return nil, fmt.Errorf("prefix /%s tidak valid (16-30)", parts[1])
		}
		hostBits := 32 - prefix
		base := uint32(a)<<24 | uint32(b)<<16 | uint32(c)<<8 | uint32(d)
		net := (base >> hostBits) << hostBits
		total := 1 << hostBits
		for i := 1; i < total-1; i++ {
			out = append(out, intToIP(net+uint32(i)))
		}
		return out, nil
	}

	if i := strings.LastIndex(spec, "."); i >= 0 {
		rest := spec[:i]
		loHi := spec[i+1:]
		if strings.Contains(loHi, "-") {
			parts := strings.Split(loHi, "-")
			if len(parts) != 2 {
				return nil, fmt.Errorf("range host tidak valid")
			}
			lo, err1 := strconv.Atoi(parts[0])
			hi, err2 := strconv.Atoi(parts[1])
			if err1 != nil || err2 != nil {
				return nil, fmt.Errorf("range host tidak valid")
			}
			for n := max(1, lo); n <= min(254, hi); n++ {
				out = append(out, fmt.Sprintf("%s.%d", rest, n))
			}
			return out, nil
		}
	}

	if _, _, _, _, ok := parseIPv4(spec); ok {
		return []string{spec}, nil
	}
	return nil, fmt.Errorf("format tidak dikenali")
}

func parseIPv4(s string) (byte, byte, byte, byte, bool) {
	parts := strings.Split(s, ".")
	if len(parts) != 4 {
		return 0, 0, 0, 0, false
	}
	var v [4]byte
	for i, p := range parts {
		n, err := strconv.Atoi(p)
		if err != nil || n < 0 || n > 255 {
			return 0, 0, 0, 0, false
		}
		v[i] = byte(n)
	}
	return v[0], v[1], v[2], v[3], true
}

func checkPort(ip string, port int) bool {
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(ip, strconv.Itoa(port)), scanTimeout)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

func scanAll(ips []string) []scanEntry {
	var (
		mu     sync.Mutex
		idx    int
		found  []scanEntry
		wg     sync.WaitGroup
		worker = func() {
			for {
				mu.Lock()
				if idx >= len(ips) {
					mu.Unlock()
					return
				}
				ip := ips[idx]
				idx++
				mu.Unlock()

				var open []int
				for _, p := range scanPorts {
					if checkPort(ip, p) {
						open = append(open, p)
					}
				}
				if len(open) > 0 {
					mu.Lock()
					found = append(found, scanEntry{Host: ip, Ports: open})
					mu.Unlock()
				}
			}
		}
	)
	wg.Add(scanConcurrency)
	for i := 0; i < scanConcurrency; i++ {
		go func() { defer wg.Done(); worker() }()
	}
	wg.Wait()
	sort.Slice(found, func(i, j int) bool { return found[i].Host < found[j].Host })
	return found
}
