#!/usr/bin/env bash
# Removes M3 TV UI and installs it again from this folder. Handy if something is broken.
#
#   ./reinstall.sh            keeps your settings
#   ./reinstall.sh --clean    also resets settings, cached logos and helper profiles
#   ./reinstall.sh --no-deps  do not install Python or Firefox
#   ./reinstall.sh --yes      do not ask for confirmation (with --clean)

set -euo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CLEAN=0
YES=0
INSTALL_ARGS=()
for arg in "$@"; do
  case "$arg" in
    --clean) CLEAN=1 ;;
    --yes|-y) YES=1 ;;
    --no-deps) INSTALL_ARGS+=(--no-deps) ;;
    -h|--help) sed -n '2,8p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

if [ "$CLEAN" -eq 1 ]; then
  "$SELF_DIR/uninstall.sh" --purge $([ "$YES" -eq 1 ] && echo --yes)
else
  "$SELF_DIR/uninstall.sh" --yes
fi

exec "$SELF_DIR/install.sh" ${INSTALL_ARGS[@]+"${INSTALL_ARGS[@]}"}
