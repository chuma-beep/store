#!/bin/bash
# After the store_app fix: deploy, then check old (1.7.0) and new desktop apps accept the live catalog.
cd ~/omarchy-store
sha=$(git rev-parse --short HEAD)
for i in $(seq 45); do
  s=$(gh run list -L 1 --workflow deploy.yml --json status,conclusion,headSha --jq '.[0]|.status+" "+.conclusion+" "+.headSha[0:7]')
  case "$s" in "completed success $sha"*|"completed failure"*) echo "$s"; break;; esac
  sleep 20
done
curl -s "https://omarchystore.com/catalog.json?x=$RANDOM" -o /tmp/live-cat.json
python3 - <<'PY'
import json, subprocess
c = json.load(open("/tmp/live-cat.json"))
print("store_app:", (c.get("store_app") or {}).get("id"), "| in apps:", any(a["id"] == "omarchy-store" for a in c["apps"]), "| desktop_version", c["desktop_version"])
src = subprocess.run(["git", "show", "28f820e:desktop/omarchy-store"], capture_output=True, text=True, cwd="/home/nemoclawai/omarchy-store").stdout
ns = {"__name__": "x"}; exec(compile(src.split("# ----------------------------------------------------------------- server ----")[0], "old", "exec"), ns)
for a in c["apps"]: ns["recipe"](a)
print("old", ns["VERSION"], "helper accepts live catalog: OK")
PY
~/.local/bin/omarchy-store --update | tail -1
P=$(cat ~/.local/state/omarchy-store/port)
timeout 90 node tests/js_errors.mjs "https://omarchystore.com/charts/?z=$RANDOM" "https://omarchystore.com/app/omarchy-store/?z=$RANDOM" "http://127.0.0.1:$P/app/omarchy-store/"
