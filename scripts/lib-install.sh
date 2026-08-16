#!/usr/bin/env bash
# lib-install.sh — fungsi bersama untuk install.sh & install-release.sh.
# Di-source oleh script install; tidak dieksekusi langsung.

INSTALL_DIR="${INSTALL_DIR:-/opt/cctv-monitor}"
BIN="${BIN:-/usr/local/bin/cctv-monitor}"

# detect_runuser: user target (bukan root) untuk service/desktop/data dir.
detect_runuser() {
  local ru="${SUDO_USER:-}"
  if [ -z "${ru}" ]; then
    # logname bisa exit 0 dengan output kosong — pastikan hasil tidak kosong.
    ru="$(logname 2>/dev/null)"
  fi
  if [ -z "${ru}" ]; then
    # Cari user non-root yang sedang login (fallback paling masuk akal).
    ru="$(awk -F: '$3>=1000 && $3<65534 && $7!~"nologin|false" {print $1; exit}' /etc/passwd 2>/dev/null)"
  fi
  [ -n "${ru}" ] || ru="root"
  echo "${ru}"
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
# ask_yes_no: prompt konfirmasi. $2 (opsional) = default bila Enter kosong ("y"/"n").
ask_yes_no() {
  local prompt="$1" def="${2:-n}" ans=""
  if [ -c /dev/tty ] 2>/dev/null; then
    read -r -p "${prompt}" ans < /dev/tty || ans=""
  else
    read -r -p "${prompt}" ans || ans=""
  fi
  case "${ans}" in
    y|Y|yes|YES) return 0 ;;
    "")
      if [ "${def}" = "y" ]; then return 0; else return 1; fi
      ;;
    *) return 1 ;;
  esac
}

# CHROMIUM_BROWSERS: daftar binary Chromium-family yang didukung.
CHROMIUM_BROWSERS="chromium chromium-browser google-chrome google-chrome-stable microsoft-edge"

# find_chromium: cari browser Chromium yang terpasang. Return nama/path atau kosong.
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
  # Chromium via snap (Ubuntu) ada di /snap/bin — mungkin tidak di PATH.
  for sp in /snap/bin/chromium /var/lib/snapd/snap/bin/chromium; do
    if [ -x "${sp}" ]; then
      echo "${sp}"
      return 0
    fi
  done
  # Chromium via flatpak — binary di export dir, tidak selalu di PATH.
  for fp in \
    /var/lib/flatpak/exports/bin/org.chromium.Chromium \
    /var/lib/flatpak/exports/bin/com.google.Chrome \
    /var/lib/flatpak/exports/bin/com.microsoft.Edge \
    "${HOME}/.local/share/flatpak/exports/bin/org.chromium.Chromium" \
    "${HOME}/.local/share/flatpak/exports/bin/com.google.Chrome"; do
    if [ -x "${fp}" ]; then
      echo "${fp}"
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

# detect_distro: nama distro dari /etc/os-release (untuk diagnosa & pesan).
detect_distro() {
  local id
  id="$(sed -n 's/^ID=//p' /etc/os-release 2>/dev/null | tr -d '"')"
  [ -n "${id}" ] || id="$(uname -s)"
  echo "${id}"
}

# ---------------------------------------------------------------------------
# Browser Chromium — instalasi multi-strategi yang TIDAK mudah menyerah.
#
# Prinsip: coba SEMUA cara yang relevan secara berurutan, berhenti hanya saat
# salah satu berhasil (verifikasi = find_chromium menemukan binary). Tidak ada
# strategi yang mem-block strategi lain; kegagalan satu jalur LANGSUNG lanjut
# ke jalur berikutnya. Urutan (semua Chromium-family, sesuai kebijakan proyek):
#   1. package manager native distro (paling ringan & compatible)
#   2. snap  (Ubuntu 22.04+)
#   3. flatpak (universal, bila tersedia)
#   4. unduh Google Chrome .deb/.rpm langsung (amd64/x86_64)
#   5. diagnosa lengkap + solusi manual per distro
# ---------------------------------------------------------------------------

# apt_install_pkg: coba satu package via apt dan verifikasi binary.
# $1 = package, $2 = pkg_dir (opsional). Return 0 = binary jalan.
apt_install_pkg() {
  local pkg="$1" pkg_dir="${2:-}" apt_log
  apt_log="$(mktemp /tmp/cctvmon-apt.XXXXXX)"
  echo "[browser] coba package '${pkg}' via apt..."
  if DEBIAN_FRONTEND=noninteractive apt-get install -y "${pkg}" > "${apt_log}" 2>&1; then
    if find_chromium "${pkg_dir}" >/dev/null 2>&1; then
      echo "[browser] OK: Chromium terpasang via package '${pkg}'."
      rm -f "${apt_log}"
      return 0
    fi
  else
    tail -6 "${apt_log}" || true
  fi
  rm -f "${apt_log}"
  return 1
}

# install_chromium_native: jalur 1 — package manager native distro.
install_chromium_native() {
  local pkg_dir="${1:-}" pkgmgr pkg
  pkgmgr="$(detect_pkgmgr)"
  case "${pkgmgr}" in
    apt)
      echo "[browser] apt-get update (mungkin butuh beberapa saat)..."
      apt-get update 2>&1 | tail -3 || true
      # Debian: 'chromium' ada. Ubuntu <22.04: 'chromium'. Ubuntu 22.04+:
      # 'chromium' tidak ada, 'chromium-browser' adalah wrapper ke snap.
      for pkg in chromium chromium-browser; do
        if apt_install_pkg "${pkg}" "${pkg_dir}"; then return 0; fi
      done
      # dpkg bisa "berhasil" sebagian tapi binary belum jalan — perbaiki dulu.
      echo "[browser] coba perbaiki dpkg (apt-get install -f)..."
      if DEBIAN_FRONTEND=noninteractive apt-get install -y -f >/dev/null 2>&1; then
        if find_chromium "${pkg_dir}" >/dev/null 2>&1; then
          echo "[browser] OK: Chromium terpasang setelah perbaikan dpkg."
          return 0
        fi
      fi
      ;;
    dnf)
      # Fedora punya chromium; RHEL/CentOS bisa pakai google-chrome-stable.
      for pkg in chromium google-chrome-stable; do
        echo "[browser] coba package '${pkg}' via dnf..."
        if dnf install -y "${pkg}" >/dev/null 2>&1; then
          if find_chromium "${pkg_dir}" >/dev/null 2>&1; then
            echo "[browser] OK: Chromium terpasang via package '${pkg}'."
            return 0
          fi
        fi
      done
      ;;
    pacman)
      echo "[browser] coba package 'chromium' via pacman..."
      if pacman -S --noconfirm chromium >/dev/null 2>&1; then
        if find_chromium "${pkg_dir}" >/dev/null 2>&1; then
          echo "[browser] OK: Chromium terpasang via package 'chromium'."
          return 0
        fi
      fi
      ;;
    zypper)
      echo "[browser] coba package 'chromium' via zypper..."
      if zypper --non-interactive install chromium >/dev/null 2>&1; then
        if find_chromium "${pkg_dir}" >/dev/null 2>&1; then
          echo "[browser] OK: Chromium terpasang via package 'chromium'."
          return 0
        fi
      fi
      ;;
    apk)
      echo "[browser] coba package 'chromium' via apk..."
      if apk add --no-cache chromium >/dev/null 2>&1; then
        if find_chromium "${pkg_dir}" >/dev/null 2>&1; then
          echo "[browser] OK: Chromium terpasang via package 'chromium'."
          return 0
        fi
      fi
      ;;
    *)
      echo "[browser] package manager tidak dikenal (${pkgmgr})." >&2
      ;;
  esac
  return 1
}

# install_chromium_snap: jalur 2 — snap (Ubuntu 22.04+).
install_chromium_snap() {
  local pkg_dir="${1:-}" snap_log
  if ! command -v snap >/dev/null 2>&1; then
    echo "[browser] snap tidak tersedia di mesin ini (skip jalur snap)."
    return 1
  fi
  echo "[browser] coba 'snap install chromium'..."
  # Pastikan snapd aktif (bisa mati di container/headless) sebelum snap install.
  systemctl start snapd 2>/dev/null || true
  snap_log="$(mktemp /tmp/cctvmon-snap.XXXXXX)"
  if snap install chromium > "${snap_log}" 2>&1; then
    rm -f "${snap_log}"
    if find_chromium "${pkg_dir}" >/dev/null 2>&1; then
      echo "[browser] OK: Chromium terpasang via snap."
      return 0
    fi
  else
    tail -5 "${snap_log}" || true
  fi
  rm -f "${snap_log}"
  echo "[browser] snap install chromium tidak menghasilkan Chromium yang jalan." >&2
  return 1
}

# install_chromium_flatpak: jalur 3 — flatpak (universal).
install_chromium_flatpak() {
  local pkg_dir="${1:-}" fp_log
  if ! command -v flatpak >/dev/null 2>&1; then
    echo "[browser] flatpak tidak tersedia di mesin ini (skip jalur flatpak)."
    return 1
  fi
  echo "[browser] coba 'flatpak install org.chromium.Chromium'..."
  flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo >/dev/null 2>&1 || true
  fp_log="$(mktemp /tmp/cctvmon-flatpak.XXXXXX)"
  if flatpak install -y --noninteractive flathub org.chromium.Chromium > "${fp_log}" 2>&1; then
    rm -f "${fp_log}"
    if find_chromium "${pkg_dir}" >/dev/null 2>&1; then
      echo "[browser] OK: Chromium terpasang via flatpak."
      return 0
    fi
  else
    tail -5 "${fp_log}" || true
  fi
  rm -f "${fp_log}"
  echo "[browser] flatpak install Chromium tidak menghasilkan Chromium yang jalan." >&2
  return 1
}

# install_chromium_direct: jalur 4 — unduh Google Chrome .deb/.rpm langsung
# dari dl.google.com (jalur terakhir sebelum menyerah). Hanya amd64/x86_64.
install_chromium_direct() {
  local pkg_dir="${1:-}" pkgmgr arch deb url
  pkgmgr="$(detect_pkgmgr)"
  arch="$(uname -m)"
  case "${arch}" in
    x86_64|amd64) ;;
    *)
      echo "[browser] unduh langsung hanya untuk amd64/x86_64 (skip jalur langsung)."
      return 1
      ;;
  esac
  case "${pkgmgr}" in
    apt|dnf|zypper) ;;
    *)
      echo "[browser] unduh langsung tidak relevan untuk pkgmgr ${pkgmgr} (skip)."
      return 1
      ;;
  esac
  echo "[browser] coba unduh Google Chrome langsung dari dl.google.com..."
  deb="$(mktemp /tmp/cctvmon-chrome.XXXXXX)"
  case "${pkgmgr}" in
    apt) url="https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb" ;;
    dnf|zypper) url="https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm" ;;
  esac
  if ! curl -fsSL -m 120 -o "${deb}" "${url}"; then
    rm -f "${deb}"
    echo "[browser] GAGAL mengunduh Google Chrome (mungkin tanpa internet/ke dl.google.com)." >&2
    return 1
  fi
  case "${pkgmgr}" in
    apt)
      DEBIAN_FRONTEND=noninteractive dpkg -i "${deb}" >/dev/null 2>&1 || true
      # dpkg -i sering butuh dependensi yang belum ada -> perbaiki dengan apt.
      DEBIAN_FRONTEND=noninteractive apt-get install -y -f >/dev/null 2>&1 || true
      ;;
    dnf)
      dnf install -y "${deb}" >/dev/null 2>&1 || true
      ;;
    zypper)
      zypper --non-interactive install "${deb}" >/dev/null 2>&1 || true
      ;;
  esac
  rm -f "${deb}"
  if find_chromium "${pkg_dir}" >/dev/null 2>&1; then
    echo "[browser] OK: Chromium terpasang via Google Chrome (unduh langsung)."
    return 0
  fi
  echo "[browser] Google Chrome gagal terpasang/terdeteksi." >&2
  return 1
}

# browser_manual_help: panduan manual per distro saat semua jalur otomatis gagal.
browser_manual_help() {
  echo "[browser] Install Chromium manual lalu jalankan instalasi lagi:" >&2
  echo "[browser]   Debian/Ubuntu/Raspi OS : sudo apt install chromium-browser   (atau) sudo snap install chromium" >&2
  echo "[browser]                          : sudo apt install chromium           (Debian)" >&2
  echo "[browser]   Fedora                 : sudo dnf install chromium" >&2
  echo "[browser]   Arch/Manjaro           : sudo pacman -S chromium" >&2
  echo "[browser]   Alpine                 : sudo apk add chromium" >&2
  echo "[browser]   OpenSUSE               : sudo zypper install chromium" >&2
  echo "[browser]   Universal (flatpak)    : sudo flatpak install flathub org.chromium.Chromium" >&2
  echo "[browser]   Universal (Google)     : unduh dari https://www.google.com/chrome/ (deb/rpm)" >&2
}

# ensure_browser: pastikan ada browser Chromium. Jika tidak ada, jelaskan bahwa
# aplikasi membutuhkan Chromium, lalu TAWARKAN auto-install. Auto-install
# memakai strategi berlapis: native -> snap -> flatpak -> unduh langsung.
# Jika semua gagal -> pesan jelas per distro (bukan berhenti diam-diam).
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
  echo "[browser] Installer akan mencoba beberapa cara otomatis (native, snap,"
  echo "[browser] flatpak, lalu unduh Google Chrome) sampai berhasil."
  echo "[browser] (untuk skip otomatis, jalankan dengan env CCTVMON_NO_BROWSER=1)"
  if [ "${CCTVMON_NO_BROWSER:-0}" != "1" ] && ask_yes_no "Setuju untuk menginstall Chromium sekarang? [Y/n] " y; then
    echo "[browser] Mencoba memasang Chromium (native -> snap -> flatpak -> unduh langsung)..."
    if ! install_chromium_native "${pkg_dir}" \
      && ! install_chromium_snap "${pkg_dir}" \
      && ! install_chromium_flatpak "${pkg_dir}" \
      && ! install_chromium_direct "${pkg_dir}"; then
      echo "[browser] GAGAL memasang Chromium lewat semua cara otomatis." >&2
      echo "[browser] Diagnosa: distro=$(detect_distro), pkgmgr=$(detect_pkgmgr), arch=$(uname -m)" >&2
      browser_manual_help
      exit 1
    fi
  else
    echo "[browser] DITOLAK. Instalasi tidak bisa dilanjutkan tanpa browser Chromium."
    browser_manual_help
    exit 1
  fi

  if find_chromium "${pkg_dir}" >/dev/null 2>&1; then
    echo "[browser] OK: Chromium terinstall ($(find_chromium "${pkg_dir}"))"
    return 0
  fi
  echo "[browser] Chromium masih tidak ditemukan setelah install. Cek package manager distro Anda." >&2
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