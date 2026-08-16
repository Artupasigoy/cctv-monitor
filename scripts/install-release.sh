#!/usr/bin/env bash
# install-release.sh — SMART one-liner installer dari GitHub release.
#
#   curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/main/scripts/install-release.sh \
#     | sudo bash -s -- OWNER REPO [tag]
#
#   tag default: latest
#
# Alur (SEMUA pengecekan & persetujuan di AWAL, sebelum sistem disentuh):
#   1. Deteksi arsitektur device secara otomatis (x86_64|arm64|arm|386).
#      Tidak didukung -> berhenti segera, sistem tidak berubah.
#   2. Tentukan versi yang akan diinstall (tag), lalu tampilkan ringkasan:
#      arch, tag, dan status (fresh / update / versi sama) beserta persetujuan
#      user — SEBELUM download apa pun.
#   3. Pastikan browser Chromium tersedia (atau user setuju diinstall).
#   4. Unduh + ekstrak paket ke temp (bukan ke sistem).
#   5. Pre-flight: jalankan binary dari temp untuk memastikan paket compatible
#      dengan mesin ini + cek ruang disk — SEBELUM menyalin apa pun.
#   6. Install dengan rollback: /opt/cctv-monitor + symlink + systemd autostart
#      + desktop entry. Gagal di tengah -> versi lama dipulihkan (tidak ada sampah).
#   7. Tampilkan info akses.
#
# Catatan: Chromium bundle tidak termasuk (opsional).
set -euo pipefail

OWNER="${1:?usage: install-release.sh OWNER REPO [tag]}"
REPO="${2:?usage: install-release.sh OWNER REPO [tag]}"
TAG="${3:-latest}"

# Override untuk testing/self-host:
#   RAW_BASE  -> base untuk mengambil lib-install.sh (default raw.githubusercontent.com)
#   REL_BASE  -> base untuk mengunduh asset release (default github.com)
RAW_BASE="${RAW_BASE:-https://raw.githubusercontent.com}"
REL_BASE="${REL_BASE:-https://github.com}"

# fetch_url: unduh URL dengan retry + cache-buster (query string unik per percobaan).
# Mengatasi: DNS gagal sementara, atau cache 404 CDN raw saat repo baru dibuat
# public. $1 = base URL. Mengembalikan isi file via stdout; exit 1 bila semua
# percobaan gagal.
fetch_url() {
  local url="$1" i
  for i in 1 2 3; do
    if curl -fsSL -m 60 "${url}?cb=$RANDOM$i"; then
      return 0
    fi
    echo "[install] unduh gagal (percobaan $i/3): ${url}" >&2
    sleep 2
  done
  return 1
}

# fetch_file: unduh URL ke file output dengan retry + cache-buster.
# $1 = URL, $2 = file output.
fetch_file() {
  local url="$1" out="$2" i
  for i in 1 2 3; do
    if curl -fsSL -m 600 -o "${out}" "${url}?cb=$RANDOM$i"; then
      return 0
    fi
    echo "[install] unduh gagal (percobaan $i/3): ${url}" >&2
    sleep 2
  done
  return 1
}

# Muat fungsi bersama (lib-install.sh). Gagal -> pesan jelas, bukan lanjut ke
# pemanggilan fungsi yang tidak terdefinisi (mis. 'detect_runuser: command not found').
if ! source <(fetch_url "${RAW_BASE}/${OWNER}/${REPO}/main/scripts/lib-install.sh"); then
  echo "[install] GAGAL mengunduh lib-install.sh dari GitHub (cek koneksi internet/DNS)." >&2
  echo "[install]   URL: ${RAW_BASE}/${OWNER}/${REPO}/main/scripts/lib-install.sh" >&2
  exit 1
fi
if ! command -v detect_runuser >/dev/null 2>&1; then
  echo "[install] GAGAL: file dependensi installer tidak dimuat dengan benar." >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Jalankan dengan sudo: ... | sudo bash -s -- ${OWNER} ${REPO} ${TAG}"
  exit 1
fi

INSTALL_DIR="/opt/cctv-monitor"
BIN="/usr/local/bin/cctv-monitor"
RUNUSER="$(detect_runuser)"

# --- FASE 1: pengecekan cepat (murah, fail segera). ---

# 1a. Arsitektur — instan, tidak didukung -> berhenti tanpa perubahan.
ARCH="$(detect_arch)"
if [ "${ARCH}" = "unknown" ]; then
  echo "Arsitektur tidak didukung: $(uname -m)"
  exit 1
fi
ASSET="cctv-monitor-linux-${ARCH}.tar.gz"

# 1b. Cek instalasi yang sudah ada (fresh vs update).
INSTALLED_VERSION=""
if [ -f "${INSTALL_DIR}/version" ]; then
  INSTALLED_VERSION="$(read_version "${INSTALL_DIR}")"
fi

# 1c. Selesaikan tag release.
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

# 1d. Persetujuan user SEBELUM download — tidak ada sistem yang berubah di sini.
if [ -n "${INSTALLED_VERSION}" ]; then
  if [ "${INSTALLED_VERSION}" = "${TAG#v}" ]; then
    echo "Versi terinstall (v${INSTALLED_VERSION}) SUDAH SAMA dengan release (v${TAG#v})."
    ask_yes_no "Tidak perlu update. Tetap install ulang? [y/N] " || { echo "Dibatalkan."; exit 0; }
  else
    echo "Update tersedia: v${INSTALLED_VERSION} -> v${TAG#v}"
    ask_yes_no "Lanjutkan update? [y/N] " || { echo "Update dibatalkan. Versi lama tetap terpasang."; exit 0; }
  fi
else
  echo "Fresh install terdeteksi (v${TAG#v}). Melanjutkan..."
fi

# --- FASE 2: unduh ke temp (sistem belum tersentuh). ---

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

URL="${REL_BASE}/${OWNER}/${REPO}/releases/download/${TAG}/${ASSET}"
echo "[install] unduh ${URL}"
if ! fetch_file "${URL}" "${TMP}/package.tar.gz"; then
  echo "[install] GAGAL mengunduh paket release (cek koneksi internet/DNS atau pastikan tag ${TAG} punya aset ${ASSET})." >&2
  exit 1
fi

mkdir -p "${TMP}/pkg"
tar -xzf "${TMP}/package.tar.gz" -C "${TMP}/pkg"
PKG="${TMP}/pkg/cctv-monitor"
if [ ! -x "${PKG}/cctv-monitor" ]; then
  echo "[install] struktur tarball tidak ditemukan (harus berisi folder cctv-monitor/)" >&2
  exit 1
fi
NEW_VERSION="$(read_version "${PKG}")"

# --- FASE 3: pre-flight compatibility & ruang disk, sebelum sistem berubah. ---
echo ""
echo "[preflight] memverifikasi paket sebelum instalasi..."
if ! preflight_package "${PKG}"; then
  echo "[preflight] Paket tidak compatible dengan mesin ini. Instalasi DIHENTIKAN. Tidak ada file yang diubah." >&2
  exit 1
fi
check_disk_space "${INSTALL_DIR}" "$(du -sb "${PKG}" 2>/dev/null | cut -f1)"

# Browser wajib ada (Chromium-family). Menolak -> berhenti, sistem belum berubah.
ensure_browser "${RUNUSER}" "${PKG}"

# --- FASE 4: install dengan rollback. ---

# Update-path aman: matikan service lama dulu agar binary tidak sedang dipakai.
if [ -n "${INSTALLED_VERSION}" ]; then
  echo "[install] matikan auto-start lama sebelum update..."
  disable_autostart "${RUNUSER}"
fi

echo "[install] copy ke ${INSTALL_DIR} (dengan rollback)..."
if ! install_with_rollback "${PKG}" "${INSTALL_DIR}"; then
  echo "[install] GAGAL. Sistem dikembalikan ke kondisi sebelumnya. Tidak ada sampah tertinggal." >&2
  exit 1
fi

echo "[install] symlink CLI: ${BIN}"
ln -sf "${INSTALL_DIR}/cctv-monitor" "${BIN}"

echo "[install] atur auto-start..."
enable_autostart "${RUNUSER}" "${INSTALL_DIR}/cctv-monitor"
create_desktop_entry

echo "[install] selesai."
print_access_info "${NEW_VERSION}"