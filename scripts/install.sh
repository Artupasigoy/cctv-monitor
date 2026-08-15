#!/usr/bin/env bash
# install.sh — install CCTV Monitor ke Linux (desktop maupun CLI-only).
#
# Meng-copy dist-package/<arch>/ ke /opt/cctv-monitor dan membuat:
#   - symlink CLI:      /usr/local/bin/cctv-monitor
#   - systemd user service (jika XDG_RUNTIME_DIR tersedia): cctv-monitor
#   - desktop entry (jika desktop tersedia)
#
# Browser: launcher memakai browser sistem jika ada; bundled Chromium dipakai
# hanya jika folder resources/chromium ikut ter-package. Untuk desktop
# low-spec, disarankan menginstall chromium/firefox dari repo distro saja.
#
# Usage: sudo ./scripts/install.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ "$(id -u)" -ne 0 ]; then
  echo "Jalankan dengan sudo: sudo ./scripts/install.sh"
  exit 1
fi

HOST_ARCH="$(uname -m)"
case "$HOST_ARCH" in
  x86_64|amd64) ARCH="x86_64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  armv7l|armv8l) ARCH="arm" ;;
  i386|i486|i586|i686) ARCH="386" ;;
  *) echo "Arsitektur tidak didukung: $HOST_ARCH"; exit 1 ;;
esac

SRC="dist-package/${ARCH}"
if [ ! -x "${SRC}/cctv-monitor" ]; then
  echo "Build belum ada untuk ${ARCH}. Jalankan dulu: ./scripts/build.sh ${ARCH}"
  exit 1
fi

INSTALL_DIR="/opt/cctv-monitor"
BIN="/usr/local/bin/cctv-monitor"
RUNUSER="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"

echo "[install] copy ke ${INSTALL_DIR} ..."
mkdir -p "${INSTALL_DIR}"
cp -r "${SRC}/." "${INSTALL_DIR}/"
chmod +x "${INSTALL_DIR}/cctv-monitor"
chmod +x "${INSTALL_DIR}/resources/go2rtc" 2>/dev/null || true

echo "[install] symlink CLI: ${BIN}"
ln -sf "${INSTALL_DIR}/cctv-monitor" "${BIN}"

# Systemd user service — hanya jika ada XDG_RUNTIME_DIR untuk user target.
if [ -d "/run/user/$(id -u "${RUNUSER}" 2>/dev/null || echo 1000)" ]; then
  SERVICE_DIR="/home/${RUNUSER}/.config/systemd/user"
  mkdir -p "${SERVICE_DIR}"
  cat > "${SERVICE_DIR}/cctv-monitor.service" <<EOF
[Unit]
Description=CCTV Monitor
After=network.target

[Service]
ExecStart=${INSTALL_DIR}/cctv-monitor
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
EOF
  chown -R "${RUNUSER}" "/home/${RUNUSER}/.config/systemd"
  echo "[install] systemd user service dibuat (aktifkan: systemctl --user enable --now cctv-monitor)"
else
  echo "[install] tidak ada sesi user (CLI-only). Jalankan manual: cctv-monitor"
fi

# Desktop entry — hanya jika ada environment desktop.
if [ -n "${DESKTOP_SESSION:-}" ] || [ -n "${XDG_CURRENT_DESKTOP:-}" ]; then
  DESKTOP_FILE="/usr/share/applications/cctv-monitor.desktop"
  cat > "${DESKTOP_FILE}" <<EOF
[Desktop Entry]
Name=CCTV Monitor
Comment=Live CCTV monitoring (LAN-only)
Exec=${INSTALL_DIR}/cctv-monitor
Terminal=false
Type=Application
Categories=Utility;Video;Network;
EOF
  echo "[install] desktop entry dibuat: ${DESKTOP_FILE}"
fi

echo "[install] selesai. Jalankan: cctv-monitor"
echo "[install] (opsional) untuk STB/raspi display penuh: cctv-monitor --kiosk"
