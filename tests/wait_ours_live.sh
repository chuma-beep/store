#!/bin/bash
# Wait for deploy of HEAD + the plugins data refresh, then check live data.
cd ~/omarchy-store
sha=$(git rev-parse --short HEAD)
for i in $(seq 80); do
  d=$(gh run list -L 8 --workflow deploy.yml --json headSha,status,conclusion --jq ".[]|select(.headSha|startswith(\"$sha\"))|.status+\":\"+.conclusion" | head -1)
  p=$(gh run list -L 1 --workflow plugins.yml --json status,conclusion --jq '.[0].status+":"+.[0].conclusion')
  [[ $d == completed:* && $p == completed:* ]] && break
  sleep 15
done
echo "deploy=$d plugins=$p"
sleep 20
curl -s "https://raw.githubusercontent.com/omarchy-community/store/data/plugins.json?x=$RANDOM" | python3 -c "import json,sys;d=json.load(sys.stdin);print('data plugins first:',d['plugins'][0]['id'],d['plugins'][0].get('own'))"
curl -s "https://raw.githubusercontent.com/omarchy-community/store/data/screensavers.json?x=$RANDOM" | python3 -c "import json,sys;d=json.load(sys.stdin);print('data savers own:',[p['id'] for p in d['plugins'] if p.get('own')],'mystify repo:',[r['id'] for r in d['repos'] if 'mystify' in r['id'].lower()])"
curl -s "https://omarchystore.com/catalog.json?x=$RANDOM" | python3 -c "import json,sys;c=json.load(sys.stdin);print('live theme #1:',c['themes'][0]['id'])"
curl -s -o /dev/null -w "screensaver icon %{http_code}\n" "https://omarchystore.com/featured/omarchy-store-screensaver/icon.png"
curl -s "https://omarchystore.com/?x=$RANDOM" | grep -o 'dataset.look="glass"' | head -1
