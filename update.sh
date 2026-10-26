#!/usr/bin/env bash
# Updates M3 TV UI to the newest version from GitHub. Your settings and logins are kept.
#
#   ./update.sh            update if a newer version exists
#   ./update.sh --force    reinstall even if you are already up to date
#   ./update.sh --restart  start the launcher again afterwards (if it was running)
#
# Run it from your clone of the repo, or from anywhere after installing
# (the installer remembers where the source lives; if it is gone, update.sh
# downloads a fresh copy into ~/.local/share/m3-tvui/src).

set -euo pipefail

REPO_URL="${M3TV_REPO_URL:-https://github.com/wealluselinux/M3-TVui-GentooLinux.git}"
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
APP_ROOT="$DATA_HOME/m3-tvui"
BIN="$HOME/.local/bin/m3tv"

FORCE=0
RESTART=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --restart) RESTART=1 ;;
    -h|--help) sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

say()  { printf '\033[1;35m==>\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || die "git is required. Install it with your package manager (Gentoo: emerge dev-vcs/git)."

version_of() { grep -m1 '^VERSION' "$1/m3tv/m3tv.py" 2>/dev/null | cut -d'"' -f2; }

# Find the source checkout.
if [ -d "$SELF_DIR/.git" ]; then
  SRC="$SELF_DIR"
elif [ -r "$APP_ROOT/source" ] && [ -d "$(cat "$APP_ROOT/source")/.git" ]; then
  SRC="$(cat "$APP_ROOT/source")"
else
  SRC="$APP_ROOT/src"
fi

if [ ! -d "$SRC/.git" ]; then
  say "Downloading M3 TV UI to $SRC"
  mkdir -p "$APP_ROOT"
  git clone --quiet --depth 1 "$REPO_URL" "$SRC"
fi

# Remember this checkout, so the next run finds it even if the original folder is gone.
if [ -d "$APP_ROOT/app" ]; then printf '%s\n' "$SRC" > "$APP_ROOT/source"; fi

BRANCH="$(git -C "$SRC" symbolic-ref --short -q HEAD || echo main)"
OLD_REV="$(git -C "$SRC" rev-parse HEAD)"
OLD_VERSION="$(version_of "$SRC")"

say "Checking for updates ($BRANCH)"
git -C "$SRC" fetch --quiet origin "$BRANCH" || die "Could not reach GitHub. Check your internet connection."
NEW_REV="$(git -C "$SRC" rev-parse FETCH_HEAD)"

if [ "$OLD_REV" = "$NEW_REV" ] && [ "$FORCE" -eq 0 ]; then
  say "Already up to date (version ${OLD_VERSION:-unknown})."
  exit 0
fi

if [ "$OLD_REV" != "$NEW_REV" ]; then
  git -C "$SRC" merge --ff-only --quiet FETCH_HEAD 2>/dev/null \
    || die "Could not update $SRC because it has local changes or its history changed.
       Fix it with:  git -C \"$SRC\" stash   (then run update.sh again)"
  echo
  echo "What's new:"
  git -C "$SRC" log --oneline "$OLD_REV..$NEW_REV" 2>/dev/null | head -15 | sed 's/^/  /' || true
  echo
fi

WAS_RUNNING=0
if [ -x "$BIN" ] && "$BIN" doctor 2>/dev/null | grep -q 'running   : yes'; then WAS_RUNNING=1; fi

M3TV_QUIET=1 "$SRC/install.sh" --no-deps

say "Updated ${OLD_VERSION:-?} -> $(version_of "$SRC")"

if [ "$WAS_RUNNING" -eq 1 ] && [ "$RESTART" -eq 1 ]; then
  say "Starting the launcher again"
  nohup "$BIN" >/dev/null 2>&1 &
elif [ "$WAS_RUNNING" -eq 1 ]; then
  echo "    The launcher was closed for the update. Start it again with:  m3tv"
fi
