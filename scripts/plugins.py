#!/usr/bin/env python3
"""Collect every community plugin from the official Omarchy Plugin Marketplace.

Source: https://plugins.omarchy.org (repo omacom/omarchy-plugin-marketplace, run by HANCORE).
Every listing is included with the marketplace's own Verified / Unverified status; we credit the
marketplace on every page and link back to the original listing.

Writes site/plugins.json. A GitHub Action re-runs this every 30 minutes and publishes the file to
the `data` branch, which the store reads live — so new plugins show up without a full rebuild.
"""
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "site", "plugins.json")
SRC = "https://raw.githubusercontent.com/omacom/omarchy-plugin-marketplace/main/site/catalog.json"
MARKET = "https://plugins.omarchy.org/"
UA = "omarchy-store-build (+https://github.com/omarchy-community/store)"

CMD_RE = re.compile(r"^omarchy plugin add (https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+?)(?:\.git)? --enable$")
REPO_RE = re.compile(r"^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$")
IMG_RE = re.compile(r"^assets/img/plugins/([A-Za-z0-9._-]+)-card\.(webp|png|jpg)$")

CATS = {
    "Widgets": "widgets", "Bar widgets": "widgets", "Bars": "widgets", "Panels": "widgets",
    "Productivity": "productivity", "System": "system", "Services": "system",
    "Hardware": "hardware", "Desktop": "desktop", "Overlays": "desktop", "Menus": "desktop",
    "Developer Tools": "developer", "Appearance": "appearance", "Kids": "kids", "Other": "other",
}
CATEGORY_LIST = [
    {"id": "widgets", "name": "Bar & widgets"}, {"id": "productivity", "name": "Productivity"},
    {"id": "system", "name": "System"}, {"id": "desktop", "name": "Desktop"},
    {"id": "appearance", "name": "Appearance"}, {"id": "hardware", "name": "Hardware"},
    {"id": "developer", "name": "Developer"}, {"id": "kids", "name": "Kids"}, {"id": "other", "name": "Other"},
]


def clean(s, n):
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def collect():
    req = urllib.request.Request(SRC, headers={"User-Agent": UA})
    data = json.loads(urllib.request.urlopen(req, timeout=180).read())
    out, seen = [], set()
    for p in data.get("plugins", []):
        if p.get("sourceType") != "community":
            continue  # the ~38 built-in Omarchy plugins already come with Omarchy
        pid = str(p.get("id") or "")
        if not ID_RE.match(pid) or pid in seen:
            continue
        seen.add(pid)
        repo = str(p.get("repo") or "").rstrip("/").removesuffix(".git")
        m = CMD_RE.match(str(p.get("installCommand") or "").strip())
        installable = bool(p.get("installAvailable") and m)
        im = IMG_RE.match(p.get("previewThumbnail") or "")
        row = {
            "id": pid,
            "n": clean(p.get("name") or pid, 60),                 # name
            "d": clean(p.get("description"), 240),                # summary
            "a": clean(p.get("author"), 50),                      # author
            "v": clean(p.get("version"), 24),                     # version
            "c": CATS.get(p.get("category"), "other"),            # category
            "t": [clean(t, 20) for t in (p.get("tags") or [])[:3]],
            "r": repo if REPO_RE.match(repo) else "",             # source repo
            "s": p.get("stars") or 0,                             # GitHub stars
            "ok": p.get("verificationStatus") == "verified",      # marketplace-verified
            "u": (p.get("repositoryUpdatedAt") or p.get("listedAt") or "")[:10],
            "add": (p.get("addedAt") or "")[:10],
            "ac": clean(p.get("accent"), 12),
            "ini": clean(p.get("initials") or pid[:2].upper(), 3),
        }
        if installable:
            row["i"] = 1                                          # one-command install
            row["r"] = m.group(1)
        else:
            row["note"] = clean(p.get("installNote") or "Manual setup: see the plugin's instructions.", 200)
        if im:
            row["img"] = im.group(1) + "." + im.group(2)        # assets/img/plugins/<img> (card) / -detail
        lic = p.get("license")
        if lic and lic != "See repository":
            row["l"] = clean(lic, 30)
        out.append(row)
    out.sort(key=lambda x: (-x["s"], not x["ok"], x["n"].lower()))
    return {
        "generated_at": data.get("generatedAt"),
        "count": len(out),
        "source": {"name": "Omarchy Plugin Marketplace", "url": MARKET, "by": "HANCORE",
                   "by_url": "https://github.com/HANCORE-linux",
                   "repo": "https://github.com/omacom/omarchy-plugin-marketplace",
                   "img_base": MARKET + "assets/img/plugins/"},
        "categories": CATEGORY_LIST,
        "plugins": out,
    }


def main():
    try:
        res = collect()
        assert res["count"] > 100, "suspiciously few plugins"
    except Exception as ex:  # never break the store if the marketplace is down
        print(f"  warn: plugins skipped: {ex}", file=sys.stderr)
        if os.path.exists(OUT):
            return
        res = {"count": 0, "source": {}, "categories": CATEGORY_LIST, "plugins": []}
    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(res, f, separators=(",", ":"), ensure_ascii=False)
    ok = sum(1 for p in res["plugins"] if p["ok"])
    print(f"✓ plugins: {res['count']} ({ok} verified, {res['count'] - ok} unverified) → {OUT} ({os.path.getsize(OUT)//1024} KB)")


if __name__ == "__main__":
    main()
