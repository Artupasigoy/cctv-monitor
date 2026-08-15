#!/usr/bin/env bash
# build.sh — build frontend + launcher Go untuk satu arsitektur target.
#
# Membuat folder siap-paket di dist-package/<arch>/ dengan layout yang
# dipahami launcher:
#
#   cctv-monitor/
#     cctv-monitor          <- launcher (binary)
#     dist/                 <- frontend build
#     resources/go2rtc      <- sidecar (atau symlink ke yang sudah ada)
#     resources/chromium/   <- optional (jalankan fetch-chromium.sh)
#
# Usage:
#   ./scripts/build.sh                # untuk arsitektur host
#   ./scripts/build.sh arm64          # cross: amd64|arm64|arm|386
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET_ARCH="${1:-$(uname -m)}"
case "$TARGET_ARCH" in
  x86_64|amd64) GOARCH="amd64"; GOARM="" ;;
  aarch64|arm64) GOARCH="arm64"; GOARM="" ;;
  armv7l|armv8l|arm) GOARCH="arm"; GOARM="7" ;;
  i386|i486|i586|i686|386) GOARCH="386"; GOARM="" ;;
  *) echo "Arsitektur tidak didukung: $TARGET_ARCH"; exit 1 ;;
esac

echo "[build] frontend..."
npm run build

echo "[build] launcher (GOARCH=${GOARCH}${GOARM:+ GOARM=${GOARM}})..."
(
  cd launcher
  env GOOS=linux GOARCH="${GOARCH}" GOARM="${GOARM}" CGO_ENABLED=0 \
    go build -trimpath -ldflags="-s -w" -o cctv-monitor .
)

OUT="dist-package/${TARGET_ARCH}"
rm -rf "${OUT}"
mkdir -p "${OUT}/dist" "${OUT}/resources"

cp launcher/cctv-monitor "${OUT}/"
cp -r dist/. "${OUT}/dist/"

# go2rtc: pakai binary yang cocok dengan target (jika berbeda arch dari host,
# user perlu menjalankan fetch-go2rtc.sh di mesin target, atau download manual).
if [ -f resources/go2rtc ]; then
  cp resources/go2rtc "${OUT}/resources/go2rtc"
else
  echo "[build] peringatan: resources/go2rtc tidak ada — jalankan ./scripts/fetch-go2rtc.sh"
fi

# Chromium: copy hanya jika folder sudah ada (opsional).
if [ -d resources/chromium ]; then
  cp -r resources/chromium "${OUT}/resources/chromium"
else
  echo "[build] chromium bundle tidak ada (opsional). Launcher akan memakai browser sistem."
fi

chmod +x "${OUT}/cctv-monitor"
echo "[build] selesai -> ${OUT}"
du -sh "${OUT}"
