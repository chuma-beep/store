#!/usr/bin/env python3
"""Preview the Omarchy Store listing changes on a local copy (live catalog + registry edits), screenshot Discover + app page."""
import json, os, subprocess, shutil
ROOT = os.path.expanduser("~/omarchy-store")
PREV = "/tmp/site-prev"
if os.path.isdir(PREV): shutil.rmtree(PREV)
shutil.copytree(f"{ROOT}/site", PREV)
c = json.load(open("/tmp/live-catalog.json"))
reg = json.load(open(f"{ROOT}/registry/apps/omarchy-store.json"))
sa = c.get("store_app") or {}
sa["featured"] = reg["featured"]; c["store_app"] = sa
ess = c["featured"]["collections"][0]["apps"]
c["featured"]["collections"][0]["apps"] = ["omarchy-store"] + [x for x in ess if x != "omarchy-store"]
json.dump(c, open(f"{PREV}/catalog.json", "w"))
print("store_app:", sa.get("name"), "| featured:", bool(sa.get("featured")))
# the app page is a client-side route: serve index.html for it
os.makedirs(f"{PREV}/app/omarchy-store", exist_ok=True)
shutil.copy(f"{PREV}/index.html", f"{PREV}/app/omarchy-store/index.html")
def shot(path, out, h):
    subprocess.run(["chromium", "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size=1300,{h}", "--virtual-time-budget=15000",
                    f"--screenshot={out}", f"http://127.0.0.1:8832{path}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=120)
    subprocess.run(["magick", out, "-resize", "45%", out.replace(".png", "-s.png")])
shot("/", "/tmp/prev-home.png", 1800)
shot("/app/omarchy-store/", "/tmp/prev-app.png", 2600)
print("shots done")
