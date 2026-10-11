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
STREAMS = "https://iptv-org.github.io/api/streams.json"   # extra sources for the SAME channel (backup feeds)
# Extra sources are only taken from the broadcaster itself or known free, licensed platforms (FAST services and
# their CDNs). Anything else (random IPs, relays) is ignored: we only play what the owner gives away free.
OK_SOURCE_HOSTS = (
    "amagi.tv", "amagi.com", "tubi.video", "tubitv.com", "pluto.tv", "plex.tv", "provider-static.plex.tv",
    "samsungcloud.tv", "samsung.com", "akamaized.net", "akamaihd.net", "cloudfront.net", "fastly.net", "llnwd.net",
    "roku.com", "xumo.com", "jmp2.uk", "stirr.com", "redbox.com", "foxnews.com", "foxbusiness.com", "foxweather.com",
    "fox.com", "cbsnews.com", "cbsistatic.com", "nbcuni.com", "abc.com", "cnn.com", "bloomberg.com", "bbc.co.uk",
    "bbci.co.uk", "sky.com", "skynews.com", "france24.com", "dw.com", "euronews.com", "aljazeera.net", "cbc.ca",
    "abc.net.au", "sbs.com.au", "rte.ie", "nhk.or.jp", "arte.tv", "zdf.de", "ard.de", "rtve.es", "rai.it",
    "streamhoster.com", "telvue.com", "bozztv.com", "wowza.com", "streamlock.net", "mdstrm.com", "klowdtv.com",
    "cdnvideo.ru", "edgenextcdn.net", "onetv.app", "trace.plus", "weather.com", "weathergroup.com", "cheddar.com",
    "newsy.com", "scrippsnews.com", "nasa.gov", "c-span.org", "pbs.org", "wurl.tv", "lionsgate.com", "filmrise.com",
)
CHANNELS = "https://iptv-org.github.io/api/channels.json"
# Extra GROUPS built from iptv-org (beyond the Free-TV playlist): free movie/TV-show channels from licensed FAST
# platforms (Pluto TV, Tubi, Samsung TV Plus, Plex, Roku...) for English-speaking countries.
EXTRA_GROUPS = {"Movies": {"categories": {"movies"}, "countries": {"US", "GB", "CA", "AU"}},
                "Series": {"categories": {"series"}, "countries": {"US", "GB", "CA", "AU"}}}
MAX_SOURCES = 5
UA = "SnapDock-TV/1.0 (+https://omarchystore.com)"
# Groups shown by default (English-first; the rest are still included under "More countries")
FEATURED_GROUPS = ["USA", "UK", "Canada", "Australia", "Ireland", "News", "Sports", "Movies", "Series", "Kids", "Music", "Documentaries", "VOD Movies (EN)"]

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
        name = re.sub(r"\s*[ⒼⓎⓈ]\s*", "", name).strip()
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

def probe_url(url):
    """(alive, 'WxH') for one stream address."""
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-user_agent", "Mozilla/5.0", "-rw_timeout", "12000000",
                            "-select_streams", "v", "-show_entries", "stream=width,height", "-of", "csv=p=0", url],
                           capture_output=True, text=True, timeout=25)
        line = (r.stdout or "").strip().splitlines()
        if r.returncode == 0 and line:
            w, h = (line[0].split(",") + ["", ""])[:2]
            return True, (f"{w}x{h}" if w and h else "")
    except Exception:
        pass
    return False, ""

def host_ok(url):
    h = url.split("/")[2].lower().split(":")[0]
    if re.fullmatch(r"[\d.]+", h): return False          # bare IP: not a broadcaster/platform
    return any(h == d or h.endswith("." + d) for d in OK_SOURCE_HOSTS)

def provider_of(url):
    h = url.split("/")[2].lower()
    for key, name in (("amagi", "Amagi"), ("tubi", "Tubi"), ("pluto", "Pluto TV"), ("jmp2.uk/plu", "Pluto TV"), ("jmp2.uk/stvp", "Samsung TV Plus"),
                      ("plex", "Plex"), ("samsung", "Samsung TV Plus"), ("roku", "Roku"), ("xumo", "Xumo"), ("stirr", "Stirr"), ("akamai", "Broadcaster CDN"),
                      ("cloudfront", "Broadcaster CDN")):
        if key in url.lower(): return name
    return h.split(".")[-2].capitalize() if "." in h else h

def probe(ch):
    """Probe the main address plus every candidate backup; keep up to MAX_SOURCES that play, best resolution first."""
    cands = [ch["url"]] + [u for u in ch.pop("candidates", []) if u != ch["url"] and host_ok(u)]
    seen, srcs = set(), []
    for u in cands:
        if u in seen: continue
        seen.add(u)
        ok, res = probe_url(u)
        if ok:
            try: h = int(res.split("x")[1]) if res else 0
            except Exception: h = 0
            srcs.append({"url": u, "res": res, "h": h, "provider": provider_of(u)})
        if len(srcs) >= MAX_SOURCES: break
    if not srcs:
        ch["alive"] = False; return ch
    # the Free-TV address first if it works (it's the curated one), then by resolution
    srcs.sort(key=lambda s: (0 if s["url"] == ch["url"] else 1, -s["h"]))
    ch["alive"] = True; ch["url"] = srcs[0]["url"]; ch["res"] = srcs[0]["res"]
    ch["sources"] = [{"url": s["url"], "res": s["res"], "provider": s["provider"]} for s in srcs]
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
    # backup sources for the same channel from iptv-org (matched by tvg-id), plus extra groups (Movies, Series)
    try:
        extra = {}
        all_streams = json.loads(fetch(STREAMS))
        for s in all_streams:
            if s.get("channel") and s.get("url"):
                extra.setdefault(s["channel"], []).append(s["url"])
        # name index: "foxnews.us" -> urls (iptv-org channel name + country)
        name_index = {}
        try:
            meta_all = {c["id"]: c for c in json.loads(fetch(CHANNELS))}
            for cid, urls in extra.items():
                m = meta_all.get(cid)
                if m: name_index.setdefault(re.sub(r"[^a-z0-9]", "", m["name"].lower()) + "." + (m.get("country") or "").lower(), []).extend(urls)
        except Exception:
            meta_all = {}
        try:
            meta = meta_all or {c["id"]: c for c in json.loads(fetch(CHANNELS))}
            have = {c["id"] for c in chans} | {c["id"].lower() for c in chans}
            for gname, rule in EXTRA_GROUPS.items():
                added = 0
                for cid, urls in extra.items():
                    m = meta.get(cid)
                    if not m or cid in have or cid.lower() in have or m.get("closed") or m.get("is_nsfw"): continue
                    if m.get("country") not in rule["countries"] or not (set(m.get("categories", [])) & rule["categories"]): continue
                    ok_urls = [u for u in urls if host_ok(u)]
                    if not ok_urls: continue
                    chans.append({"id": cid, "name": m["name"], "logo": m.get("logo") or "", "group": gname, "country": m.get("country", ""),
                                  "url": ok_urls[0], "geo": False, "candidates": ok_urls[1:]})
                    have.add(cid); added += 1
                print(f"{gname}: +{added} channels from FAST providers", file=sys.stderr)
        except Exception as e:
            print(f"no extra groups: {e}", file=sys.stderr)
        n_extra = 0
        lower = {k.lower(): v for k, v in extra.items()}
        for c in chans:
            base = re.sub(r"-\d+$", "", c["id"])
            cand = extra.get(c["id"]) or extra.get(base) or lower.get(c["id"].lower()) or lower.get(base.lower()) or []
            if not cand:
                cc = (c.get("country") or c["id"].rsplit(".", 1)[-1] if "." in c["id"] else "").lower()
                key = re.sub(r"[^a-z0-9]", "", c["name"].lower()) + "." + cc
                cand = name_index.get(key) or []
            cand = [u for u in cand if host_ok(u)]
            if cand: c["candidates"] = (c.get("candidates") or []) + cand; n_extra += 1
        print(f"backup candidates for {n_extra} channels", file=sys.stderr)
    except Exception as e:
        print(f"no extra streams: {e}", file=sys.stderr)
    if no_probe:
        for c in chans: c["alive"] = True; c.pop("candidates", None); c["sources"] = [{"url": c["url"], "res": "", "provider": provider_of(c["url"])}]
    else:
        t = time.time()
        with ThreadPoolExecutor(48) as ex:
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
