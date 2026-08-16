#!/usr/bin/env bash
# package.sh — buat tarball release per arch untuk dipasang di GitHub release.
#
# Struktur tarball (dipahami install-release.sh & launcher):
#   cctv-monitor/
#     cctv-monitor          launcher binary
#     version               versi paket
#     dist/                 frontend build
#     resources/go2rtc      sidecar (arch sesuai target)
#     scripts/              install.sh, uninstall.sh, lib-install.sh
#
# Output: dist-package/release/cctv-monitor-linux-<arch>.tar.gz
#
# Usage:
#   ./scripts/package.sh                # semua arch yang sudah di-build
#   ./scripts/package.sh x86_64 arm64   # arch tertentu
set -euo pipefail
cd "$(dirname "$0")/.."

ARCHS=("$@")
if [ ${#ARCHS[@]} -eq 0 ]; then
  ARCHS=(x86_64 arm64 arm 386)
fi

OUT="dist-package/release"
mkdir -p "${OUT}"

for ARCH in "${ARCHS[@]}"; do
  SRC="dist-package/${ARCH}"
  if [ ! -x "${SRC}/cctv-monitor" ]; then
    echo "[package] SKIP ${ARCH}: build belum ada (jalankan ./scripts/build.sh ${ARCH})"
    continue
  fi
  VERSION="$(cat "${SRC}/version")"
  TMP="$(mktemp -d)"
  mkdir -p "${TMP}/cctv-monitor/scripts"
  cp -r "${SRC}/." "${TMP}/cctv-monitor/"
  cp scripts/install.sh scripts/uninstall.sh scripts/lib-install.sh "${TMP}/cctv-monitor/scripts/"
  chmod +x "${TMP}/cctv-monitor/cctv-monitor"
  chmod +x "${TMP}/cctv-monitor/resources/go2rtc" 2>/dev/null || true

  TARBALL="${OUT}/cctv-monitor-linux-${ARCH}.tar.gz"
  tar -C "${TMP}" -czf "${TARBALL}" cctv-monitor
  rm -rf "${TMP}"
  echo "[package] OK ${TARBALL} (v${VERSION}, $(du -h "${TARBALL}" | cut -f1))"
done

echo "[package] selesai -> ${OUT}/"