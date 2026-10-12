#!/bin/bash
# Wait for the latest deploy, then run the rows test on the live website and on the desktop app.
cd ~/omarchy-store
sha=$(git rev-parse --short HEAD)
for i in $(seq 60); do
  s=$(gh run list -L 1 --workflow deploy.yml --json status,conclusion,headSha --jq '.[0]|.status+" "+.conclusion+" "+.headSha[0:7]')
  case "$s" in "completed success $sha"*|"completed failure"*) echo "$s"; break;; esac
  sleep 20
done
echo "== website"; timeout 150 node tests/rows_check.mjs https://omarchystore.com / 2>/dev/null
P=$(cat ~/.local/state/omarchy-store/port)
echo "== desktop app"; timeout 150 node tests/rows_check.mjs http://127.0.0.1:$P / 2>/dev/null
