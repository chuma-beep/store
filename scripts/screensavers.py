#!/usr/bin/env python3
"""Collect Omarchy screensavers for the store's Screensavers category.

Two sources, both kept live (run by deploy.yml and every 30 min by plugins.yml):
  1. Omarchy Plugin Marketplace plugins that are screensavers or screensaver controls.
     These install in one click (same flow as the Plugins section). Read from plugins.json.
  2. Other public GitHub repos made for the Omarchy screensaver (found via GitHub search).
     We only LIST these (link to GitHub); we never host or run anyone's code.

Usage: screensavers.py [plugins.json] [out.json]
Writes a compact JSON. Never breaks the build: on failure it keeps the previous file.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGINS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "site", "plugins.json")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "site", "screensavers.json")
CURATION = os.path.join(ROOT, "registry", "screensavers-curation.json")
UA = "omarchy-store-build (+https://github.com/omarchy-community/store)"
TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")

QUERIES = ["omarchy screensaver", "omarchy screensavers", "omarchy screen saver",
           "omarchy-screensaver in:name", "screensaver omarchy in:description,topics"]
SAVER_RE = re.compile(r"screen ?-?savers?|salvapantallas|idle (overlay|screen)|attract mode", re.I)
# Things that control the screensaver (timing, stay-awake, pick an effect, change the text) rather than BEING one.
TOOL_RE = re.compile(r"\b(idle|time ?outs?|timings?|stay[- ]awake|power|suspend|sleep|widget|panel|menu|editor|"
                     r"studio|jiggler|inhibit|changes?|pick|random|config|controls?|settings|lock)\b", re.I)
# ...but these words mean it's an actual screensaver even if it also has controls.
ART_RE = re.compile(r"\b(effects?|animat\w*|ascii|matrix|shader|glsl|scenes?|fish|toasters?|rain|starfield|"
                    r"aquarium|landscape|art|visuali[sz]\w*|particles?|braille|poems?|quotes?|clock|chess|koi|"
                    r"pixel|sigils?|cosmos|solar|black hole|commits?|music|pack)\b", re.I)
# Not for Omarchy itself (ports to other systems), or a whole theme (those live in Themes).
OTHER_OS_RE = re.compile(r"\b(macos|mac os|windows|kde|gnome|fedora|nixos|cosmic|plasma)\b", re.I)
REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
IMG_RE = re.compile(r"""(?:!\[[^\]]*\]\(\s*<?([^)\s>]+)|<img[^>]+src=["']([^"']+))""", re.I)


def get(url, accept="application/vnd.github+json", raw=False):
    h = {"User-Agent": UA, "Accept": accept}
    if TOKEN:
        h["Authorization"] = "Bearer " + TOKEN
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=40) as r:
        b = r.read()
    return b.decode("utf-8", "replace") if raw else json.loads(b)


def clean(s, n):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def kind(text):
    """'saver' = a screensaver to look at; 'tool' = controls/timing/editors for the screensaver."""
    if ART_RE.search(text):
        return "saver"
    return "tool" if TOOL_RE.search(text) else "saver"


def from_plugins():
    d = json.load(open(PLUGINS))
    out = []
    for p in d.get("plugins", []):
        text = " ".join([p.get("id", ""), p.get("n", ""), p.get("d", ""), " ".join(p.get("t") or [])])
        if SAVER_RE.search(text):
            out.append({"id": p["id"], "k": kind(p.get("n", "") + " " + p.get("d", "")), "r": p.get("r", "")})
    return out


def readme_image(full, branch):
    """First real picture in the README (screenshot/GIF), as an absolute https URL, or ''."""
    try:
        md = get(f"https://api.github.com/repos/{full}/readme", "application/vnd.github.raw", raw=True)
    except Exception:
        return ""
    for m in IMG_RE.finditer(md[:60000]):
        u = (m.group(1) or m.group(2) or "").strip()
        low = u.lower().split("?")[0]
        if not re.search(r"\.(png|jpe?g|gif|webp)$", low) or "shields.io" in low or "badge" in low:
            continue
        if u.startswith("http://"):
            continue
        if not u.startswith("https://"):
            u = f"https://raw.githubusercontent.com/{full}/{branch}/" + urllib.parse.quote(u.lstrip("./").lstrip("/"))
        u = u.replace("https://github.com/", "https://raw.githubusercontent.com/", 1).replace("/blob/", "/", 1) \
            if u.startswith("https://github.com/") and "/blob/" in u else u
        if u.startswith("https://github.com/user-attachments/") or u.startswith("https://raw.githubusercontent.com/") \
                or u.startswith("https://user-images.githubusercontent.com/"):
            return u
    return ""


def from_github(plugin_repos):
    found = {}
    for q in QUERIES:
        for page in (1, 2, 3):
            u = "https://api.github.com/search/repositories?" + urllib.parse.urlencode(
                {"q": q + " fork:false archived:false", "per_page": 100, "page": page})
            d = get(u)
            for r in d.get("items", []):
                found[r["full_name"].lower()] = r
            if len(d.get("items", [])) < 100:
                break
            time.sleep(1)
        time.sleep(2)  # search API: 30 requests/min
    out = []
    for key, r in found.items():
        name, desc = r["name"], r.get("description") or ""
        text = f"{name} {desc} {' '.join(r.get('topics') or [])}"
        if key in plugin_repos or not REPO_RE.match(r["full_name"]):
            continue
        if not desc.strip() or not SAVER_RE.search(text) or "omarch" not in text.lower():
            continue  # needs a description, and must be about the Omarchy screensaver
        if OTHER_OS_RE.search(text) or re.search(r"theme", name, re.I):
            continue
        out.append({
            "id": r["full_name"],
            "n": clean(name.replace("-", " ").replace("_", " ").strip(), 60),
            "d": clean(desc, 240),
            "a": r["owner"]["login"],
            "av": r["owner"]["avatar_url"].split("?")[0] + "?s=96",
            "s": r.get("stargazers_count") or 0,
            "u": (r.get("pushed_at") or "")[:10],
            "l": ((r.get("license") or {}).get("spdx_id") or "").replace("NOASSERTION", ""),
            "k": kind(name + " " + desc),
            "_b": r.get("default_branch") or "main",
        })
    for x in out:
        x["img"] = readme_image(x["id"], x.pop("_b"))
    out.sort(key=lambda x: (-x["s"], 0 if x["img"] else 1, x["id"].lower()))
    return out


def curate(items, cur):
    ex = {x.lower() for x in cur.get("exclude", [])}
    fix = {x.lower(): k for k in ("saver", "tool") for x in cur.get(k, [])}
    out = []
    for x in items:
        key = x["id"].lower()
        if key in ex:
            continue
        x["k"] = fix.get(key, x["k"])
        out.append(x)
    return out


def main():
    try:
        cur = json.load(open(CURATION)) if os.path.exists(CURATION) else {}
        plugs = from_plugins()
        prepos = {p.pop("r").lower().removeprefix("https://github.com/") for p in plugs if p.get("r")}
        plugs, repos = curate(plugs, cur), curate(from_github(prepos), cur)
        assert len(plugs) + len(repos) > 20, "suspiciously few screensavers"
        res = {"count": len(plugs) + len(repos), "plugins": plugs, "repos": repos}
    except Exception as ex:
        print(f"  warn: screensavers skipped: {ex}", file=sys.stderr)
        if os.path.exists(OUT):
            return
        res = {"count": 0, "plugins": [], "repos": []}
    for p in res["plugins"]:
        p.pop("r", None)
    with open(OUT, "w") as f:
        json.dump(res, f, separators=(",", ":"), ensure_ascii=False)
    print(f"✓ screensavers: {len(res['plugins'])} one-click plugins + {len(res['repos'])} GitHub projects → {OUT}")


if __name__ == "__main__":
    main()
