#!/usr/bin/env bash
# fetch-go2rtc.sh — unduh go2rtc binary untuk arsitektur host ke resources/.
#
# go2rtc (AlexxIT/go2rtc) adalah sidecar RTSP->WebRTC. Binary resmi tersedia
# untuk amd64, arm64, arm (armv7), armv6, dan i386 — mendukung device
# low-spec seperti Raspi/STB.
#
# Usage: ./scripts/fetch-go2rtc.sh [version]
#   version default: v1.9.14 (versi terakhir yang sudah diverifikasi).
set -euo pipefail

cd "$(dirname "$0")/.."
VER="${1:-v1.9.14}"
OUT="resources/go2rtc"

case "$(uname -m)" in
  x86_64|amd64) ARCH="linux_amd64" ;;
  aarch64|arm64) ARCH="linux_arm64" ;;
  armv7l|armv8l) ARCH="linux_arm" ;;
  armv6l) ARCH="linux_armv6" ;;
  i386|i486|i586|i686) ARCH="linux_i386" ;;
  *) echo "Arsitektur tidak didukung: $(uname -m)"; exit 1 ;;
esac

URL="https://github.com/AlexxIT/go2rtc/releases/download/${VER}/go2rtc_${ARCH}"
echo "[go2rtc] unduh ${URL}"
mkdir -p resources
curl -sL -m 120 -o "${OUT}" "$URL"
chmod +x "${OUT}"
echo "[go2rtc] OK -> ${OUT} (${ARCH})"
./resources/go2rtc --version 2>&1 | head -1 || true
