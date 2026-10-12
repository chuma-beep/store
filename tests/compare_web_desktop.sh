#!/bin/bash
# Compare what the WEBSITE and the DESKTOP APP actually show for every app we made: catalog icon path + the image bytes.
P=$(cat ~/.local/state/omarchy-store/port)
D="http://127.0.0.1:$P"; W="https://omarchystore.com"
curl -s "$W/catalog.json?x=$RANDOM" -o /tmp/cat-web.json
curl -s "$D/catalog.json?x=$RANDOM" -o /tmp/cat-desk.json
python3 - <<'PY'
import json
w = json.load(open("/tmp/cat-web.json")); d = json.load(open("/tmp/cat-desk.json"))
def apps(c):
    out = {a["id"]: a for a in c["apps"]}
    if c.get("store_app"): out[c["store_app"]["id"]] = c["store_app"]
    return out
W, D = apps(w), apps(d)
ours = [i for i, a in W.items() if (a.get("developer") or "") in ("Omarchy Store",) or str(a.get("icon", "")).startswith("featured/")]
print("web generated:", w.get("generated_at"), "| desktop generated:", d.get("generated_at"))
with open("/tmp/ours.txt", "w") as f:
    for i in sorted(ours):
        wi, di = W.get(i, {}).get("icon"), D.get(i, {}).get("icon")
        print(f"{i:16} web icon={wi} | desktop icon={di}")
        f.write(f"{i} {wi} {di}\n")
PY
echo "--- image bytes (md5) web vs desktop"
while read id wi di; do
  wm=$(curl -s "$W/$wi?x=$RANDOM" | md5sum | cut -c1-8)
  dm=$(curl -s "$D/$di?x=$RANDOM" | md5sum | cut -c1-8)
  echo "$id web=$wm desktop=$dm $([ "$wm" = "$dm" ] && echo SAME || echo DIFFERENT)"
done < /tmp/ours.txt
echo "--- ignite (not an app entry): page icon"
for f in featured/ignite/icon-256.png featured/ignite/icon.png; do
  echo "$f web=$(curl -s "$W/$f?x=$RANDOM" | md5sum | cut -c1-8) desktop=$(curl -s "$D/$f?x=$RANDOM" | md5sum | cut -c1-8)"
done
