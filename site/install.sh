#!/bin/bash
# Omarchy Store — desktop app installer.
#
#   curl -fsSL https://omarchystore.com/install.sh | bash
#
# What this does (and nothing else):
#   1. Downloads the store files into ~/.local/share/omarchy-store
#   2. Puts the `omarchy-store` command in ~/.local/bin
#   3. Adds "Omarchy Store" to your app launcher (Super + Space)
# No sudo. Nothing outside your home folder. Remove with: omarchy-store --uninstall
set -euo pipefail

BASE="${OMARCHY_STORE_REMOTE:-https://omarchystore.com/}"
DEST="$HOME/.local/share/omarchy-store"
BIN="$HOME/.local/bin"
APPS="$HOME/.local/share/applications"
ICONS="$HOME/.local/share/icons/hicolor/scalable/apps"

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mError:\033[0m %s\n' "$*" >&2; exit 1; }

command -v python3 >/dev/null || die "python3 is required (it ships with Omarchy)."
command -v curl >/dev/null || die "curl is required."
command -v pacman >/dev/null || die "The Omarchy Store needs an Arch-based system (Omarchy)."

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

say "Downloading Omarchy Store…"
fetch() { curl -fsSL --retry 3 -o "$TMP/$1" "$BASE$1" || die "couldn't download $1"; }
mkdir -p "$TMP/site/assets" "$TMP/site/icons"
for f in site/index.html site/app.js site/styles.css site/catalog.json site/site.webmanifest \
         site/assets/logo.svg site/assets/favicon.ico site/assets/icon-48.png site/assets/icon-128.png site/assets/icon-256.png \
         omarchy-store uninstall.sh; do
  mkdir -p "$TMP/$(dirname "$f")"
  curl -fsSL --retry 3 -o "$TMP/$f" "${BASE}desktop-files/$f" || die "couldn't download $f"
done

# Sanity-check what we downloaded before installing it.
python3 -c "import json,sys; c=json.load(open(sys.argv[1])); assert c['apps']" "$TMP/site/catalog.json" || die "catalog looks broken"
head -1 "$TMP/omarchy-store" | grep -q python3 || die "helper looks broken"

say "Fetching app icons…"
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
