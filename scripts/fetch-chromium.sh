#!/usr/bin/env bash
# fetch-chromium.sh — unduh bundled Chromium (Chrome for Testing) OPSIONAL.
#
# PENTING UNTUK LOW-SPEC: Chromium bundle (~400MB ter-install) adalah opsi
# "paling self-contained" tetapi BUKAN keharusan. Launcher otomatis memakai
# browser sistem yang sudah terpasang (chromium/firefox) jika ada, dan hanya
# fallback ke bundle ini saat tidak ada browser sistem.
#
# Device low-spec (Raspi/STB armhf, 32-bit) TIDAK didukung Chrome for Testing;
# untuk arsitektur itu bundle ini tidak dibuat dan launcher bergantung pada
# browser sistem (mis. chromium dari repo distro) — itulah jalur yang benar.
#
# Usage: ./scripts/fetch-chromium.sh [version]
#   version default: 153.0.8008.0 (terakhir terverifikasi).
set -euo pipefail

cd "$(dirname "$0")/.."
VER="${1:-153.0.8008.0}"

case "$(uname -m)" in
  x86_64|amd64) PLAT="linux64"; SUB="linux64"; OUT="resources/chromium" ;;
  aarch64|arm64) PLAT="linux-arm64"; SUB="linux-arm64"; OUT="resources/chromium" ;;
  *)
    echo "[chromium] arsitektur $(uname -m) tidak didukung Chrome for Testing;"
    echo "[chromium] launcher akan memakai browser sistem. Lewati bundle."
    exit 0
    ;;
esac

URL="https://storage.googleapis.com/chrome-for-testing-public/${VER}/${PLAT}/chrome-${SUB}.zip"
echo "[chromium] unduh ${URL}"
TMP="$(mktemp -d)"
curl -sL -m 600 -o "${TMP}/chrome.zip" "$URL"
echo "[chromium] ekstrak..."
mkdir -p "${OUT}"
unzip -q -o "${TMP}/chrome.zip" -d "${TMP}/x"
rm -rf "${OUT:?}/chrome"
mv "${TMP}/x/chrome-${SUB}" "${OUT}/chrome"
chmod +x "${OUT}/chrome/chrome"
rm -rf "${TMP}"
echo "[chromium] OK -> ${OUT}/chrome (${PLAT})"
du -sh "${OUT}"
