#!/bin/bash
# Wait for the latest deploy, then confirm the live Lifeboat screenshots are the clean app-only ones.
cd ~/omarchy-store
sha=$(git rev-parse --short HEAD)
sleep 10
id=$(gh run list -L 6 --workflow deploy.yml --json databaseId,headSha --jq ".[]|select(.headSha|startswith(\"$sha\"))|.databaseId" | head -1)
echo "run=$id"
gh run watch "$id" --exit-status >/dev/null 2>&1
echo "deploy_exit=$?"
for f in backup restore settings terms; do
  live=$(curl -s "https://omarchystore.com/featured/lifeboat/$f.webp?x=$RANDOM" | md5sum | cut -c1-8)
  mine=$(md5sum site/featured/lifeboat/$f.webp | cut -c1-8)
  echo "$f live=$live repo=$mine $([ "$live" = "$mine" ] && echo MATCH || echo DIFFERENT)"
done
curl -s "https://omarchystore.com/?x=$RANDOM" | grep -o 'app.js?v=[a-f0-9]*' | head -1 > /tmp/v.txt
echo "title Join: $(curl -s "https://omarchystore.com/$(cat /tmp/v.txt)" | grep -c 'Join the Omarchy Store community')"
