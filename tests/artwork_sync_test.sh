#!/bin/bash
# Sandbox test for desktop 1.7.3 artwork sync. Nothing here touches the real install.
set -e
R=~/omarchy-store
rm -rf /tmp/sbx /tmp/remote && mkdir -p /tmp/sbx/site/featured /tmp/remote
# fake "website": current site files + a catalog that carries the artwork fingerprints
cp -r $R/site/featured /tmp/remote/featured
cp $R/site/app.js $R/site/index.html $R/site/styles.css /tmp/remote/
python3 - <<'PY'
import json, sys
sys.path.insert(0, "/home/nemoclawai/omarchy-store/scripts")
import build
c = json.load(open("/home/nemoclawai/omarchy-store/site/catalog.json"))
c["artwork"] = build.artwork_hashes()
json.dump(c, open("/tmp/remote/catalog.json", "w"))
print("artwork entries:", len(c["artwork"]))
PY
# fake "desktop install": the helper + OLD saved icons (the ones the owner's desktop has now)
cp $R/desktop/omarchy-store /tmp/sbx/omarchy-store
cp -r ~/.local/share/omarchy-store/site/featured/. /tmp/sbx/site/featured/
echo "before: lifeboat $(md5sum /tmp/sbx/site/featured/lifeboat/icon.png | cut -c1-8)  snapdock $(md5sum /tmp/sbx/site/featured/snapdock/icon.png | cut -c1-8)"
(cd /tmp/remote && python3 -m http.server 8797 --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > /tmp/remote.pid)
sleep 1
OMARCHY_STORE_HOME=/tmp/sbx OMARCHY_STORE_REMOTE=http://127.0.0.1:8797/ python3 /tmp/sbx/omarchy-store --update
kill $(cat /tmp/remote.pid)
echo "after:  lifeboat $(md5sum /tmp/sbx/site/featured/lifeboat/icon.png | cut -c1-8)  snapdock $(md5sum /tmp/sbx/site/featured/snapdock/icon.png | cut -c1-8)"
echo "website: lifeboat $(md5sum $R/site/featured/lifeboat/icon.png | cut -c1-8)  snapdock $(md5sum $R/site/featured/snapdock/icon.png | cut -c1-8)"
echo "--- every saved file vs website"
bad=0; for f in $(cd /tmp/sbx/site && find featured -type f -name '*.*'); do
  [ -f "$R/site/$f" ] || continue
  cmp -s "/tmp/sbx/site/$f" "$R/site/$f" || { echo "DIFFERENT $f"; bad=1; }
done; [ $bad = 0 ] && echo "ALL SAVED ARTWORK MATCHES THE WEBSITE"
