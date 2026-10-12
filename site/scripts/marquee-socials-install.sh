#!/bin/bash
# Marquee Socials Installer
# Installs the social media management app

set -e

APP_DIR="$HOME/.local/share/marquee-socials"
BIN_DIR="$HOME/.local/bin"
APPS_DIR="$HOME/.local/share/applications"
ICONS_DIR="$HOME/.local/share/icons/hicolor"
REPO="https://raw.githubusercontent.com/omarchy-community/marquee-socials/master"

echo "Installing Marquee Socials..."

# Create directories
mkdir -p "$APP_DIR" "$BIN_DIR" "$APPS_DIR"
mkdir -p "$ICONS_DIR/256x256/apps" "$ICONS_DIR/128x128/apps" "$ICONS_DIR/64x64/apps" "$ICONS_DIR/48x48/apps"

# Download app files
curl -fsSL "$REPO/index.html" -o "$APP_DIR/index.html"
curl -fsSL "$REPO/icon-256.png" -o "$APP_DIR/icon-256.png"
curl -fsSL "$REPO/icon-128.png" -o "$APP_DIR/icon-128.png"
curl -fsSL "$REPO/icon-64.png" -o "$APP_DIR/icon-64.png"
curl -fsSL "$REPO/icon-48.png" -o "$APP_DIR/icon-48.png"
curl -fsSL "$REPO/icon-32.png" -o "$APP_DIR/icon-32.png"

# Copy icons to system locations
cp "$APP_DIR/icon-256.png" "$ICONS_DIR/256x256/apps/marquee-socials.png"
cp "$APP_DIR/icon-128.png" "$ICONS_DIR/128x128/apps/marquee-socials.png"
cp "$APP_DIR/icon-64.png" "$ICONS_DIR/64x64/apps/marquee-socials.png"
cp "$APP_DIR/icon-48.png" "$ICONS_DIR/48x48/apps/marquee-socials.png"

# Create launcher script
cat > "$BIN_DIR/marquee-socials" << 'EOF'
#!/bin/bash
APP_DIR="$HOME/.local/share/marquee-socials"
PROFILE_DIR="$HOME/.local/share/marquee-socials/profile"
mkdir -p "$PROFILE_DIR"
exec chromium \
    --app="file://$APP_DIR/index.html" \
    --user-data-dir="$PROFILE_DIR" \
    --class=marquee-socials \
    --window-size=1500,900 \
    --no-first-run \
    --no-default-browser-check \
    "$@"
EOF
chmod +x "$BIN_DIR/marquee-socials"

# Create desktop entry
cat > "$APPS_DIR/marquee-socials.desktop" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Marquee Socials
GenericName=Social Media Manager
Comment=Manage all your social media accounts in one place
Exec=$BIN_DIR/marquee-socials
Icon=marquee-socials
Terminal=false
Categories=Network;Social;
Keywords=social;media;tiktok;youtube;instagram;twitter;discord;telegram;
StartupNotify=true
StartupWMClass=chrome-__home_${USER}_.local_share_marquee-socials_index.html-Default
EOF

# Update icon cache
gtk-update-icon-cache -f "$ICONS_DIR" 2>/dev/null || true
update-desktop-database "$APPS_DIR" 2>/dev/null || true

echo "✓ Marquee Socials installed successfully!"
echo "Launch it from your app menu or run: marquee-socials"
