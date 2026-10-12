#!/bin/bash
# Every artwork file the website lists vs. what the desktop app shows (served through the desktop helper).
P=$(cat ~/.local/state/omarchy-store/port)
curl -s "https://omarchystore.com/catalog.json?x=$RANDOM" -o /tmp/cat-web.json
python3 -c "import json;[print(k) for k in json.load(open('/tmp/cat-web.json')).get('artwork',{})]" > /tmp/art.txt
same=0; diff=0
while read f; do
  w=$(curl -s "https://omarchystore.com/$f?x=$RANDOM" | md5sum | cut -c1-8)
  d=$(curl -s "http://127.0.0.1:$P/$f" | md5sum | cut -c1-8)
  if [ "$w" = "$d" ]; then same=$((same+1)); else diff=$((diff+1)); echo "DIFFERENT $f"; fi
done < /tmp/art.txt
echo "artwork files: $same identical, $diff different (desktop helper on port $P, version $(curl -s http://127.0.0.1:$P/api/status | python3 -c 'import json,sys;print(json.load(sys.stdin).get("version"))'))"
