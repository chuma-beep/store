#!/bin/bash
# post-update validation hook for Omarchy Store core apps
# Runs after `omarchy update` to ensure SnapDock, Lifeboat, Omarchy Store Screensaver,
# and Omarchy Store Theme still work correctly.

set -euo pipefail

HOOK_NAME="omarchy-store-core-apps-validation"
LOG_FILE="$HOME/.local/state/omarchy-store/post-update-validation.log"
NOTIFY_ID="omarchy-store-validation"

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

notify() {
  local urgency="$1"
  local title="$2"
  local message="$3"
  if command -v notify-send >/dev/null 2>&1; then
    notify-send -u "$urgency" -i "omarchy-store" -t 10000 -r "$NOTIFY_ID" "$title" "$message" 2>/dev/null || true
  fi
}

log "=== Post-update validation started ==="

# Track validation results
BROKEN_APPS=()
FIXED_APPS=()

# Function to check if a command/package works
check_app() {
  local app_id="$1"
  local check_cmd="$2"
  local fix_cmd="${3:-}"
  
  log "Checking $app_id..."
  if eval "$check_cmd" >/dev/null 2>&1; then
    log "  ✓ $app_id is working"
    return 0
  else
    log "  ✗ $app_id is BROKEN"
    BROKEN_APPS+=("$app_id")
    if [ -n "$fix_cmd" ]; then
      log "  Attempting to fix $app_id..."
      if eval "$fix_cmd" >/dev/null 2>&1; then
        log "  ✓ Fixed $app_id"
        FIXED_APPS+=("$app_id")
      else
        log "  ✗ Failed to fix $app_id"
      fi
    fi
    return 1
  fi
}

# Check SnapDock (v2.0.0+)
check_app "SnapDock" \
  "command -v snapdock >/dev/null && snapdock --version 2>/dev/null | grep -q '2'" \
  "omarchy-pkg-add snapdock 2>/dev/null || true"

# Check Lifeboat
check_app "Lifeboat" \
  "command -v lifeboat >/dev/null && lifeboat --version 2>/dev/null | grep -q '1'" \
  "omarchy-pkg-add lifeboat 2>/dev/null || true"

# Check Omarchy Store Screensaver (plugin)
check_app "Omarchy Store Screensaver" \
  "omarchy plugin list --json 2>/dev/null | grep -q 'omarchy-store-screensaver'" \
  "omarchy plugin add https://github.com/nemoclawai-tech/omarchy-store-screensaver.git --enable 2>/dev/null || true"

# Check Omarchy Store Theme
check_app "Omarchy Store Theme" \
  "ls -d ~/.config/omarchy/themes/store 2>/dev/null || ls -d /usr/share/omarchy/themes/store 2>/dev/null" \
  "omarchy-theme-install https://github.com/nemoclawai-tech/omarchy-store-theme 2>/dev/null || true"

# Check Omarchy Store itself
check_app "Omarchy Store" \
  "command -v omarchy-store >/dev/null && omarchy-store --version 2>/dev/null | grep -q '1'" \
  "curl -fsSL https://omarchystore.com/install.sh | bash 2>/dev/null || true"

# Summary
if [ ${#BROKEN_APPS[@]} -eq 0 ]; then
  log "=== All core apps validated successfully ==="
  notify "normal" "Omarchy Store" "All core apps validated after system update ✓"
elif [ ${#FIXED_APPS[@]} -eq ${#BROKEN_APPS[@]} ]; then
  log "=== All broken apps were fixed ==="
  notify "normal" "Omarchy Store" "Fixed broken core apps after update: ${FIXED_APPS[*]}"
else
  STILL_BROKEN=()
  for app in "${BROKEN_APPS[@]}"; do
    if [[ ! " ${FIXED_APPS[*]} " =~ " ${app} " ]]; then
      STILL_BROKEN+=("$app")
    fi
  done
  log "=== VALIDATION FAILED: ${STILL_BROKEN[*]} still broken ==="
  notify "critical" "Omarchy Store" "Some core apps broken after update: ${STILL_BROKEN[*]}. Open the store to reinstall."
fi

log "=== Post-update validation complete ==="