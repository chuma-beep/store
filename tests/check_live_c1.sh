#!/bin/bash
# Wait until the latest deploy succeeds, then confirm the community title and the new Lifeboat art are live.
cd ~/omarchy-store
for i in $(seq 45); do
  s=$(gh run list -L 1 --workflow deploy.yml --json status,conclusion,headSha --jq '.[0]|.status+" "+.conclusion+" "+.headSha[0:7]')
  case "$s" in "completed success"*) echo "$s"; break;; esac
  sleep 20
done
git pull -q --rebase --autostash
v=$(curl -s "https://omarchystore.com/?x=$RANDOM" | grep -o 'app.js?v=[a-f0-9]*' | head -1)
js=$(curl -s "https://omarchystore.com/$v")
echo "Join title: $(grep -c 'Join the Omarchy Store community' <<<"$js")  Follow title: $(grep -c 'Follow the Omarchy Store' <<<"$js")"
for f in icon.png billboard.webp hero.webp og.png; do
  live=$(curl -s "https://omarchystore.com/featured/lifeboat/$f?x=$RANDOM" | md5sum | cut -c1-8)
  mine=$(md5sum site/featured/lifeboat/$f | cut -c1-8)
  echo "$f $([ "$live" = "$mine" ] && echo MATCH || echo DIFFERENT)"
done
