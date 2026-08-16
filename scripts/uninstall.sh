#!/usr/bin/env bash
# uninstall.sh — uninstall bersih CCTV Monitor dari Linux.
#
# Menghapus:
#   - /opt/cctv-monitor                (folder instalasi + binary)
#   - /usr/local/bin/cctv-monitor      (symlink CLI)
#   - systemd user service             (~/.config/systemd/user/cctv-monitor.service)
#   - desktop entry                    (/usr/share/applications/cctv-monitor.desktop)
#   - data dir                         (~/.config/cctv-monitor: config, go2rtc.yaml,
#                                      browser-profile, kredensial terenkripsi)
#
# Data dir TIDAK dihapus otomatis (berisi kredensial kamera & preferensi).
# Gunakan --purge-data untuk menghapus data dir juga.
#
# Usage: sudo ./scripts/uninstall.sh [--purge-data] [--yes]
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/lib-install.sh

PURGE_DATA=0
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --purge-data) PURGE_DATA=1 ;;
    --yes) ASSUME_YES=1 ;;
    *) echo "Argumen tidak dikenal: $arg" >&2; exit 1 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "Jalankan dengan sudo: sudo ./scripts/uninstall.sh"
  exit 1
fi

RUNUSER="$(detect_runuser)"
USER_HOME="$(getent passwd "${RUNUSER}" | cut -d: -f6)"
[ -n "${USER_HOME}" ] || USER_HOME="/home/${RUNUSER}"

SERVICE_DIR="${USER_HOME}/.config/systemd/user"
SERVICE_FILE="${SERVICE_DIR}/cctv-monitor.service"
DATA_DIR="${USER_HOME}/.config/cctv-monitor"

confirm() {
  if [ "$ASSUME_YES" = "1" ]; then return 0; fi
  read -r -p "$1 [y/N] " ans
  case "$ans" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

echo "=== Uninstall CCTV Monitor ==="
echo "  User target : ${RUNUSER}"
echo "  Install dir : ${INSTALL_DIR}"
echo "  Symlink     : ${BIN}"
echo "  Service     : ${SERVICE_FILE}"
echo "  Desktop     : /usr/share/applications/cctv-monitor.desktop"
echo "  Data dir    : ${DATA_DIR}${PURGE_DATA:+ (AKAN DIHAPUS)}"
echo ""

echo "[uninstall] matikan auto-start (systemd user service)..."
disable_autostart "${RUNUSER}"

if ! confirm "Lanjutkan uninstall?"; then
  echo "Dibatalkan."
  exit 0
fi

echo "[uninstall] hapus ${INSTALL_DIR}"
rm -rf "${INSTALL_DIR}"

echo "[uninstall] hapus symlink ${BIN}"
rm -f "${BIN}"

echo "[uninstall] hapus desktop entry /usr/share/applications/cctv-monitor.desktop"
rm -f /usr/share/applications/cctv-monitor.desktop

echo "[uninstall] hapus systemd user service ${SERVICE_FILE}"
rm -f "${SERVICE_FILE}"
rmdir "${SERVICE_DIR}" 2>/dev/null || true

if [ "$PURGE_DATA" = "1" ]; then
  echo "[uninstall] hapus data dir ${DATA_DIR} (config, kredensial, browser profile)"
  rm -rf "${DATA_DIR}"
else
  echo "[uninstall] data dir DIKEEP: ${DATA_DIR}"
  echo "            (hapus manual bila perlu, atau jalankan ulang dengan --purge-data)"
fi

echo "[uninstall] selesai. CCTV Monitor sudah dihapus dari sistem."