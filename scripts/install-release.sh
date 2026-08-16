#!/usr/bin/env bash
# install-release.sh — SMART one-liner installer dari GitHub release.
#
#   curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/main/scripts/install-release.sh \
#     | sudo bash -s -- OWNER REPO [tag]
#
#   tag default: latest
#
# Alur pintar:
#   1. Deteksi arsitektur device secara otomatis (x86_64|arm64|arm|386)
#      dan pilih paket yang paling compatible.
#   2. Cek apakah sudah pernah install (ada /opt/cctv-monitor/version).
#      - Fresh install  -> langsung install.
#      - Versi sama     -> info "sudah terbaru", konfirmasi sebelum lanjut.
#      - Versi beda     -> sarankan update, menunggu persetujuan user.
#   3. Install: /opt/cctv-monitor + symlink + systemd autostart + desktop entry.
#   4. Tampilkan info akses: cara buka GUI, tutup/buka browser, help, uninstall,
#      dan keterangan auto-start saat reboot.
#
# Catatan:Chromium bundle tidak termasuk (opsional).
set -euo pipefail

OWNER="${1:?usage: install-release.sh OWNER REPO [tag]}"
REPO="${2:?usage: install-release.sh OWNER REPO [tag]}"
TAG="${3:-latest}"

# Override untuk testing/self-host: 
#   RAW_BASE  -> base untuk mengambil lib-install.sh (default raw.githubusercontent.com)
#   REL_BASE  -> base untuk mengunduh asset release (default github.com)
RAW_BASE="${RAW_BASE:-https://raw.githubusercontent.com}"
REL_BASE="${REL_BASE:-https://github.com}"

source <(curl -fsSL "${RAW_BASE}/${OWNER}/${REPO}/main/scripts/lib-install.sh")

if [ "$(id -u)" -ne 0 ]; then
  echo "Jalankan dengan sudo: ... | sudo bash -s -- ${OWNER} ${REPO} ${TAG}"
  exit 1
fi

INSTALL_DIR="/opt/cctv-monitor"
BIN="/usr/local/bin/cctv-monitor"
RUNUSER="$(detect_runuser)"

# Browser wajib ada (Chromium-family) sebelum instalasi dilanjutkan.
ensure_browser "${RUNUSER}"

ARCH="$(detect_arch)"
if [ "${ARCH}" = "unknown" ]; then
  echo "Arsitektur tidak didukung: $(uname -m)"
  exit 1
fi
ASSET="cctv-monitor-linux-${ARCH}.tar.gz"

# 1. Cek instalasi yang sudah ada (fresh vs update).
INSTALLED_VERSION=""
if [ -f "${INSTALL_DIR}/version" ]; then
  INSTALLED_VERSION="$(read_version "${INSTALL_DIR}")"
fi

# 2. Selesaikan tag release.
if [ "$TAG" = "latest" ]; then
  LATEST_TAG="$(curl -fsSL "https://api.github.com/repos/${OWNER}/${REPO}/releases/latest" \
    | grep -m1 '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')"
  if [ -z "$LATEST_TAG" ]; then
    echo "[install] tidak dapat menentukan release terbaru; gunakan: install-release.sh OWNER REPO <tag>" >&2
    exit 1
  fi
  TAG="$LATEST_TAG"
fi

echo ""
echo "=== CCTV Monitor Installer ==="
echo "  Device arch   : ${ARCH} ($(uname -m))"
echo "  Release tag   : ${TAG}"
if [ -n "${INSTALLED_VERSION}" ]; then
  echo "  Terinstall    : v${INSTALLED_VERSION}"
else
  echo "  Status        : INSTALL BARU (fresh)"
fi
echo ""

# 3. Unduh ke temp dulu untuk mengetahui versi paket tanpa mengubah sistem.
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
URL="${REL_BASE}/${OWNER}/${REPO}/releases/download/${TAG}/${ASSET}"
echo "[install] unduh ${URL}"
curl -fsSL -m 600 -o "${TMP}/package.tar.gz" "$URL"

mkdir -p "${TMP}/pkg"
tar -xzf "${TMP}/package.tar.gz" -C "${TMP}/pkg"
PKG="${TMP}/pkg/cctv-monitor"
if [ ! -x "${PKG}/cctv-monitor" ]; then
  echo "[install] struktur tarball tidak ditemukan (harus berisi folder cctv-monitor/)" >&2
  exit 1
fi
NEW_VERSION="$(read_version "${PKG}")"

# 4. Keputusan fresh/update dengan persetujuan user.
if [ -n "${INSTALLED_VERSION}" ]; then
  if [ "${INSTALLED_VERSION}" = "${NEW_VERSION}" ]; then
    echo "Versi terinstall (v${INSTALLED_VERSION}) SUDAH SAMA dengan release (v${NEW_VERSION})."
    read -r -p "Tidak perlu update. Tetap install ulang? [y/N] " ans
    case "$ans" in y|Y|yes|YES) ;; *) echo "Dibatalkan."; exit 0 ;; esac
  else
    echo "Update tersedia: v${INSTALLED_VERSION} -> v${NEW_VERSION}"
    read -r -p "Lanjutkan update? [y/N] " ans
    case "$ans" in y|Y|yes|YES) ;; *) echo "Update dibatalkan. Versi lama tetap terpasang."; exit 0 ;; esac
  fi
else
  echo "Fresh install terdeteksi. Melanjutkan instalasi v${NEW_VERSION}..."
fi

# 5. Install.
echo "[install] copy ke ${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"
cp -rf "${PKG}/." "${INSTALL_DIR}/"
chmod +x "${INSTALL_DIR}/cctv-monitor"
chmod +x "${INSTALL_DIR}/resources/go2rtc" 2>/dev/null || true

echo "[install] symlink CLI: ${BIN}"
ln -sf "${INSTALL_DIR}/cctv-monitor" "${BIN}"

echo "[install] atur auto-start..."
enable_autostart "${RUNUSER}" "${INSTALL_DIR}/cctv-monitor"
create_desktop_entry

echo "[install] selesai."
print_access_info "${NEW_VERSION}"