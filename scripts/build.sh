#!/usr/bin/env bash
# build.sh — build frontend + launcher Go untuk satu arsitektur target.
#
# Membuat folder siap-paket di dist-package/<arch>/ dengan layout yang
# dipahami launcher:
#
#   cctv-monitor/
#     cctv-monitor          <- launcher (binary)
#     dist/                 <- frontend build
#     resources/go2rtc      <- sidecar (sesuai arch target; cross-build unduh otomatis)
#     resources/chromium/   <- optional (jalankan fetch-chromium.sh)
#
# Usage:
#   ./scripts/build.sh                # untuk arsitektur host
#   ./scripts/build.sh arm64          # cross: amd64|arm64|arm|386
set -euo pipefail
cd "$(dirname "$0")/.."

TARGET_ARCH="${1:-$(uname -m)}"
GO2RTC_VER="${GO2RTC_VER:-v1.9.14}"
VERSION="${VERSION:-$(git describe --tags --abbrev=0 2>/dev/null || echo 0.1.0)}"
case "$TARGET_ARCH" in
  x86_64|amd64) GOARCH="amd64"; GOARM="" ;;
  aarch64|arm64) GOARCH="arm64"; GOARM="" ;;
  armv7l|armv8l|arm) GOARCH="arm"; GOARM="7" ;;
  i386|i486|i586|i686|386) GOARCH="386"; GOARM="" ;;
  *) echo "Arsitektur tidak didukung: $TARGET_ARCH"; exit 1 ;;
esac

HOST_ARCH="$(uname -m)"
case "$HOST_ARCH" in
  x86_64|amd64) HOST_GOARCH="amd64" ;;
  aarch64|arm64) HOST_GOARCH="arm64" ;;
  armv7l|armv8l) HOST_GOARCH="arm" ;;
  i386|i486|i586|i686) HOST_GOARCH="386" ;;
  *) HOST_GOARCH="unknown" ;;
esac

# go2rtc_asset: nama aset go2rtc sesuai arch target.
go2rtc_asset() {
  case "$1" in
    amd64) echo "linux_amd64" ;;
    arm64) echo "linux_arm64" ;;
    arm) echo "linux_arm" ;;
    386) echo "linux_i386" ;;
  esac
}

# fetch_go2rtc: siapkan resources/go2rtc untuk arch target di folder output.
# Jika target = arch host dan binary sudah ada di resources/, copy saja.
# Jika cross-build, unduh binary go2rtc yang sesuai target.
fetch_go2rtc() {
  local out="$1"
  if [ "$GOARCH" = "$HOST_GOARCH" ] && [ -f resources/go2rtc ]; then
    echo "[build] go2rtc: pakai resources/go2rtc (host arch)"
    cp resources/go2rtc "${out}/resources/go2rtc"
  else
    local asset url
    asset="$(go2rtc_asset "$GOARCH")"
    url="https://github.com/AlexxIT/go2rtc/releases/download/${GO2RTC_VER}/go2rtc_${asset}"
    echo "[build] go2rtc: unduh ${url}"
    curl -fsSL -m 300 -o "${out}/resources/go2rtc" "$url" || {
      echo "[build] GAGAL unduh go2rtc untuk GOARCH=${GOARCH}. Jalankan fetch-go2rtc.sh di mesin target." >&2
      return 1
    }
  fi
  chmod +x "${out}/resources/go2rtc"
}

echo "[build] frontend..."
npm run build

echo "[build] launcher (GOARCH=${GOARCH}${GOARM:+ GOARM=${GOARM}}), versi=${VERSION}..."
(
  cd launcher
  env GOOS=linux GOARCH="${GOARCH}" GOARM="${GOARM}" CGO_ENABLED=0 \
    go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o cctv-monitor .
)

OUT="dist-package/${TARGET_ARCH}"
rm -rf "${OUT}"
mkdir -p "${OUT}/dist" "${OUT}/resources"

cp launcher/cctv-monitor "${OUT}/"
echo "${VERSION}" > "${OUT}/version"
cp -r dist/. "${OUT}/dist/"

# go2rtc: binary harus sesuai arch target (cross-build di-download otomatis).
if ! fetch_go2rtc "${OUT}"; then
  exit 1
fi

# Chromium: copy hanya jika folder sudah ada (opsional).
if [ -d resources/chromium ]; then
  cp -r resources/chromium "${OUT}/resources/chromium"
else
  echo "[build] chromium bundle tidak ada (opsional). Launcher akan memakai browser sistem."
fi

chmod +x "${OUT}/cctv-monitor"
echo "[build] selesai -> ${OUT} (versi ${VERSION})"
du -sh "${OUT}"
