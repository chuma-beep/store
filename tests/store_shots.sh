#!/bin/bash
# Screenshots of the Omarchy Store for its own store listing (from the local preview on :8794).
O=~/omarchy-store/site/featured/omarchy-store
C="chromium --headless=new --disable-gpu --hide-scrollbars --window-size=1600,1000 --virtual-time-budget=15000"
cd /tmp
$C --screenshot=/tmp/os-discover.png "http://127.0.0.1:8794/" 2>/dev/null
$C --screenshot=/tmp/os-themes.png "http://127.0.0.1:8794/themes/" 2>/dev/null
$C --screenshot=/tmp/os-app.png "http://127.0.0.1:8794/app/snapdock/" 2>/dev/null
$C --screenshot=/tmp/os-screensavers.png "http://127.0.0.1:8794/screensavers/" 2>/dev/null
$C --screenshot=/tmp/os-ignite.png "http://127.0.0.1:8794/ignite/" 2>/dev/null
for n in discover themes app screensavers ignite; do magick /tmp/os-$n.png -quality 86 $O/$n.webp; done
ls -la $O
