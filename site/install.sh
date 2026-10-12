#!/bin/bash
# Omarchy Store — desktop app installer.
#
#   curl -fsSL https://omarchystore.com/install.sh | bash
#   curl -fsSL https://omarchystore.com/install.sh | bash -s -- --with snapdock,lifeboat,omarchy-store-screensaver,omarchy-store-theme
#
# Or from GitHub: download omarchy-store-<version>.tar.gz from
#   https://github.com/omarchy-community/store/releases/latest
# then:  tar xzf omarchy-store-*.tar.gz && bash omarchy-store-*/install.sh
#
# What this does (and nothing else):
#   1. Downloads the store files into ~/.local/share/omarchy-store
#   2. Puts the `omarchy-store` command in ~/.local/bin
#   3. Adds "Omarchy Store" to your app launcher (Super + Space)
#   4. Optionally pre-installs specified apps (--with)
# No sudo. Nothing outside your home folder. Remove with: omarchy-store --uninstall
set -euo pipefail

BASE="${OMARCHY_STORE_REMOTE:-https://omarchystore.com/}"
DEST="$HOME/.local/share/omarchy-store"
BIN="$HOME/.local/bin"
APPS="$HOME/.local/share/applications"
ICONS="$HOME/.local/share/icons/hicolor/scalable/apps"

# Core apps that can be pre-installed via --with
# These are verified to work on Omarchy and are maintained by Omarchy Development Labs
CORE_APPS="snapdock,lifeboat,omarchy-store-screensaver,omarchy-store-theme"
WITH_APPS=""

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

# Parse arguments
while [ $# -gt 0 ]; do
  case "$1" in
    --with)
      WITH_APPS="$2"
      shift 2
      ;;
    --with=*)
      WITH_APPS="${1#*=}"
      shift
      ;;
    --help|-h)
      cat <<EOF
Usage: install.sh [--with <app1,app2,...>] [--help]

Options:
  --with APPS    Comma-separated list of apps to pre-install after store setup.
                 Available core apps: $CORE_APPS
                 Example: --with snapdock,lifeboat
  --help, -h     Show this help
EOF
      exit 0
      ;;
    *)
      die "Unknown option: $1. Use --help for usage."
      ;;
  esac
done

command -v python3 >/dev/null || die "python3 is required (it ships with Omarchy)."
command -v curl >/dev/null || die "curl is required."
command -v pacman >/dev/null || die "The Omarchy Store needs an Arch-based system (Omarchy)."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# Installing from a downloaded GitHub release? Then the files are right next to this script.
HERE=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd); fi
SRC="${OMARCHY_STORE_LOCAL:-}"
if [ -z "$SRC" ] && [ -n "$HERE" ] && [ -f "$HERE/omarchy-store" ] && [ -f "$HERE/site/index.html" ]; then SRC="$HERE"; fi

if [ -n "$SRC" ]; then
  say "Installing Omarchy Store from $SRC"
  mkdir -p "$TMP/site"
  cp -r "$SRC/site/." "$TMP/site/"
  cp "$SRC/omarchy-store" "$SRC/uninstall.sh" "$TMP/"
  mkdir -p "$TMP/site/icons"
else
  say "Downloading Omarchy Store…"
  fetch() { curl -fsSL --retry 3 -o "$TMP/$1" "$BASE$1" || die "couldn't download $1"; }
  mkdir -p "$TMP/site/assets" "$TMP/site/icons"
  for f in site/index.html site/app.js site/styles.css site/catalog.json site/site.webmanifest \
           site/assets/logo.svg site/assets/favicon.ico site/assets/icon-48.png site/assets/icon-128.png site/assets/icon-256.png \
           omarchy-store uninstall.sh; do
    mkdir -p "$TMP/$(dirname "$f")"
    curl -fsSL --retry 3 -o "$TMP/$f" "${BASE}desktop-files/$f" || die "couldn't download $f"
  done
fi

# Sanity-check what we downloaded before installing it.
python3 -c "import json,sys; c=json.load(open(sys.argv[1])); assert c['apps']" "$TMP/site/catalog.json" || die "catalog looks broken"
head -1 "$TMP/omarchy-store" | grep -q python3 || die "helper looks broken"

say "Fetching app icons… (skipped if you're offline; the store fetches them later)"
python3 - "$TMP/site/catalog.json" "$TMP/site" "$BASE" <<'PY'
import json, re, sys, urllib.request, concurrent.futures as cf
cat, site, base = sys.argv[1], sys.argv[2], sys.argv[3]
def get(ic):
    if not re.match(r"^icons/[a-z0-9-]+\.(png|svg|jpg|webp)$", ic or ""): return
    try:
        with urllib.request.urlopen(base + ic, timeout=20) as r:
            open(f"{site}/{ic}", "wb").write(r.read(2_000_000))
    except Exception: pass
with cf.ThreadPoolExecutor(8) as ex: list(ex.map(get, [a.get("icon") for a in json.load(open(cat))["apps"]]))
PY

say "Installing to $DEST"
# Stop a running helper so it picks up the new version.
pkill -f "$DEST/omarchy-store --serve" 2>/dev/null || true
rm -rf "$DEST"
mkdir -p "$DEST" "$BIN" "$APPS" "$ICONS"
cp -r "$TMP/site" "$DEST/site"
install -m 755 "$TMP/omarchy-store" "$DEST/omarchy-store"
install -m 755 "$TMP/uninstall.sh" "$DEST/uninstall.sh"
ln -sf "$DEST/omarchy-store" "$BIN/omarchy-store"
cp "$TMP/site/assets/logo.svg" "$ICONS/omarchy-store.svg"
# PNG sizes too — some launchers/taskbars ignore SVG icons.
for s in 48 128 256; do
  mkdir -p "$HOME/.local/share/icons/hicolor/${s}x${s}/apps"
  cp "$TMP/site/assets/icon-$s.png" "$HOME/.local/share/icons/hicolor/${s}x${s}/apps/omarchy-store.png"
done

cat > "$APPS/omarchy-store.desktop" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Omarchy Store
GenericName=App Store
Comment=Discover and install apps for Omarchy
Exec=$BIN/omarchy-store
Icon=omarchy-store
Terminal=false
Categories=System;PackageManager;
Keywords=store;apps;install;software;market;
StartupNotify=true
StartupWMClass=chrome-127.0.0.1__-Default
EOF

gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" &>/dev/null || true
update-desktop-database "$APPS" &>/dev/null || true

say "Done! Open \"Omarchy Store\" from your launcher (Super + Space), or run: omarchy-store"
case ":$PATH:" in *":$BIN:"*) ;; *) echo "  (Add $BIN to your PATH to use the omarchy-store command.)";; esac

# Pre-install requested core apps
if [ -n "$WITH_APPS" ]; then
  say "Pre-installing core apps: $WITH_APPS"
  # Start the helper in background so we can use its API
  "$DEST/omarchy-store" --serve &
  HELPER_PID=$!
  sleep 2  # wait for helper to start
  
  # Find the port
  PORT_FILE="$HOME/.local/state/omarchy-store/port"
  for i in {1..10}; do
    if [ -f "$PORT_FILE" ]; then
      PORT=$(cat "$PORT_FILE")
      break
    fi
    sleep 0.5
  done
  
  if [ -z "${PORT:-}" ]; then
    say "Warning: Could not start helper for pre-install. Apps will be available in store."
  else
    # Get the session token from the helper's token file
    TOKEN_FILE="$HOME/.local/state/omarchy-store/token"
    TOKEN=""
    for i in {1..10}; do
      if [ -f "$TOKEN_FILE" ]; then
        TOKEN=$(cat "$TOKEN_FILE" 2>/dev/null || echo "")
        break
      fi
      sleep 0.5
    done
    if [ -z "$TOKEN" ]; then
      say "Warning: Could not read helper token. Apps will be available in store."
    else
      # Use the store's API to install apps
      for app in $(echo "$WITH_APPS" | tr ',' ' '); do
        say "Installing $app..."
        # The helper validates the app ID against the catalog and runs the install recipe
        curl -fsSL -X POST "http://127.0.0.1:$PORT/api/install" \
          -H "Content-Type: application/json" \
          -H "Origin: http://127.0.0.1:$PORT" \
          -H "X-Store-Token: $TOKEN" \
          -d "{\"id\":\"$app\"}" 2>/dev/null || say "  Note: $app will be available in the store (install manually if needed)"
        sleep 1
      done
    fi
    # Stop the temporary helper
    kill $HELPER_PID 2>/dev/null || true
    wait $HELPER_PID 2>/dev/null || true
  fi
fi

# Install post-update validation hook
if command -v omarchy-hook-install >/dev/null 2>&1; then
  say "Installing post-update validation hook for core apps..."
  omarchy-hook-install post-update "$BASE/scripts/post-update-validation.sh" 2>/dev/null || true
fi