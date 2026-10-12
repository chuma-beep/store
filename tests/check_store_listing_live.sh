#!/bin/bash
# After pushing: wait for a successful deploy, then check Omarchy Store is #1 on the live site.
cd ~/omarchy-store
for i in $(seq 45); do
  s=$(gh run list -L 1 --workflow deploy.yml --json status,conclusion,headSha --jq '.[0]|.status+" "+.conclusion+" "+.headSha[0:7]')
  case "$s" in "completed success"*) echo "$s"; break;; "completed failure"*) echo "$s"; break;; esac
  sleep 20
done
curl -s "https://omarchystore.com/catalog.json?x=$RANDOM" | python3 -c "
import json,sys; c=json.load(sys.stdin)
print('desktop_version', c['desktop_version'])
print('top 3:', [a['id'] for a in c['apps'][:3]])"
curl -s -o /dev/null -w "listing page %{http_code}\n" "https://omarchystore.com/app/omarchy-store/"
for f in icon.png discover.webp themes.webp app.webp screensavers.webp ignite.webp; do
  curl -s -o /dev/null -w "$f %{http_code}\n" "https://omarchystore.com/featured/omarchy-store/$f"
done
curl -s "https://omarchystore.com/desktop-files/omarchy-store?x=$RANDOM" | grep -m1 '^VERSION'
timeout 60 node tests/js_errors.mjs "https://omarchystore.com/charts/?z=$RANDOM" "https://omarchystore.com/app/omarchy-store/?z=$RANDOM"
