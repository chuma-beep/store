#!/bin/bash
# After the 1.7.3 push: wait for deploy, update the owner's desktop app to 1.7.3, then compare web vs desktop.
cd ~/omarchy-store
sha=$(git rev-parse --short HEAD)
for i in $(seq 60); do
  s=$(gh run list -L 1 --workflow deploy.yml --json status,conclusion,headSha --jq '.[0]|.status+" "+.conclusion+" "+.headSha[0:7]')
  case "$s" in "completed success $sha"*|"completed failure"*) echo "$s"; break;; esac
  sleep 20
done
curl -s "https://omarchystore.com/catalog.json?x=$RANDOM" | python3 -c "import json,sys;c=json.load(sys.stdin);print('live desktop_version',c['desktop_version'],'| artwork entries',len(c.get('artwork',{})))"
# update the installed desktop app the same way users get it (self-update files from the website)
A=~/.local/share/omarchy-store
for f in omarchy-store site/index.html site/app.js site/styles.css; do curl -sf "https://omarchystore.com/desktop-files/$f?x=$RANDOM" -o "$A/$f.new" && mv "$A/$f.new" "$A/$f"; done
chmod +x $A/omarchy-store
grep -m1 '^VERSION' $A/omarchy-store
~/.local/bin/omarchy-store --update | tail -1
P=$(cat ~/.local/state/omarchy-store/port)
curl -s -X POST -H "Origin: http://127.0.0.1:$P" -H 'Content-Type: application/json' -d '{}' "http://127.0.0.1:$P/api/restart" -o /dev/null -w "restart %{http_code}\n" || true
bash tests/compare_web_desktop.sh
