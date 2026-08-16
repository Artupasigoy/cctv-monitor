#!/usr/bin/env bash
# lib-install.sh — fungsi bersama untuk install.sh & install-release.sh.
# Di-source oleh script install; tidak dieksekusi langsung.

INSTALL_DIR="${INSTALL_DIR:-/opt/cctv-monitor}"
BIN="${BIN:-/usr/local/bin/cctv-monitor}"

# detect_runuser: user target (bukan root) untuk service/desktop/data dir.
detect_runuser() {
  RUNUSER="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"
  echo "${RUNUSER}"
}

# detect_arch: nama arch package dari uname -m.
detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x86_64" ;;
    aarch64|arm64) echo "arm64" ;;
    armv7l|armv8l) echo "arm" ;;
    i386|i486|i586|i686) echo "386" ;;
    *) echo "unknown" ;;
  esac
}

# read_version: baca file version (default 0.1.0).
read_version() {
  local dir="${1:-.}"
  if [ -f "${dir}/version" ]; then
    tr -d '\n ' < "${dir}/version"
  else
    echo "0.1.0"
  fi
}

# ask_yes_no: tanya ya/tidak yang AMAN walau stdin adalah pipe (curl | bash).
# Baca dari /dev/tty (terminal pengguna) sehingga prompt benar-benar muncul.
# $1 = teks prompt. Return 0 = ya, 1 = tidak/EOF.
ask_yes_no() {
  local prompt="$1" ans=""
  if [ -c /dev/tty ] 2>/dev/null; then
    read -r -p "${prompt}" ans < /dev/tty || ans=""
  else
    read -r -p "${prompt}" ans || ans=""
  fi
  case "${ans}" in
    y|Y|yes|YES) return 0 ;;
    *) return 1 ;;
  esac
}

# CHROMIUM_BROWSERS: daftar binary Chromium-family yang didukung.
CHROMIUM_BROWSERS="chromium chromium-browser google-chrome google-chrome-stable microsoft-edge"

# find_chromium: cari browser Chromium yang terpasang di PATH. Return path atau kosong.
# $1 (opsional) = folder paket yang sedang diproses (untuk deteksi bundled chromium
#                  sebelum paket di-copy, mis. saat fresh install).
find_chromium() {
  local pkg_dir="${1:-}"
  for b in ${CHROMIUM_BROWSERS}; do
    if command -v "${b}" >/dev/null 2>&1; then
      echo "${b}"
      return 0
    fi
  done
  # bundled Chromium ikut dianggap tersedia — cek dari paket (belum ter-copy) dulu,
  # lalu dari lokasi instalasi yang sudah ada.
  if [ -n "${pkg_dir}" ] && [ -x "${pkg_dir}/resources/chromium/chrome" ]; then
    echo "bundled"
    return 0
  fi
  if [ -x "${INSTALL_DIR}/resources/chromium/chrome" ]; then
    echo "bundled"
    return 0
  fi
  return 1
}

# detect_pkgmgr: nama package manager distro.
detect_pkgmgr() {
  if command -v apt-get >/dev/null 2>&1; then echo "apt"
  elif command -v dnf >/dev/null 2>&1; then echo "dnf"
  elif command -v pacman >/dev/null 2>&1; then echo "pacman"
  elif command -v zypper >/dev/null 2>&1; then echo "zypper"
  elif command -v apk >/dev/null 2>&1; then echo "apk"
  else echo "unknown"; fi
}

# ensure_browser: pastikan ada browser Chromium. Jika tidak ada, jelaskan bahwa
# aplikasi membutuhkan Chromium, lalu TAWARKAN auto-install package "chromium"
# sesuai package manager distro (pilihan paling ringan & paling compatible:
# chromium dari repo distro — lebih ringan daripada google-chrome/edge/bundled).
# Jika user setuju -> install; jika menolak -> instalasi DIHENTIKAN (exit 1).
# $1 = runuser (untuk pesan yang akurat). $2 (opsional) = folder paket untuk
#     deteksi bundled chromium sebelum ter-copy.
ensure_browser() {
  local runuser="$1" pkg_dir="${2:-}"
  if find_chromium "${pkg_dir}" >/dev/null 2>&1; then
    echo "[browser] OK: Chromium tersedia ($(find_chromium "${pkg_dir}"))"
    return 0
  fi

  echo ""
  echo "[browser] PERHATIAN: Aplikasi ini MEMBUTUHKAN browser Chromium untuk"
  echo "[browser] menampilkan video CCTV (WebRTC/H.264/autoplay) di layar."
  echo "[browser] Belum ada Chromium-family (chromium, google-chrome, microsoft-edge)"
  echo "[browser] yang terpasang di mesin ini."
  echo ""
  local pkgmgr
  pkgmgr="$(detect_pkgmgr)"
  if [ "${pkgmgr}" = "unknown" ]; then
    echo "[browser] Package manager distro tidak dikenal. Install Chromium secara manual:"
    echo "[browser]   Debian/Ubuntu : sudo apt install chromium"
    echo "[browser]   Fedora        : sudo dnf install chromium"
    echo "[browser]   Arch/Manjaro  : sudo pacman -S chromium"
    echo "[browser]   Alpine        : sudo apk add chromium"
    echo "[browser]   OpenSUSE      : sudo zypper install chromium"
    echo "[browser] Setelah terinstall, jalankan instalasi lagi."
    exit 1
  fi

  echo "[browser] Installer akan menginstall 'chromium' via ${pkgmgr}."
  echo "[browser] 'chromium' dari repo distro adalah pilihan PALING RINGAN dan"
  echo "[browser] paling compatible (lebih ringan daripada google-chrome/edge/bundled)."
  if ask_yes_no "Setuju untuk menginstall Chromium sekarang? [y/N] "; then
    echo "[browser] Menginstall chromium via ${pkgmgr}..."
    case "${pkgmgr}" in
      apt)    apt-get update -y && DEBIAN_FRONTEND=noninteractive apt-get install -y chromium ;;
      dnf)    dnf install -y chromium ;;
      pacman) pacman -S --noconfirm chromium ;;
      zypper) zypper --non-interactive install chromium ;;
      apk)    apk add --no-cache chromium ;;
    esac
  else
    echo "[browser] DITOLAK. Instalasi tidak bisa dilanjutkan tanpa browser Chromium."
    echo "[browser] Install Chromium dulu, misalnya:"
    echo "[browser]   sudo apt install chromium   (Debian/Ubuntu/Raspi OS)"
    echo "[browser]   sudo dnf install chromium   (Fedora)"
    echo "[browser]   sudo pacman -S chromium     (Arch/Manjaro)"
    exit 1
  fi

  if find_chromium "${pkg_dir}" >/dev/null 2>&1; then
    echo "[browser] OK: Chromium terinstall ($(find_chromium "${pkg_dir}"))"
    return 0
  fi
  echo "[browser] Chromium masih tidak ditemukan setelah install. Cek package manager distro Anda."
  exit 1
}

# enable_autostart: systemd user service + enable-linger agar jalan saat reboot.
# $1 = runuser, $2 = exec path launcher.
enable_autostart() {
  local runuser="$1" exec_path="$2"
  local user_home service_dir uid
  user_home="$(getent passwd "${runuser}" 2>/dev/null | cut -d: -f6)"
  [ -n "${user_home}" ] || user_home="/home/${runuser}"
  uid="$(id -u "${runuser}" 2>/dev/null || echo 1000)"
  service_dir="${user_home}/.config/systemd/user"

  mkdir -p "${service_dir}"
  cat > "${service_dir}/cctv-monitor.service" <<EOF
[Unit]
Description=CCTV Monitor
After=network.target

[Service]
ExecStart=${exec_path}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
EOF
  chown -R "${runuser}" "${user_home}/.config/systemd" 2>/dev/null || true

  if [ -d "/run/user/${uid}" ]; then
    sudo -u "${runuser}" systemctl --user daemon-reload 2>/dev/null || true
    sudo -u "${runuser}" systemctl --user enable --now cctv-monitor 2>/dev/null \
      && echo "[install] systemd user service DIATIFKAN (auto-start saat reboot)"
    sudo -u "${runuser}" loginctl enable-linger "${runuser}" 2>/dev/null \
      && echo "[install] enable-linger diaktifkan — service tetap jalan tanpa login"
  else
    echo "[install] tidak ada sesi user — auto-start dilewati. Jalankan manual: cctv-monitor"
  fi
}

# disable_autostart: matikan auto-start (uninstall & disable-autostart).
disable_autostart() {
  local runuser="$1" user_home
  user_home="$(getent passwd "${runuser}" 2>/dev/null | cut -d: -f6)"
  [ -n "${user_home}" ] || user_home="/home/${runuser}"
  if [ -f "${user_home}/.config/systemd/user/cctv-monitor.service" ]; then
    sudo -u "${runuser}" systemctl --user disable --now cctv-monitor 2>/dev/null || true
    sudo -u "${runuser}" systemctl --user daemon-reload 2>/dev/null || true
  fi
}

# create_desktop_entry: hanya jika ada environment desktop.
create_desktop_entry() {
  if [ -n "${DESKTOP_SESSION:-}" ] || [ -n "${XDG_CURRENT_DESKTOP:-}" ]; then
    cat > /usr/share/applications/cctv-monitor.desktop <<EOF
[Desktop Entry]
Name=CCTV Monitor
Comment=Live CCTV monitoring (LAN-only)
Exec=${INSTALL_DIR}/cctv-monitor
Terminal=false
Type=Application
Categories=Utility;Video;Network;
EOF
    echo "[install] desktop entry dibuat: /usr/share/applications/cctv-monitor.desktop"
  fi
}

# preflight_package: verifikasi paket SEBELUM menyentuh sistem.
#   - binary launcher bisa dieksekusi & arsitektur cocok (cctv-monitor version)
#   - go2rtc ada dan executable
# Gagal -> print error & exit 1 (sistem tidak berubah, tidak ada sampah).
# $1 = folder paket (berisi cctv-monitor, resources/, dist/).
preflight_package() {
  local pkg="$1"
  if [ ! -x "${pkg}/cctv-monitor" ]; then
    echo "[preflight] GAGAL: launcher tidak ditemukan/executable: ${pkg}/cctv-monitor" >&2
    return 1
  fi
  if [ ! -d "${pkg}/dist" ]; then
    echo "[preflight] GAGAL: folder dist (frontend build) tidak ada: ${pkg}/dist" >&2
    return 1
  fi
  if [ ! -x "${pkg}/resources/go2rtc" ]; then
    echo "[preflight] GAGAL: go2rtc tidak ditemukan/executable: ${pkg}/resources/go2rtc" >&2
    return 1
  fi
  local out rc
  out="$("${pkg}/cctv-monitor" version 2>&1)"
  rc=$?
  if [ ${rc} -ne 0 ]; then
    echo "[preflight] GAGAL: launcher tidak bisa dijalankan di mesin ini (arkh tidak cocok atau binary corrupt):" >&2
    echo "${out}" >&2
    return 1
  fi
  echo "[preflight] OK: paket valid (${out})"
  return 0
}

# check_disk_space: pastikan ruang disk cukup sebelum copy. $1 = folder tujuan,
# $2 = perkiraan ukuran paket (bytes). Gagal -> exit 1.
check_disk_space() {
  local dst="$1" need="${2:-100000000}"
  local avail check_path="${dst}"
  # df butuh path yang sudah ada — cari ancestor terdekat yang eksis.
  while [ ! -d "${check_path}" ] && [ "${check_path}" != "/" ]; do
    check_path="$(dirname "${check_path}")"
  done
  avail="$(df -Pk "${check_path}" 2>/dev/null | awk 'NR==2 {print $4*1024}')"
  [ -n "${avail}" ] || avail=0
  if [ "${avail}" -lt "${need}" ]; then
    echo "[preflight] GAGAL: ruang disk tidak cukup. Butuh ~$(( need / 1024 / 1024 ))MB, tersedia $(( avail / 1024 / 1024 ))MB di ${check_path}." >&2
    exit 1
  fi
  echo "[preflight] OK: ruang disk cukup di ${check_path}"
}

# install_with_rollback: copy paket ke INSTALL_DIR dengan backup/rollback.
# $1 = folder sumber paket. $2 (opsional) = folder tujuan (default INSTALL_DIR).
# Update: backup folder lama -> copy baru -> verifikasi -> hapus backup.
# Gagal di tengah -> restore backup (update) atau hapus folder parsial (fresh).
install_with_rollback() {
  local src="$1" dst="${2:-${INSTALL_DIR}}"
  local had_old=0 backup=""
  if [ -d "${dst}" ]; then
    had_old=1
    backup="$(dirname "${dst}")/.cctv-monitor.bak.$$"
    rm -rf "${backup}"
    mv "${dst}" "${backup}"
  fi
  if ! mkdir -p "${dst}"; then
    if [ "${had_old}" = "1" ]; then mv "${backup}" "${dst}"; fi
    echo "[install] GAGAL: tidak bisa membuat ${dst}" >&2
    return 1
  fi
  if ! cp -r "${src}/." "${dst}/"; then
    echo "[install] GAGAL saat copy. Memulihkan... " >&2
    rm -rf "${dst}"
    if [ "${had_old}" = "1" ]; then
      mv "${backup}" "${dst}"
      echo "[install] Versi lama dipulihkan: ${dst}" >&2
    fi
    return 1
  fi
  chmod +x "${dst}/cctv-monitor"
  chmod +x "${dst}/resources/go2rtc" 2>/dev/null || true
  if ! "${dst}/cctv-monitor" version >/dev/null 2>&1; then
    echo "[install] GAGAL: launcher hasil copy tidak bisa dijalankan. Memulihkan... " >&2
    rm -rf "${dst}"
    if [ "${had_old}" = "1" ]; then
      mv "${backup}" "${dst}"
      echo "[install] Versi lama dipulihkan: ${dst}" >&2
    fi
    return 1
  fi
  rm -rf "${backup}"
  return 0
}

# print_access_info: info akhir setelah install — cara buka GUI, keluar, help, uninstall, autostart.
print_access_info() {
  local version="$1"
  echo ""
  echo "============================================================"
  echo "  CCTV Monitor v${version} BERHASIL DIINSTAL"
  echo "============================================================"
  echo ""
  echo "  BUKA TAMPILAN MONITOR CCTV (GUI browser):"
  echo "      cctv-monitor"
  echo "      # atau buka browser manual ke http://127.0.0.1:1986"
  echo ""
  echo "  TUTUP BROWSER (tetap akses CLI):"
  echo "      cctv-monitor close-browser"
  echo ""
  echo "  BUKA KEMBALI BROWSER:"
  echo "      cctv-monitor open-browser"
  echo ""
  echo "  HELP LENGKAP (semua perintah & best practice):"
  echo "      cctv-monitor help"
  echo ""
  echo "  UNINSTALL BERSIH:"
  echo "      cctv-monitor uninstall"
  echo "      # atau: sudo ${INSTALL_DIR}/scripts/uninstall.sh --purge-data"
  echo ""
  echo "  AUTO-START SUDAH AKTIF:"
  echo "      Setelah REBOOT (mis. mati lampu lalu hidup), aplikasi"
  echo "      langsung terbuka ke tampilan video CCTV tanpa perintah apa pun."
  echo ""
  echo "  Untuk mode fullscreen di STB/Raspi/TV:"
  echo "      cctv-monitor --kiosk"
  echo "============================================================"
}