#!/bin/bash
# Omarchy Store: verified installer for apps published as GitHub releases (e.g. SnapDock).
#
#   curl -fsSL https://omarchystore.com/get.sh | bash -s snapdock
#
# What it does, step by step (read it, it's short):
#   1. Looks up the app in the store catalog (omarchystore.com/catalog.json).
#   2. Accepts only a .pkg.tar.zst from an approved publisher's GitHub releases.
#   3. Downloads it and checks its SHA-256 fingerprint against the catalog. Stops if it differs.
#   4. Installs it with pacman (asks for your password). Nothing is launched.
set -euo pipefail

APP="${1:-}"
STORE="${OMARCHY_STORE_URL:-https://omarchystore.com}"
die() { echo "✗ $*" >&2; exit 1; }

[[ $APP =~ ^[a-z0-9][a-z0-9-]{0,40}$ ]] || die "usage: curl -fsSL $STORE/get.sh | bash -s <app-id>"
for c in curl python3 sha256sum pacman; do command -v "$c" >/dev/null || die "$c is required"; done

TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
curl -fsSL --retry 3 -o "$TMP/catalog.json" "$STORE/catalog.json" || die "couldn't reach the store"

read -r NAME VERSION URL SHA < <(python3 - "$TMP/catalog.json" "$APP" <<'PY'
import json, re, sys
cat, aid = sys.argv[1], sys.argv[2]
a = next((x for x in json.load(open(cat))["apps"] if x["id"] == aid), None)
if not a: sys.exit(f"✗ '{aid}' isn't in the Omarchy Store")
i = a["install"]
if i.get("method") != "release":
    cmd = i["command"] if i["method"] == "omarchy" else ("omarchy pkg aur add " if i["method"] == "aur" else "omarchy pkg add ") + " ".join(i["packages"])
    sys.exit(f"✗ {a['name']} doesn't need this script. Install it with:\n    {cmd}")
ok = re.match(r"^https://github\.com/(nemoclawai-tech|omarchy-community)/[A-Za-z0-9_.-]+/releases/download/[A-Za-z0-9_.+-]+/[A-Za-z0-9_.+-]+\.pkg\.tar\.zst$", i.get("url", ""))
if not ok or not re.match(r"^[0-9a-f]{64}$", i.get("sha256", "")):
    sys.exit("✗ catalog entry failed the safety check, refusing to install")
print(a["name"].replace(" ", "_"), i.get("version", "?"), i["url"], i["sha256"])
PY
) || exit 1

echo "→ $NAME $VERSION"
echo "  from $URL"
curl -fL --retry 3 --progress-bar -o "$TMP/pkg.pkg.tar.zst" "$URL" || die "download failed"
echo "$SHA  $TMP/pkg.pkg.tar.zst" | sha256sum -c --quiet - || die "fingerprint mismatch: the download isn't the file the store approved. Not installing."
echo "✓ fingerprint verified"
echo "→ installing (pacman will ask for your password)…"
if [ -r /dev/tty ] && (exec </dev/tty) 2>/dev/null; then
  sudo pacman -U --needed "$TMP/pkg.pkg.tar.zst" </dev/tty
else
  sudo pacman -U --needed --noconfirm "$TMP/pkg.pkg.tar.zst"
fi
echo "✓ $NAME installed. Open it from the app launcher (Super + Space)."
