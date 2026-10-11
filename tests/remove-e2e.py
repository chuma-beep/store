#!/usr/bin/env python3
"""Real end-to-end test of one-click remove in the Omarchy Store desktop helper.
Installs then removes: a small community theme and a verified plugin (no password needed for either).
Also checks the safety rules: built-in theme, theme in use, Omarchy core app, unknown plugin are refused."""
import json, os, re, subprocess, sys, time, urllib.request, urllib.error

port = open(os.path.expanduser("~/.local/state/omarchy-store/port")).read().strip()
BASE = f"http://127.0.0.1:{port}"
html = urllib.request.urlopen(BASE + "/").read().decode()
TOKEN = re.search(r'name="store-token" content="([^"]+)"', html).group(1)
ok = fail = 0


def post(path, body):
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", "X-Store-Token": TOKEN, "Origin": BASE})
    try:
        r = urllib.request.urlopen(req, timeout=30)
        return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def get(path):
    return json.loads(urllib.request.urlopen(BASE + path, timeout=60).read())


def check(name, cond, extra=""):
    global ok, fail
    print(("  ✓ " if cond else "  ✗ ") + name + (f"  ({extra})" if extra else ""))
    ok, fail = ok + bool(cond), fail + (not cond)


def wait(fn, secs):
    t0 = time.time()
    while time.time() - t0 < secs:
        if fn():
            return True
        time.sleep(2)
    return False


cat = json.load(open(os.path.expanduser("~/.local/share/omarchy-store/site/catalog.json")))
st = get("/api/status")
print("== status")
check("status lists removable apps", isinstance(st.get("removable"), list), f"{len(st.get('removable', []))} of {len(st['installed'])} installed")
core = [a for a in cat["apps"] if a["id"] in st["installed"] and a["id"] not in st["removable"]]
check("Omarchy core apps are NOT removable", bool(core), ", ".join(a["id"] for a in core[:5]))

print("== safety refusals")
builtin = next(t for t in cat["themes"] if t.get("builtin"))
c, r = post("/api/theme/remove", {"id": builtin["id"]})
check("built-in theme refused", c == 400, r.get("error", ""))
cur = st.get("theme_current")
curt = next((t for t in cat["themes"] if t.get("install_name") == cur), None)
if curt:
    c, r = post("/api/theme/remove", {"id": curt["id"]})
    check("theme in use refused", c == 400, r.get("error", ""))
if core:
    c, r = post("/api/uninstall", {"id": core[0]["id"]})
    check(f"core app ({core[0]['id']}) refused", c == 400, r.get("error", ""))
c, r = post("/api/plugin/remove", {"id": "omarchy.clock"})
check("first-party plugin refused", c == 400, r.get("error", ""))
c, r = post("/api/plugin/remove", {"id": "not.installed.plugin"})
check("plugin that isn't installed refused", c == 400, r.get("error", ""))
c, r = post("/api/plugin/remove", {"id": "../../etc"})
check("bad plugin id refused", c == 400, r.get("error", ""))

print("== theme: install → remove")
have = set(st["themes_installed"])
cand = next(t for t in cat["themes"] if not t.get("builtin") and t.get("repo") and t["install_name"] not in have
            and t["install_name"] != cur and t.get("stars"))
tdir = os.path.expanduser(f"~/.config/omarchy/themes/{cand['install_name']}")
print(f"  using theme: {cand['name']} ({cand['repo']})")
# install without switching (the store's install also switches; do a plain clone so the desktop isn't changed)
subprocess.run(["git", "clone", "-q", "--depth", "1", f"https://github.com/{cand['repo']}", tdir], check=True, timeout=120)
st = get("/api/status")
check("theme shows as installed", cand["install_name"] in st["themes_installed"])
c, r = post("/api/theme/remove", {"id": cand["id"]})
check("remove accepted", c == 202, r.get("error", ""))
check("theme folder is gone", wait(lambda: not os.path.exists(tdir), 20))
check("status no longer lists it", cand["install_name"] not in get("/api/status")["themes_installed"])

print("== plugin: add → remove")
pl = get("/api/plugins")
check("plugin list served", len(pl["plugins"]) > 5000, f"{len(pl['plugins'])} plugins")
already = set(pl.get("installed", []))
x = next(p for p in pl["plugins"] if p.get("ok") and p.get("i") and p["id"] not in already and p["c"] == "widgets")
print(f"  using plugin: {x['n']} ({x['id']}, {x['r']})")
add = subprocess.run(["omarchy", "plugin", "add", x["r"] + ".git", "--yes"], capture_output=True, text=True, timeout=300)
print("   ", (add.stdout + add.stderr).strip().splitlines()[-1:] or "")
check("plugin installed", wait(lambda: x["id"] in get("/api/plugins/installed")["installed"], 30))
c, r = post("/api/plugin/remove", {"id": x["id"]})
check("remove accepted", c == 202, r.get("error", ""))
check("plugin is gone", wait(lambda: x["id"] not in get("/api/plugins/installed")["installed"], 60))

print(f"\nRESULT: {ok} passed, {fail} failed")
sys.exit(1 if fail else 0)
