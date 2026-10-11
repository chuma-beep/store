#!/bin/bash
# Test the 1.7.1 desktop app on this computer before publishing: catalog with the new listing, restart the helper, check.
A=~/.local/share/omarchy-store
cp /tmp/catalog-preview.json $A/site/catalog.json
P=$(cat ~/.local/state/omarchy-store/port)
curl -s -X POST -H "Origin: http://127.0.0.1:$P" -H "Content-Type: application/json" -d '{}' "http://127.0.0.1:$P/api/restart" -o /dev/null -w "restart %{http_code}\n"
sleep 4
P=$(cat ~/.local/state/omarchy-store/port)
curl -s "http://127.0.0.1:$P/api/status" | python3 -c "
import json,sys; s=json.load(sys.stdin)
print('version', s.get('version'))
print('store listing installed:', 'omarchy-store' in s.get('installed', []))
print('store listing removable:', 'omarchy-store' in s.get('removable', []))
print('installed count', len(s.get('installed', [])))"
curl -s -X POST -H "Origin: http://127.0.0.1:$P" -H "Content-Type: application/json" -d '{"id":"omarchy-store"}' "http://127.0.0.1:$P/api/install"; echo
cd ~/omarchy-store && timeout 60 node tests/js_errors.mjs "http://127.0.0.1:$P/charts/" "http://127.0.0.1:$P/app/omarchy-store/"
