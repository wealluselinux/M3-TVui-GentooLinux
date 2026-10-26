#!/usr/bin/env bash
# Removes M3 TV UI from your user account.
#
#   ./uninstall.sh            remove the program, menu entry and icon (keeps settings)
#   ./uninstall.sh --purge    also delete settings, cached logos and m3tv's helper profiles
#   ./uninstall.sh --yes      do not ask for confirmation
#
# Your regular Firefox profile is never touched.

set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
APP_ROOT="$DATA_HOME/m3-tvui"
BIN="$HOME/.local/bin/m3tv"

PURGE=0
YES=0
for arg in "$@"; do
  case "$arg" in
    --purge) PURGE=1 ;;
    --yes|-y) YES=1 ;;
    -h|--help) sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

say()  { printf '\033[1;35m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }

if [ "$PURGE" -eq 1 ] && [ "$YES" -eq 0 ]; then
  if [ -t 0 ]; then
    printf 'This also deletes your M3 TV settings, cached logos and helper profiles.\nType "yes" to continue: '
    read -r answer
    [ "$answer" = "yes" ] || { echo "Cancelled."; exit 1; }
  else
    warn "--purge needs confirmation. Re-run with --yes to skip the question."
    exit 1
  fi
fi

# Stop a running launcher first.
if [ -x "$BIN" ]; then "$BIN" quit >/dev/null 2>&1 || true; fi

say "Removing M3 TV UI"
rm -rf "${APP_ROOT:?}/app" "${APP_ROOT:?}/source"
# update.sh keeps its own copy of the source here. Do not delete it if this script is running from it.
case "$SELF_DIR/" in
  "$APP_ROOT/src/"*) ;;
  *) rm -rf "${APP_ROOT:?}/src" ;;
esac
rm -f "$BIN" \
      "$DATA_HOME/applications/m3-tvui.desktop" \
      "$DATA_HOME/icons/hicolor/scalable/apps/m3-tvui.svg"

if command -v update-desktop-database >/dev/null 2>&1; then update-desktop-database "$DATA_HOME/applications" 2>/dev/null || true; fi
if command -v gtk-update-icon-cache >/dev/null 2>&1 && [ -d "$DATA_HOME/icons/hicolor" ]; then gtk-update-icon-cache -q -t "$DATA_HOME/icons/hicolor" 2>/dev/null || true; fi

if [ "$PURGE" -eq 1 ]; then
  case "$SELF_DIR/" in
    "$APP_ROOT/"*) warn "Keeping $APP_ROOT because this script is running from inside it." ;;
    *) rm -rf "${APP_ROOT:?}" ;;
  esac
  rm -rf "${CONFIG_HOME:?}/m3-tvui"
  say "Done. Everything was removed, including your settings."
else
  say "Done. Kept your settings ($CONFIG_HOME/m3-tvui) and helper profiles ($APP_ROOT/profiles)."
  echo "    Use ./uninstall.sh --purge to remove those too."
fi
