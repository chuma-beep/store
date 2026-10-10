#!/usr/bin/env python3
"""Build site/catalog.json from registry/ + live data (GitHub, Flathub, Arch, AUR).

Usage:
  python3 scripts/build.py            # validate + fetch live data + write catalog
  python3 scripts/build.py --check    # validate registry only (no network) — used on PRs

Stdlib only. Set GITHUB_TOKEN to avoid GitHub's 60 req/hour anonymous limit.
"""
import json, os, re, sys, time, urllib.error, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REG = os.path.join(ROOT, "registry")
OUT = os.path.join(ROOT, "site", "catalog.json")

ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,40}$")
PKG_RE = re.compile(r"^[a-z0-9@._+-]+$")
# omarchy commands we allow in the registry: "omarchy install ..." only, plain words/quotes.
OMARCHY_RE = re.compile(r"^omarchy install [a-z0-9 '._-]+$", re.I)
KINDS = {"gui", "terminal"}
METHODS = {"pacman", "aur", "omarchy"}


def load(path):
    with open(path) as f:
        return json.load(f)


def validate():
    errors = []
    cats = {c["id"] for c in load(os.path.join(REG, "categories.json"))}
    apps = {}
    adir = os.path.join(REG, "apps")
    for fn in sorted(os.listdir(adir)):
        if not fn.endswith(".json"):
            continue
        p = os.path.join(adir, fn)
        try:
            a = load(p)
        except Exception as e:
            errors.append(f"{fn}: invalid JSON ({e})"); continue
        e = lambda m: errors.append(f"{fn}: {m}")
        if a.get("id") != fn[:-5]: e("id must match filename")
        if not ID_RE.match(a.get("id", "")): e("id must be lowercase letters/digits/dashes")
        if not a.get("name"): e("name required")
        if a.get("category") not in cats: e(f"unknown category {a.get('category')!r}")
        if a.get("kind") not in KINDS: e(f"kind must be one of {sorted(KINDS)}")
        inst = a.get("install") or {}
        m = inst.get("method")
        if m not in METHODS: e(f"install.method must be one of {sorted(METHODS)}")
        if m in ("pacman", "aur"):
            pk = inst.get("packages") or []
            if not pk or not all(PKG_RE.match(x) for x in pk): e("install.packages must be valid package names")
        if m == "omarchy" and not OMARCHY_RE.match(inst.get("command", "")):
            e("install.command must be an 'omarchy install ...' command")
        det = a.get("detect") or []
        if not det or not all(PKG_RE.match(x) for x in det): e("detect must list package names")
        if a.get("open") and not PKG_RE.match(a["open"]): e("open must be a plain command name")
        if not (a.get("github") or a.get("flathub") or a.get("homepage")): e("need github, flathub or homepage")
        if a.get("github") and not re.match(r"^[\w.-]+/[\w.-]+$", a["github"]): e("github must be owner/repo")
        for u in [a.get("icon"), a.get("homepage")]:
            if u and not u.startswith("https://"): e("urls must be https")
        apps[a.get("id")] = a
    feat = load(os.path.join(REG, "featured.json"))
    for h in feat["hero"]:
        if h["app"] not in apps: errors.append(f"featured.json: hero app {h['app']!r} not in registry")
    for c in feat["collections"]:
        for x in c["apps"]:
            if x not in apps: errors.append(f"featured.json: collection {c['title']!r} references unknown app {x!r}")
    ads = load(os.path.join(REG, "ads.json"))
    for c in ads["campaigns"]:
        if c.get("slot") not in {"banner", "search", "sponsored-app"}: errors.append(f"ads.json: {c.get('id')}: bad slot")
        if c.get("type") == "app" and c.get("app") not in apps: errors.append(f"ads.json: {c.get('id')}: unknown app")
        if c.get("url") and not c["url"].startswith("https://"): errors.append(f"ads.json: {c.get('id')}: url must be https")
    return apps, cats, feat, ads, errors


def get(url, headers=None, tries=4):
    req = urllib.request.Request(url, headers={"User-Agent": "omarchy-store-build (+https://github.com/omarchy-community/store)", **(headers or {})})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.load(r)
        except urllib.error.HTTPError as ex:
            if ex.code == 404:
                return None
            err = ex
        except Exception as ex:
            err = ex
        time.sleep(2 ** i)
    print(f"  warn: {url}: {err}", file=sys.stderr)
    return None


def gh(repo):
    h = {"Accept": "application/vnd.github+json"}
    if os.environ.get("GITHUB_TOKEN"):
        h["Authorization"] = "Bearer " + os.environ["GITHUB_TOKEN"]
    r = get(f"https://api.github.com/repos/{repo}", h)
    if not r:
        return None
    rel = get(f"https://api.github.com/repos/{repo}/releases/latest", h) or {}
    return {
        "stars": r.get("stargazers_count"), "forks": r.get("forks_count"),
        "description": r.get("description"), "homepage": r.get("homepage") or None,
        "license": (r.get("license") or {}).get("spdx_id"), "pushed_at": r.get("pushed_at"),
        "archived": r.get("archived"), "owner_avatar": (r.get("owner") or {}).get("avatar_url"),
        "release": rel.get("tag_name"), "released_at": rel.get("published_at"),
    }


def strip_html(s):
    s = re.sub(r"<li>", "• ", s or "")
    s = re.sub(r"</(p|li|ul|ol)>", "\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"[ \t]+", " ", s)
    return re.sub(r"\n\s*\n+", "\n\n", s).strip()


def flathub(fid):
    j = get(f"https://flathub.org/api/v2/appstream/{fid}")
    if not j:
        return None
    shots = []
    for s in j.get("screenshots") or []:
        sizes = s.get("sizes") or []
        pick = next((x for x in sizes if x.get("width") == "1248"), None) or (sizes[0] if sizes else None)
        if pick:
            shots.append(pick["src"])
    desc = strip_html(j.get("description"))
    desc = "\n\n".join(p for p in desc.split("\n\n") if "flatpak" not in p.lower() and "flathub" not in p.lower())
    rel = (j.get("releases") or [{}])[0]
    cr = ((j.get("content_rating_details") or {}).get("en_US") or {})
    return {
        "summary": j.get("summary"), "description": desc, "developer": j.get("developer_name"),
        "icon": j.get("icon"), "screenshots": shots[:8], "homepage": (j.get("urls") or {}).get("homepage"),
        "license": j.get("project_license"), "version": rel.get("version"),
        "age": cr.get("minimumAgeText"),
    }


def arch(pkg):
    j = get("https://archlinux.org/packages/search/json/?" + urllib.parse.urlencode({"name": pkg}))
    rs = (j or {}).get("results") or []
    if not rs:
        return None
    r = rs[0]
    return {"repo": r["repo"], "version": r["pkgver"], "size": r.get("installed_size"), "updated": r.get("last_update")}


def aur(pkgs):
    if not pkgs:
        return {}
    q = "&".join("arg[]=" + urllib.parse.quote(p) for p in pkgs)
    j = get("https://aur.archlinux.org/rpc/v5/info?" + q) or {}
    return {r["Name"]: {"repo": "aur", "version": r["Version"], "votes": r["NumVotes"],
                        "popularity": r["Popularity"], "out_of_date": bool(r.get("OutOfDate")),
                        "updated": datetime.fromtimestamp(r["LastModified"], timezone.utc).isoformat()}
            for r in j.get("results", [])}


ICON_TYPES = {b"\x89PNG": ".png", b"<svg": ".svg", b"<?xml": ".svg", b"\xff\xd8\xff": ".jpg", b"RIFF": ".webp"}


def mirror_icon(app_id, url):
    """Download an icon into site/icons/ so the store never depends on hotlinks.
    Returns the local relative path, or None if the URL isn't a real image."""
    if not url:
        return None
    req = urllib.request.Request(url, headers={"User-Agent": "omarchy-store-build"})
    for i in range(3):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                data = r.read(2_000_000)
            break
        except Exception:
            time.sleep(2 ** i)
    else:
        print(f"  warn: icon download failed for {app_id}: {url}", file=sys.stderr)
        return None
    head = data[:200].lstrip()
    ext = next((e for sig, e in ICON_TYPES.items() if head.startswith(sig)), None)
    if ext == ".svg" and b"<svg" not in data[:2000]:
        ext = None
    if not ext:
        print(f"  warn: {app_id}: icon is not an image ({data[:40]!r})", file=sys.stderr)
        return None
    d = os.path.join(ROOT, "site", "icons")
    os.makedirs(d, exist_ok=True)
    for old in os.listdir(d):
        if old.rsplit(".", 1)[0] == app_id:
            os.remove(os.path.join(d, old))
    with open(os.path.join(d, app_id + ext), "wb") as f:
        f.write(data)
    return f"icons/{app_id}{ext}"


def build(apps, cats, feat, ads):
    print(f"Fetching live data for {len(apps)} apps…")
    with ThreadPoolExecutor(8) as ex:
        ghd = dict(zip(apps, ex.map(lambda a: gh(a["github"]) if a.get("github") else None, apps.values())))
        fhd = dict(zip(apps, ex.map(lambda a: flathub(a["flathub"]) if a.get("flathub") else None, apps.values())))
    # archlinux.org resets bursts of parallel connections — query it one at a time.
    main_pkg = {k: a["detect"][0] for k, a in apps.items()}
    ard = {}
    for k in apps:
        ard[k] = arch(main_pkg[k])
        time.sleep(0.3)
    aurd = aur([main_pkg[k] for k in apps if not ard[k]])

    out = []
    for k, a in apps.items():
        g, f, pk = ghd.get(k) or {}, fhd.get(k) or {}, ard.get(k) or aurd.get(main_pkg[k]) or {}
        out.append({
            **a,
            "summary": a.get("summary") or f.get("summary") or g.get("description") or "",
            "description": a.get("description") or f.get("description") or g.get("description") or "",
            "developer": a.get("developer") or f.get("developer") or (a["github"].split("/")[0] if a.get("github") else ""),
            "icon": a.get("icon") or f.get("icon") or g.get("owner_avatar"),
            "screenshots": a.get("screenshots") or f.get("screenshots") or [],
            "homepage": a.get("homepage") or f.get("homepage") or g.get("homepage"),
            "license": g.get("license") if g.get("license") not in (None, "NOASSERTION") else f.get("license"),
            "age": f.get("age"),
            "stars": g.get("stars"), "forks": g.get("forks"), "archived": g.get("archived"),
            "last_commit": g.get("pushed_at"), "release": g.get("release"), "released_at": g.get("released_at"),
            "package": {"name": main_pkg[k], **pk} if pk else {"name": main_pkg[k]},
        })
    print("Mirroring icons…")
    with ThreadPoolExecutor(8) as ex:
        local = list(ex.map(lambda a: mirror_icon(a["id"], a["icon"]), out))
    for a, path in zip(out, local):
        a["icon_source"] = a["icon"]
        a["icon"] = path
    today = date.today().isoformat()
    live = [c for c in ads["campaigns"] if c.get("enabled", True) and c.get("starts", "") <= today <= c.get("ends", "9999")]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "categories": load(os.path.join(REG, "categories.json")),
        "featured": feat, "ads": {"network": ads["network"], "campaigns": live},
        "apps": sorted(out, key=lambda x: -(x["stars"] or 0)),
    }


def main():
    apps, cats, feat, ads, errors = validate()
    if errors:
        print("Registry errors:"); [print("  ✗", e) for e in errors]; sys.exit(1)
    print(f"✓ registry valid: {len(apps)} apps, {len(cats)} categories, {len(ads['campaigns'])} ad campaigns")
    if "--check" in sys.argv:
        return
    cat = build(apps, cats, feat, ads)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(cat, f, indent=1)
    miss = [a["id"] for a in cat["apps"] if not a["icon"]]
    print(f"✓ wrote {OUT} ({os.path.getsize(OUT)//1024} KB). Missing icons: {miss or 'none'}")


if __name__ == "__main__":
    main()
