#!/bin/bash
# Preview an app page locally using the live catalog + the registry entry (app pages are only generated at deploy).
cd ~/omarchy-store
APP=${1:?app id}
python3 - "$APP" <<'EOF'
import json,sys
app=sys.argv[1]
c=json.load(open('/tmp/live-catalog.json')); r=json.load(open(f'registry/apps/{app}.json'))
s=next(a for a in c['apps'] if a['id']=='snapdock')
a=dict(s); a.update(r); a['stars']=None; a['rank']=None
c['apps']=[x for x in c['apps'] if x['id']!=app]; c['apps'].insert(0,a); json.dump(c,open('site/catalog.json','w'))
EOF
mkdir -p site/app/$APP && cp site/index.html site/app/$APP/index.html
for w in 412 1280; do timeout 60 chromium --headless=new --disable-gpu --hide-scrollbars --window-size=$w,1400 --virtual-time-budget=8000 --screenshot=/tmp/rep-$w.png "http://127.0.0.1:8831/app/$APP/" 2>/dev/null; done
rm -rf site/app/$APP; cp /tmp/cat-bak.json site/catalog.json
magick /tmp/rep-1280.png -resize 50% /tmp/rep-1280s.png; magick /tmp/rep-412.png -resize 55% /tmp/rep-412s.png; echo done
