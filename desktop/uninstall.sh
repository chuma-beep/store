#!/bin/bash
# Removes the Omarchy Store desktop app. Apps you installed through the store stay installed.
set -u
DEST="$HOME/.local/share/omarchy-store"
pkill -f "$DEST/omarchy-store --serve" 2>/dev/null || true
rm -f "$HOME/.local/bin/omarchy-store" \
      "$HOME/.local/share/applications/omarchy-store.desktop" \
      "$HOME/.local/share/icons/hicolor/scalable/apps/omarchy-store.svg"
rm -rf "$HOME/.local/state/omarchy-store"
rm -rf "$DEST"
update-desktop-database "$HOME/.local/share/applications" &>/dev/null || true
echo "Omarchy Store removed. Apps you installed with it are still installed."
