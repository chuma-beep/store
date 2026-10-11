#!/usr/bin/env python3
"""Builds the SnapDock TV channel list: site/tv.json (+ tv-guide.json).

Sources (both public, both only list channels the broadcaster gives away free):
  - Free-TV/IPTV playlist (github.com/Free-TV/IPTV): free-to-air + free ad-supported channels, curated by hand,
    "only channels which are officially provided for free". We never host or re-stream anything: every entry is
    the broadcaster's own public address, exactly as that playlist lists it.
  - iptv-org guides.json: which public TV-guide site carries each channel (for the programme guide).

Every stream is probed (ffprobe, 12 s) so the dock only shows channels that actually play right now.
Usage: python3 scripts/tv.py [--out site] [--no-probe] [--groups USA,UK,...]
"""
import json, os, re, subprocess, sys, time, urllib.request, html
from concurrent.futures import ThreadPoolExecutor

PLAYLIST = "https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8"
GUIDES = "https://iptv-org.github.io/api/guides.json"
UA = "SnapDock-TV/1.0 (+https://omarchystore.com)"
# Groups shown by default (English-first; the rest are still included under "More countries")
FEATURED_GROUPS = ["USA", "UK", "Canada", "Australia", "Ireland", "News", "Sports", "Kids", "Music", "Documentaries", "VOD Movies (EN)"]

def fetch(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def parse_m3u(text):
    out = []
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if not line.startswith("#EXTINF"):
            continue
        url = next((l.strip() for l in lines[i + 1:i + 3] if l.strip() and not l.startswith("#")), "")
        if not url.startswith("http"):
            continue
        attrs = dict(re.findall(r'([\w-]+)="([^"]*)"', line))
        name = line.rsplit(",", 1)[-1].strip()
        geo = "Ⓖ" in name
        name = re.sub(r"\s*[ⒼⓎ]\s*", "", name).strip()
        group = attrs.get("group-title", "")
        if group.startswith("VOD") and group != "VOD Movies (EN)":
            continue
        if url.startswith("https://www.youtube.com") or "youtube.com" in url:
            continue  # YouTube pages don't play as a stream
        out.append({
            "id": attrs.get("tvg-id") or "",
            "name": html.unescape(name), "logo": attrs.get("tvg-logo", ""), "group": group,
            "country": attrs.get("tvg-country", ""), "url": url, "geo": geo,
        })
    return out

def probe(ch):
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-user_agent", "Mozilla/5.0", "-rw_timeout", "12000000",
                            "-select_streams", "v", "-show_entries", "stream=width,height", "-of", "csv=p=0", ch["url"]],
                           capture_output=True, text=True, timeout=25)
        line = (r.stdout or "").strip().splitlines()
        if r.returncode == 0 and line:
            w, h = (line[0].split(",") + ["", ""])[:2]
            ch["alive"] = True; ch["res"] = f"{w}x{h}" if w and h else ""
        else:
            ch["alive"] = False
    except Exception:
        ch["alive"] = False
    return ch

def main():
    args = sys.argv[1:]
    out_dir = args[args.index("--out") + 1] if "--out" in args else "site"
    no_probe = "--no-probe" in args
    only = args[args.index("--groups") + 1].split(",") if "--groups" in args else None
    text = fetch(PLAYLIST).decode("utf-8", "replace")
    chans = parse_m3u(text)
    if only:
        chans = [c for c in chans if c["group"] in only]
    print(f"{len(chans)} channels in the playlist", file=sys.stderr)
    # de-duplicate by name within a group (keep the non-geo one first)
    seen, uniq = set(), []
    for c in sorted(chans, key=lambda c: (c["group"], c["name"], c["geo"])):
        k = (c["group"], c["name"].lower())
        if k in seen: continue
        seen.add(k); uniq.append(c)
    chans = uniq
    # every channel needs its own id (used for favourites, last channel, the guide)
    used = set()
    for c in chans:
        base = c["id"] or re.sub(r"[^a-z0-9]+", "-", c["name"].lower()).strip("-") or "channel"
        cid, n = base, 2
        while cid in used:
            cid = f"{base}-{n}"; n += 1
        c["id"] = cid; used.add(cid)
    if no_probe:
        for c in chans: c["alive"] = True
    else:
        t = time.time()
        with ThreadPoolExecutor(24) as ex:
            chans = list(ex.map(probe, chans))
        print(f"probed in {time.time() - t:.0f}s: {sum(c['alive'] for c in chans)} alive of {len(chans)}", file=sys.stderr)
    alive = [c for c in chans if c["alive"]]
    # guide availability
    try:
        guides = json.loads(fetch(GUIDES))
        has_guide = {g["channel"] for g in guides if g.get("channel")}
    except Exception:
        has_guide = set()
    for c in alive:
        c["guide"] = c["id"] in has_guide
    groups = []
    for g in FEATURED_GROUPS + sorted({c["group"] for c in alive} - set(FEATURED_GROUPS)):
        n = sum(1 for c in alive if c["group"] == g)
        if n: groups.append({"id": g, "name": g, "count": n, "featured": g in FEATURED_GROUPS})
    data = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "source": {"name": "Free-TV/IPTV", "url": "https://github.com/Free-TV/IPTV"},
            "groups": groups, "channels": [{k: v for k, v in c.items() if k != "alive"} for c in alive]}
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "tv.json"), "w") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {out_dir}/tv.json: {len(alive)} channels, {len(groups)} groups", file=sys.stderr)

if __name__ == "__main__":
    main()
