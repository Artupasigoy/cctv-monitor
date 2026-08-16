#!/usr/bin/env bash
# install.sh — install CCTV Monitor ke Linux (desktop maupun CLI-only).
#
# Meng-copy dist-package/<arch>/ ke /opt/cctv-monitor dan membuat:
#   - symlink CLI:      /usr/local/bin/cctv-monitor
#   - systemd user service (auto-start saat reboot) jika ada sesi user
#   - desktop entry (jika desktop tersedia)
#
# Browser: launcher memakai browser sistem jika ada; bundled Chromium dipakai
# hanya jika folder resources/chromium ikut ter-package. Untuk desktop
# low-spec, disarankan menginstall chromium/firefox dari repo distro saja.
#
# Usage: sudo ./scripts/install.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/lib-install.sh

if [ "$(id -u)" -ne 0 ]; then
  echo "Jalankan dengan sudo: sudo ./scripts/install.sh"
  exit 1
fi

ARCH="$(detect_arch)"
if [ "${ARCH}" = "unknown" ]; then
  echo "Arsitektur tidak didukung: $(uname -m)"
  exit 1
fi

SRC="dist-package/${ARCH}"
if [ ! -x "${SRC}/cctv-monitor" ]; then
  echo "Build belum ada untuk ${ARCH}. Jalankan dulu: ./scripts/build.sh ${ARCH}"
  exit 1
fi

VERSION="$(read_version "${SRC}")"
RUNUSER="$(detect_runuser)"

echo "[install] arch=${ARCH} versi=${VERSION} user=${RUNUSER}"

# Browser wajib ada (Chromium-family) sebelum instalasi dilanjutkan.
ensure_browser "${RUNUSER}"

echo "[install] copy ke ${INSTALL_DIR} ..."
mkdir -p "${INSTALL_DIR}"
cp -r "${SRC}/." "${INSTALL_DIR}/"
chmod +x "${INSTALL_DIR}/cctv-monitor"
chmod +x "${INSTALL_DIR}/resources/go2rtc" 2>/dev/null || true

echo "[install] symlink CLI: ${BIN}"
ln -sf "${INSTALL_DIR}/cctv-monitor" "${BIN}"

echo "[install] atur auto-start..."
enable_autostart "${RUNUSER}" "${INSTALL_DIR}/cctv-monitor"

create_desktop_entry

echo "[install] selesai."
print_access_info "${VERSION}"