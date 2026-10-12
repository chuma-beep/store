#!/bin/bash
# Wait for the deploy of the given commit, then check the live site.
cd ~/omarchy-store
sha="$1"
sleep 10
id=$(gh run list -L 6 --workflow deploy.yml --json databaseId,headSha --jq ".[]|select(.headSha|startswith(\"$sha\"))|.databaseId" | head -1)
echo "run=$id"
gh run watch "$id" --exit-status >/dev/null 2>&1
echo "deploy_exit=$?"
curl -s "https://omarchystore.com/catalog.json?x=$RANDOM" -o /tmp/lc.json
python3 -c "
import json;c=json.load(open('/tmp/lc.json'))
print('featured:',[(a['name'],a['featured'].get('order')) for a in c['apps'] if a.get('featured')])
print('omarchy-backup still listed:', any(a['id']=='omarchy-backup' for a in c['apps']))"
for u in app/lifeboat/ featured/lifeboat/icon.png featured/lifeboat/billboard.webp; do
  curl -s -o /dev/null -w "$u %{http_code}\n" "https://omarchystore.com/$u"
done
curl -s "https://omarchystore.com/?x=$RANDOM" | grep -c 'data-look="glass"'
