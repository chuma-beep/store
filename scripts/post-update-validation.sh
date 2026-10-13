#!/bin/bash
# Omarchy Store: post-update check.
# Runs after `omarchy update`. For every Omarchy Development Labs app that is INSTALLED on this
# computer, it checks the app still works and repairs it if the update broke it. Apps that were
# never installed are left alone.
set -uo pipefail

LOG_FILE="$HOME/.local/state/omarchy-store/post-update-validation.log"
mkdir -p "$(dirname "$LOG_FILE")"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"; }
notify() { command -v notify-send >/dev/null 2>&1 && notify-send -u "$1" -i omarchy-store -t 10000 -r omarchy-store-validation "Omarchy Store" "$2" 2>/dev/null || true; }
has_pkg() { pacman -Qq "$1" >/dev/null 2>&1; }

log "=== Post-update check started (omarchy $(omarchy-version 2>/dev/null || echo '?')) ==="
CHECKED=(); BROKEN=(); FIXED=()

# check NAME  IS_INSTALLED_CMD  WORKS_CMD  FIX_CMD
check() {
  local name="$1" present="$2" works="$3" fix="$4"
  if ! eval "$present" >/dev/null 2>&1; then log "- $name: not installed, skipped"; return; fi
  CHECKED+=("$name")
  if eval "$works" >/dev/null 2>&1; then log "✓ $name ok"; return; fi
  log "✗ $name broken, repairing…"; BROKEN+=("$name")
  if eval "$fix" >>"$LOG_FILE" 2>&1 && eval "$works" >/dev/null 2>&1; then log "✓ $name repaired"; FIXED+=("$name"); else log "✗ $name still broken"; fi
}

# SnapDock: package present and the dock can start.
check "SnapDock" \
  "has_pkg snapdock || command -v snapdock" \
  "command -v snapdock && snapdock --version" \
  "omarchy-pkg-add snapdock && snapdock repair 2>/dev/null || true"

# Lifeboat
check "Lifeboat" \
  "has_pkg lifeboat || command -v lifeboat" \
  "command -v lifeboat && lifeboat --version" \
  "omarchy-pkg-add lifeboat"

# Omarchy Browser: package present and the system Electron it runs on is still there.
check "Omarchy Browser" \
  "has_pkg omarchy-browser" \
  "command -v electron43 && [ -f /usr/share/omarchy-browser/app/main.js ] && [ -f /usr/share/applications/omarchy-browser.desktop ]" \
  "sudo -n pacman -S --noconfirm --needed electron43 2>/dev/null; sudo -n pacman -U --noconfirm \"\$(curl -fsSL https://omarchystore.com/catalog.json | python3 -c 'import json,sys;print([a for a in json.load(sys.stdin)[\"apps\"] if a[\"id\"]==\"omarchy-browser\"][0][\"install\"][\"url\"])')\" 2>/dev/null || true"

# Omarchy Store screensaver plugin: present and still enabled.
check "Omarchy Store Screensaver" \
  "[ -d \"\$HOME/.config/omarchy/plugins/omarchy-store-screensaver\" ] || omarchy plugin list 2>/dev/null | grep -q omarchy-store-screensaver" \
  "omarchy plugin list 2>/dev/null | grep -q omarchy-store-screensaver" \
  "omarchy plugin add https://github.com/nemoclawai-tech/omarchy-store-screensaver.git --enable"

# Omarchy Store theme: present and complete (updates sometimes add new theme files).
check "Omarchy Store Theme" \
  "[ -d \"\$HOME/.config/omarchy/themes/store\" ]" \
  "[ -f \"\$HOME/.config/omarchy/themes/store/colors.toml\" ] && [ -f \"\$HOME/.config/omarchy/themes/store/chromium.theme\" ]" \
  "omarchy-theme-install https://github.com/nemoclawai-tech/omarchy-store-theme"

# Omarchy Store itself: helper present and it can start.
check "Omarchy Store" \
  "[ -x \"\$HOME/.local/share/omarchy-store/omarchy-store\" ]" \
  "python3 -c 'import ast,sys; ast.parse(open(sys.argv[1]).read())' \"\$HOME/.local/share/omarchy-store/omarchy-store\" && [ -f \"\$HOME/.local/share/applications/omarchy-store.desktop\" ]" \
  "curl -fsSL https://omarchystore.com/install.sh | bash"

if [ ${#CHECKED[@]} -eq 0 ]; then log "nothing to check"; exit 0; fi
if [ ${#BROKEN[@]} -eq 0 ]; then
  log "=== all ${#CHECKED[@]} apps ok ==="
elif [ ${#FIXED[@]} -eq ${#BROKEN[@]} ]; then
  log "=== repaired: ${FIXED[*]} ==="; notify normal "After the update, repaired: ${FIXED[*]}"
else
  STILL=(); for a in "${BROKEN[@]}"; do [[ " ${FIXED[*]} " == *" $a "* ]] || STILL+=("$a"); done
  log "=== still broken: ${STILL[*]} ==="; notify critical "After the update these need attention: ${STILL[*]}. Open the Omarchy Store to reinstall."
fi
log "=== done ==="
