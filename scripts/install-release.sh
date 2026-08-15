#!/usr/bin/env bash
# install-release.sh — ONE-LINER installer dari GitHub release.
#
#   curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/main/scripts/install-release.sh \
#     | sudo bash -s -- OWNER REPO [tag]
#
#   tag default: latest
#
# Mengunduh paket per-arch (cctv-monitor + dist + go2rtc), meng-install ke
# /opt/cctv-monitor, membuat symlink /usr/local/bin/cctv-monitor, serta
# systemd user service + desktop entry bila ada sesi desktop.
# Catatan:Chromium bundle tidak termasuk (opsional). Setelah install,
# jalankan `cctv-monitor` (memakai Chromium sistem) atau
# `chromium &&` + `scripts/fetch-chromium.sh` bila ingin bundle.
set -euo pipefail

OWNER="${1:?usage: install-release.sh OWNER REPO [tag]}"
REPO="${2:?usage: install-release.sh OWNER REPO [tag]}"
TAG="${3:-latest}"

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "amd64" ;;
    aarch64|arm64) echo "arm64" ;;
    armv7l|armv8l) echo "arm" ;;
    i386|i486|i586|i686) echo "386" ;;
    *) echo "Arsitektur tidak didukung: $(uname -m)" >&2; exit 1 ;;
  esac
}

install_deps() {
  if ! command -v curl >/dev/null; then
    echo "apt-get update && apt-get install -y curl" | sudo sh
  fi
}

cd "$(mktemp -d)"
ARCH="$(detect_arch)"
ASSET="cctv-monitor-linux-${ARCH}.tar.gz"

echo "[install] arch=${ARCH} owner=${OWNER} repo=${REPO} tag=${TAG}"

if [ "$TAG" = "latest" ]; then
  # Selesaikan tag versi lewat API (tanpa auth: rate-limited, cukup untuk install jarang).
  LATEST_TAG="$(curl -fsSL "https://api.github.com/repos/${OWNER}/${REPO}/releases/latest" \
    | grep -m1 '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')"
  if [ -z "$LATEST_TAG" ]; then
    echo "[install] tidak dapat menentukan release terbaru; gunakan: install-release.sh OWNER REPO <tag>" >&2
    exit 1
  fi
  TAG="$LATEST_TAG"
fi

URL="https://github.com/${OWNER}/${REPO}/releases/download/${TAG}/${ASSET}"
echo "[install] unduh ${URL}"
curl -fsSL -m 600 -o package.tar.gz "$URL"

mkdir -p cctv-monitor/resources cctv-monitor/dist cctv-monitor/scripts
tar -xzf package.tar.gz --strip-components=0
[ -d cctv-monitor ] || { echo "[install] struktur tarball tidak ditemukan"; exit 1; }
(
  cd cctv-monitor
  [ -x ./scripts/install.sh ] && cp ./scripts/install.sh . || true
  # install.sh sudah ada di paket; biarkan.
  cp -rn . "$PKGDIR"
) || true

PKGDIR="/opt/cctv-monitor"
echo "[install] copy ke ${PKGDIR}"
mkdir -p "$PKGDIR"
cp -rf cctv-monitor/. "$PKGDIR/" 2>/dev/null || cp -r "cctv-monitor/." "$PKGDIR/"
cp cctv-monitor/. "$PKGDIR/" 2>/dev/null || true
chmod +x "$PKGDIR/cctv-monitor" "$PKGDIR/resources/go2rtc" 2>/dev/null || true

ln -sf "${PKGDIR}/cctv-monitor" "/usr/local/bin/cctv-monitor"

# systemd user service (jika ada sesi user target).
RUNUSER="${SUDO_USER:-$(logname 2>/dev/null || echo root)}"
UIDX="$(id -u "${RUNUSER}" 2>/dev/null || echo 1000)"
if [ -d "/run/user/${UIDX}" ]; then
  mkdir -p "/home/${RUNUSER}/.config/systemd/user"
  cat > "/home/${RUNUSER}/.config/systemd/user/cctv-monitor.service" <<'EOF'
[Unit]
Description=CCTV Monitor
After=network.target

[Service]
ExecStart=/opt/cctv-monitor/cctv-monitor
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
EOF
  chown -R "${RUNUSER}" "/home/${RUNUSER}/.config/systemd" 2>/dev/null || true
fi

# desktop entry (jika desktop environment).
if [ -n "${DESKTOP_SESSION:-}" ] || [ -n "${XDG_CURRENT_DESKTOP:-}" ]; then
  cat > /usr/share/applications/cctv-monitor.desktop <<'EOF'
[Desktop Entry]
Name=CCTV Monitor
Comment=Live CCTV monitoring (LAN-only)
Exec=/opt/cctv-monitor/cctv-monitor
Terminal=false
Type=Application
Categories=Utility;Video;Network;
EOF
fi

echo "[install] OK. Jalankan: cctv-monitor"
