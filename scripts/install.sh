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
# Alur (SEMUA pengecekan & persetujuan di AWAL, sebelum sistem disentuh):
#   arch -> build ada -> pre-flight paket (binary jalan, ruang disk) -> browser
#   -> copy dengan rollback (gagal -> versi lama dipulihkan, tanpa sampah).
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

# --- Pre-flight SEBELUM sistem berubah: paket valid + ruang disk + browser. ---
echo ""
echo "[preflight] memverifikasi paket sebelum instalasi..."
if ! preflight_package "${SRC}"; then
  echo "[preflight] Paket tidak compatible dengan mesin ini. Instalasi DIHENTIKAN. Tidak ada file yang diubah." >&2
  exit 1
fi
check_disk_space "${INSTALL_DIR}" "$(du -sb "${SRC}" 2>/dev/null | cut -f1)"

# Browser wajib ada (Chromium-family). Menolak -> berhenti, sistem belum berubah.
ensure_browser "${RUNUSER}" "${SRC}"

# --- Update-path aman: matikan service lama sebelum copy binary. ---
if [ -d "${INSTALL_DIR}" ]; then
  echo "[install] matikan auto-start lama sebelum update..."
  disable_autostart "${RUNUSER}"
fi

echo "[install] copy ke ${INSTALL_DIR} (dengan rollback)..."
if ! install_with_rollback "${SRC}" "${INSTALL_DIR}"; then
  echo "[install] GAGAL. Sistem dikembalikan ke kondisi sebelumnya. Tidak ada sampah tertinggal." >&2
  exit 1
fi

echo "[install] symlink CLI: ${BIN}"
ln -sf "${INSTALL_DIR}/cctv-monitor" "${BIN}"

echo "[install] atur auto-start..."
enable_autostart "${RUNUSER}" "${INSTALL_DIR}/cctv-monitor"

create_desktop_entry

echo "[install] selesai."
print_access_info "${VERSION}"