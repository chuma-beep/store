#!/usr/bin/env python3
"""Builds the SnapDock TV programme guide: tv-guide.json (now + next 12 hours for every channel in tv.json).

Guide data comes from public XMLTV files that TV apps already use:
  - i.mjh.nz  (Plex / Pluto TV / Samsung TV Plus / Roku guides per country; matched exactly through iptv-org's
    guides.json, which maps each channel id to its entry in those files)
  - epgshare01.online (US2, UK1, PLEX1, DISTROTV1: matched by channel name)
Programme titles only (plus start/stop and a short description when present). Nothing is hosted or re-streamed.
Usage: python3 scripts/tv_guide.py [--in site/tv.json] [--out site] [--hours 12]
"""
import gzip, html, io, json, os, re, sys, time, urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

UA = "SnapDock-TV/1.0 (+https://omarchystore.com)"
GUIDES = "https://iptv-org.github.io/api/guides.json"
MJH = "https://i.mjh.nz/{file}.xml.gz"
EPGSHARE = ["https://epgshare01.online/epgshare01/epg_ripper_US2.xml.gz", "https://epgshare01.online/epgshare01/epg_ripper_UK1.xml.gz",
            "https://epgshare01.online/epgshare01/epg_ripper_PLEX1.xml.gz", "https://epgshare01.online/epgshare01/epg_ripper_DISTROTV1.xml.gz",
            "https://epgshare01.online/epgshare01/epg_ripper_CA2.xml.gz", "https://epgshare01.online/epgshare01/epg_ripper_AU1.xml.gz"]

def fetch(url, timeout=120):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 " + UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
    return gzip.decompress(data) if url.endswith(".gz") else data

def norm(s):
    s = html.unescape(s or "").lower()
    s = re.sub(r"\b(hd|east|west|pacific|4k|tv)\b", " ", s)
    return re.sub(r"[^a-z0-9]", "", s)

def parse_time(t):
    # XMLTV: 20261011173100 +0000
    m = re.match(r"(\d{14})\s*([+-]\d{4})?", t or "")
    if not m: return None
    dt = datetime.strptime(m.group(1), "%Y%m%d%H%M%S")
    off = m.group(2) or "+0000"
    tz = timezone(timedelta(hours=int(off[:3]), minutes=int(off[0] + off[3:])))
    return int(dt.replace(tzinfo=tz).timestamp())

def load_xmltv(data, now, until):
    """Returns ({channel_id: display_name}, {channel_id: [ (start, stop, title, desc) ]}) limited to the window."""
    names, progs = {}, {}
    for ev, el in ET.iterparse(io.BytesIO(data), events=("end",)):
        if el.tag == "channel":
            dn = el.find("display-name")
            names[el.get("id")] = (dn.text or "") if dn is not None else ""
            el.clear()
        elif el.tag == "programme":
            start, stop = parse_time(el.get("start")), parse_time(el.get("stop"))
            if start and stop and stop > now and start < until:
                t = el.find("title"); d = el.find("desc")
                progs.setdefault(el.get("channel"), []).append((start, stop, (t.text or "").strip() if t is not None else "", ((d.text or "").strip()[:160]) if d is not None else ""))
            el.clear()
    return names, progs

def main():
    args = sys.argv[1:]
    src = args[args.index("--in") + 1] if "--in" in args else "site/tv.json"
    out_dir = args[args.index("--out") + 1] if "--out" in args else "site"
    hours = int(args[args.index("--hours") + 1]) if "--hours" in args else 12
    tv = json.load(open(src))
    chans = tv["channels"]
    now = int(time.time()); until = now + hours * 3600
    want = {c["id"] for c in chans}
    # exact matches through iptv-org guides.json -> i.mjh.nz files
    try:
        guides = json.loads(fetch(GUIDES))
    except Exception as e:
        print("guides.json failed:", e, file=sys.stderr); guides = []
    mjh_map = {}   # (file, site_channel_id) -> our channel id
    for g in guides:
        if g.get("site") == "i.mjh.nz" and g.get("channel") in want and "#" in (g.get("site_id") or ""):
            f, sid = g["site_id"].split("#", 1)
            mjh_map.setdefault((f, sid), g["channel"])
    files = sorted({f for f, _ in mjh_map})
    result = {}   # our id -> programmes
    for f in files:
        try:
            names, progs = load_xmltv(fetch(MJH.format(file=f)), now, until)
        except Exception as e:
            print(f"  skip {f}: {e}", file=sys.stderr); continue
        hit = 0
        for (ff, sid), ours in mjh_map.items():
            if ff == f and sid in progs and ours not in result:
                result[ours] = progs[sid]; hit += 1
        print(f"  {f}: {hit} channels", file=sys.stderr)
    # name matches through epgshare for the rest
    left = {norm(c["name"]): c["id"] for c in chans if c["id"] not in result}
    for url in EPGSHARE:
        if not left: break
        try:
            names, progs = load_xmltv(fetch(url), now, until)
        except Exception as e:
            print(f"  skip {url}: {e}", file=sys.stderr); continue
        hit = 0
        for cid, dn in names.items():
            n = norm(dn)
            if n in left and cid in progs:
                result[left.pop(n)] = progs[cid]; hit += 1
        print(f"  {url.rsplit('/', 1)[1]}: {hit} channels", file=sys.stderr)
    out = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "hours": hours,
           "sources": ["https://i.mjh.nz", "https://epgshare01.online"],
           "guide": {k: [[s, e, t, d] for s, e, t, d in sorted(v)] for k, v in result.items()}}
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "tv-guide.json"), "w") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"wrote {out_dir}/tv-guide.json: guide for {len(result)} of {len(chans)} channels", file=sys.stderr)

if __name__ == "__main__":
    main()
