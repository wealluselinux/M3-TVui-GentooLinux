#!/usr/bin/env bash
# M3 TV UI installer. Works on Gentoo, Arch, Debian/Ubuntu, Fedora, openSUSE,
# Alpine and Void. Installs per-user (no root needed except for Firefox/Python).
#
#   ./install.sh               install (and offer to install Firefox + Python)
#   ./install.sh --no-deps     only install m3tv itself
#   ./install.sh --uninstall   remove m3tv (keeps your config and logins)

set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
APP_DIR="$DATA_HOME/m3-tvui/app"
BIN_DIR="$HOME/.local/bin"
DESKTOP_DIR="$DATA_HOME/applications"

NO_DEPS=0
UNINSTALL=0
for arg in "$@"; do
  case "$arg" in
    --no-deps) NO_DEPS=1 ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help) sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

say()  { printf '\033[1;35m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }

if [ "$UNINSTALL" -eq 1 ]; then
  exec "$SRC_DIR/uninstall.sh" --yes
fi

# ---- detect distro ----------------------------------------------------------
ID_LIKE_ALL=""
if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  ID_LIKE_ALL="${ID:-} ${ID_LIKE:-}"
fi
case " $ID_LIKE_ALL " in
  *" gentoo "*)                         DISTRO=gentoo ;;
  *" arch "*|*" manjaro "*|*" endeavouros "*) DISTRO=arch ;;
  *" ubuntu "*)                         DISTRO=ubuntu ;;
  *" debian "*)                         DISTRO=debian ;;
  *" fedora "*|*" rhel "*|*" centos "*) DISTRO=fedora ;;
  *" suse "*|*" opensuse "*)            DISTRO=suse ;;
  *" alpine "*)                         DISTRO=alpine ;;
  *" void "*)                           DISTRO=void ;;
  *)                                    DISTRO=unknown ;;
esac
say "Detected distro: $DISTRO"

# ---- privilege helper -------------------------------------------------------
run_root() {
  if [ "$(id -u)" -eq 0 ]; then "$@"
  elif command -v sudo >/dev/null 2>&1; then sudo "$@"
  elif command -v doas >/dev/null 2>&1; then doas "$@"
  else
    warn "Need root for: $*  (install sudo/doas, or run that command yourself)"
    return 1
  fi
}

have_firefox() {
  command -v firefox >/dev/null 2>&1 || command -v firefox-bin >/dev/null 2>&1 \
    || command -v firefox-esr >/dev/null 2>&1 || command -v librewolf >/dev/null 2>&1
}

install_deps() {
  local need_py=0 need_ff=0
  command -v python3 >/dev/null 2>&1 || need_py=1
  have_firefox || need_ff=1
  if [ "$need_py" -eq 0 ] && [ "$need_ff" -eq 0 ]; then
    say "Python 3 and Firefox are already installed"
    return 0
  fi
  say "Installing missing packages (python: $need_py, firefox: $need_ff)"
  case "$DISTRO" in
    gentoo)
      local pkgs=()
      [ "$need_py" -eq 1 ] && pkgs+=(dev-lang/python)
      [ "$need_ff" -eq 1 ] && pkgs+=(www-client/firefox-bin)
      run_root emerge --ask --noreplace "${pkgs[@]}" ;;
    arch)
      local pkgs=()
      [ "$need_py" -eq 1 ] && pkgs+=(python)
      [ "$need_ff" -eq 1 ] && pkgs+=(firefox)
      run_root pacman -S --needed "${pkgs[@]}" ;;
    debian)
      local pkgs=()
      [ "$need_py" -eq 1 ] && pkgs+=(python3)
      [ "$need_ff" -eq 1 ] && pkgs+=(firefox-esr)
      run_root apt-get install -y "${pkgs[@]}" ;;
    ubuntu)
      [ "$need_py" -eq 1 ] && run_root apt-get install -y python3
      if [ "$need_ff" -eq 1 ]; then
        warn "Ubuntu's Firefox is a snap, which cannot use the profile folders m3tv needs."
        warn "Install Firefox from Mozilla's apt repo instead: https://support.mozilla.org/kb/install-firefox-linux"
      fi ;;
    fedora)
      local pkgs=()
      [ "$need_py" -eq 1 ] && pkgs+=(python3)
      [ "$need_ff" -eq 1 ] && pkgs+=(firefox)
      run_root dnf install -y "${pkgs[@]}" ;;
    suse)
      local pkgs=()
      [ "$need_py" -eq 1 ] && pkgs+=(python3)
      [ "$need_ff" -eq 1 ] && pkgs+=(MozillaFirefox)
      run_root zypper install -y "${pkgs[@]}" ;;
    alpine)
      local pkgs=()
      [ "$need_py" -eq 1 ] && pkgs+=(python3)
      [ "$need_ff" -eq 1 ] && pkgs+=(firefox)
      run_root apk add "${pkgs[@]}"
      warn "Alpine uses musl, and Widevine (Netflix, Disney+...) needs glibc. YouTube and non-DRM sites work fine." ;;
    void)
      local pkgs=()
      [ "$need_py" -eq 1 ] && pkgs+=(python3)
      [ "$need_ff" -eq 1 ] && pkgs+=(firefox)
      run_root xbps-install -S "${pkgs[@]}" ;;
    *)
      warn "Unknown distro. Please install Python 3 and Firefox with your package manager." ;;
  esac
}

if [ "$NO_DEPS" -eq 0 ]; then
  install_deps || warn "Dependency install did not finish. Install Python 3 and Firefox, then re-run with --no-deps."
fi

# ---- install m3tv -----------------------------------------------------------
say "Installing m3tv to $APP_DIR"
# Stop a running launcher so its files can be replaced.
if [ -x "$BIN_DIR/m3tv" ]; then "$BIN_DIR/m3tv" quit >/dev/null 2>&1 || true; fi
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR" "$BIN_DIR" "$DESKTOP_DIR"
cp -r "$SRC_DIR/m3tv/." "$APP_DIR/"
chmod +x "$APP_DIR/m3tv.py"
# Remember where this source folder is, so update.sh can find it later.
printf '%s\n' "$SRC_DIR" > "$DATA_HOME/m3-tvui/source"

cat > "$BIN_DIR/m3tv" <<EOF
#!/bin/sh
exec python3 "$APP_DIR/m3tv.py" "\$@"
EOF
chmod +x "$BIN_DIR/m3tv"

ICON_DIR="$DATA_HOME/icons/hicolor/scalable/apps"
mkdir -p "$ICON_DIR"
cp "$SRC_DIR/m3tv/icon.svg" "$ICON_DIR/m3-tvui.svg"

cat > "$DESKTOP_DIR/m3-tvui.desktop" <<EOF
[Desktop Entry]
Type=Application
Version=1.0
Name=M3 TV
GenericName=TV launcher
Comment=Material You TV launcher for YouTube, Netflix, Disney+ and more
Exec=$BIN_DIR/m3tv
Icon=m3-tvui
Categories=AudioVideo;Video;Player;
Keywords=tv;television;youtube;netflix;disney;streaming;
StartupNotify=false
Terminal=false
Actions=Home;Quit;

[Desktop Action Home]
Name=Go back to the launcher
Exec=$BIN_DIR/m3tv home

[Desktop Action Quit]
Name=Close M3 TV
Exec=$BIN_DIR/m3tv quit
EOF

# Make app menus pick it up right away (all optional).
if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true; fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then gtk-update-icon-cache -q -t "$DATA_HOME/icons/hicolor" 2>/dev/null || true; fi
if command -v kbuildsycoca6 >/dev/null 2>&1; then kbuildsycoca6 >/dev/null 2>&1 || true; fi

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) warn "$BIN_DIR is not in your PATH. Add this to your shell profile:  export PATH=\"\$HOME/.local/bin:\$PATH\"" ;;
esac

say "Installed. Running a quick check:"
python3 "$APP_DIR/m3tv.py" doctor || true

if [ -z "${M3TV_QUIET:-}" ]; then
cat <<'EOF'

Next steps
  1. Start it:            m3tv      (or open "M3 TV" from your app menu)
  2. Press Ctrl+X to come back from an app. Hyprland and sway set this up
     automatically while an app is open. On KDE or GNOME, bind "m3tv home"
     to Ctrl+X yourself (see README.md).
  3. Start it on login, for example in hyprland.conf:   exec-once = m3tv
  4. Close your regular Firefox before opening an app, so m3tv can use your
     Firefox profile (that is what keeps you signed in).
  5. Later:  ./update.sh   ./reinstall.sh   ./uninstall.sh
EOF
fi
