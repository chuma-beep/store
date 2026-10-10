#!/usr/bin/env python3
"""Collect Omarchy themes for the store's Themes section.

Source: https://omarchythemes.com (community directory by Mubs — credited on every
theme page). For each theme we read its name, author, preview and GitHub repo, then
ask GitHub for stars, last update and the theme's colors.toml (palette swatches +
dark/light detection). Previews are mirrored into site/themes/img/ so we never
hotlink their server.

Used by build.py (adds "themes" to catalog.json). Run alone to test:
  python3 scripts/themes.py            # prints a summary, writes nothing
Stdlib only. Set GITHUB_TOKEN for colors/stars (GraphQL needs a token).
"""
import html, json, os, re, sys, time, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "https://omarchythemes.com"
UA = "omarchy-store-build (+https://omarchystore.com; themes section, credits omarchythemes.com)"
IMG_DIR = os.path.join(ROOT, "site", "theme-previews")
# Previews are mirrored into site/theme-previews/.
# Only plain GitHub repo URLs are ever handed to `omarchy-theme-install`.
REPO_RE = re.compile(r"^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\.git)?/?$")
SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,80}$")


def fetch(url, tries=4, binary=False, limit=4_000_000):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for i in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read(limit)
            return data if binary else data.decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
        except Exception:
            pass
        time.sleep(2 ** i)
    print(f"  warn: could not fetch {url}", file=sys.stderr)
    return None


def theme_name(owner_repo):
    """Same rule omarchy-theme-install uses to name the folder in ~/.config/omarchy/themes."""
    base = owner_repo.split("/", 1)[1]
    base = re.sub(r"\.git$", "", base)
    return re.sub(r"-theme$", "", re.sub(r"^omarchy-", "", base)).lower()


def listing():
    page = fetch(SRC + "/")
    if not page:
        return []
    out, seen = [], set()
    # Each card: <a href=".../themes/<slug>"> <img src="thumb" alt="<Name> preview"> ... <strong>by <author></strong>
    for m in re.finditer(r'href="https://omarchythemes\.com/themes/([a-z0-9-]+)"(.*?)</a>', page, re.S):
        slug, body = m.group(1), m.group(2)
        if slug in seen or not SLUG_RE.match(slug):
            continue
        img = re.search(r'<img[^>]+src="([^"]+)"[^>]*alt="([^"]*?) preview"', body)
        by = re.search(r">\s*by\s+([^<]+?)\s*<", body)
        seen.add(slug)
        out.append({"slug": slug, "name": html.unescape(img.group(2)) if img else slug.replace("-", " ").title(),
                    "author": html.unescape(by.group(1)) if by else "", "thumb": img.group(1) if img else None})
    return out


def detail(t):
    page = fetch(f"{SRC}/themes/{t['slug']}") or ""
    gh = re.search(r'href="(https://github\.com/[^"]+)"[^>]*>\s*(?:<[^>]+>\s*)*<span>Learn more', page)
    m = REPO_RE.match(gh.group(1)) if gh else None
    apps = re.findall(r"<p>([a-z0-9 _-]{2,20})</p>", page.split("Colors for", 1)[1] if "Colors for" in page else "")
    desc = re.search(r"<h2></h2>\s*<div>(.*?)</div>", page, re.S)
    big = re.search(r'<img[^>]+src="([^"]+)"[^>]*alt="[^"]*preview"', page)
    t.update({
        "repo": f"{m.group(1)}/{m.group(2)}" if m else None,
        "apps": sorted(set(a.strip() for a in apps)),
        "description": re.sub(r"<[^>]+>", " ", html.unescape(desc.group(1))).strip() if desc else "",
        "preview_src": big.group(1) if big else t.get("thumb"),
    })
    return t


def parse_colors(toml):
    out = {}
    for line in (toml or "").splitlines():
        m = re.match(r'\s*([a-z_0-9]+)\s*=\s*["\']?(?:#|0x)?([0-9a-fA-F]{6})\b', line)
        if m and m.group(1) not in out:
            out[m.group(1)] = "#" + m.group(2).lower()
    return out


def luminance(hexc):
    r, g, b = (int(hexc[i:i + 2], 16) / 255 for i in (1, 3, 5))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def github(repos):
    tok = os.environ.get("GITHUB_TOKEN")
    if not tok or not repos:
        return {}
    out = {}
    q = ("stargazerCount pushedAt isArchived description owner { login } "
         "colors: object(expression:\"HEAD:colors.toml\") { ... on Blob { text } } "
         "light: object(expression:\"HEAD:light.mode\") { id } "
         "alac: object(expression:\"HEAD:alacritty.toml\") { ... on Blob { text } } "
         "root: object(expression:\"HEAD:\") { ... on Tree { entries { name } } } "
         "bg: object(expression:\"HEAD:backgrounds\") { ... on Tree { entries { name } } }")
    for i in range(0, len(repos), 30):
        chunk = repos[i:i + 30]
        parts = [f"r{j}: repository(owner:{json.dumps(r.split('/')[0])}, name:{json.dumps(r.split('/')[1])}) {{ {q} }}"
                 for j, r in enumerate(chunk)]
        body = json.dumps({"query": "query{" + " ".join(parts) + "}"}).encode()
        d = {}
        for t in range(4):
            try:
                req = urllib.request.Request("https://api.github.com/graphql", data=body, headers={
                    "Authorization": "bearer " + tok, "Content-Type": "application/json", "User-Agent": UA})
                with urllib.request.urlopen(req, timeout=60) as resp:
                    d = json.load(resp).get("data") or {}
                break
            except Exception:
                time.sleep(2 ** t)
        for j, r in enumerate(chunk):
            v = d.get(f"r{j}")
            if v:
                out[r] = v
    return out


# Files that make a repo a real Omarchy theme (vs. a link to a list or a dotfiles repo).
THEME_FILES = {"colors.toml", "hyprland.conf", "alacritty.toml", "waybar.css", "walker.css", "btop.theme", "neovim.lua"}
# Themes that ship with Omarchy itself (refreshed from GitHub at build time; this is the fallback).
BUILTIN_FALLBACK = ["catppuccin", "catppuccin-latte", "ethereal", "everforest", "flexoki-light", "gruvbox", "hackerman",
                    "kanagawa", "last-horizon", "lumon", "lupine", "matte-black", "miasma", "nord", "osaka-jade",
                    "retro-82", "ristretto", "rose-pine", "solitude", "tokyo-night", "vantablack", "white"]


def builtins():
    j = fetch("https://api.github.com/repos/basecamp/omarchy/contents/themes")
    try:
        names = [x["name"] for x in json.loads(j) if x.get("type") == "dir"]
        return names or BUILTIN_FALLBACK
    except Exception:
        return BUILTIN_FALLBACK


def builtin_colors(name):
    return parse_colors(fetch(f"https://raw.githubusercontent.com/basecamp/omarchy/master/themes/{name}/colors.toml", tries=2))


IMG_SIGS = {b"\xff\xd8\xff": ".jpg", b"\x89PNG": ".png", b"RIFF": ".webp", b"GIF8": ".gif"}


def mirror(slug, url):
    if not url or not url.startswith(SRC + "/"):
        return None
    data = fetch(url, binary=True)
    if not data:
        return None
    ext = next((e for s, e in IMG_SIGS.items() if data.startswith(s)), None)
    if not ext:
        return None
    os.makedirs(IMG_DIR, exist_ok=True)
    with open(os.path.join(IMG_DIR, slug + ext), "wb") as f:
        f.write(data)
    return f"theme-previews/{slug}{ext}"


def collect(mirror_images=True):
    base = listing()
    print(f"Themes: {len(base)} listed on omarchythemes.com — reading details…")
    with ThreadPoolExecutor(4) as ex:  # be gentle with a small community site
        themes = list(ex.map(detail, base))
    repos = sorted({t["repo"] for t in themes if t["repo"]})
    g = github(repos)
    built = set(builtins())
    out = []
    for t in themes:
        v = g.get(t["repo"]) or {}
        root = {e["name"] for e in ((v.get("root") or {}).get("entries") or [])}
        if t["repo"] and v and not (root & THEME_FILES):
            print(f"  skip repo for {t['slug']}: {t['repo']} doesn't look like a theme", file=sys.stderr)
            t["repo"], v = None, {}
        # Built into Omarchy? (no repo needed — the store just switches to it)
        bname = t["slug"] if t["slug"] in built else (theme_name(t["repo"]) if t["repo"] and theme_name(t["repo"]) in built else None)
        colors = parse_colors((v.get("colors") or {}).get("text"))
        if not colors and bname:
            colors = builtin_colors(bname)
        if not colors:  # older themes: read the terminal palette from alacritty.toml
            a = parse_colors((v.get("alac") or {}).get("text"))
            if "background" in a:
                colors = {"background": a["background"], "foreground": a.get("foreground", ""),
                          **{f"color{i}": a[k] for i, k in enumerate(["black", "red", "green", "yellow", "blue", "magenta", "cyan"]) if k in a and i}}
                colors = {k: c for k, c in colors.items() if c}
        bgc = colors.get("background")
        mode = "light" if v.get("light") else ("light" if bgc and luminance(bgc) > 0.5 else ("dark" if bgc else None))
        palette = [colors[k] for k in ("background", "foreground", "accent", "color1", "color2", "color3", "color4", "color5", "color6") if k in colors]
        out.append({
            "id": t["slug"], "name": t["name"], "author": t["author"] or (v.get("owner") or {}).get("login", ""),
            "repo": t["repo"], "builtin": bname, "install_name": bname or (theme_name(t["repo"]) if t["repo"] else None),
            "description": t["description"] or (v.get("description") or ""),
            "apps": t["apps"], "mode": mode, "palette": palette,
            "backgrounds": len(((v.get("bg") or {}).get("entries")) or []),
            "stars": v.get("stargazerCount"), "updated": v.get("pushedAt"), "archived": v.get("isArchived"),
            "source_url": f"{SRC}/themes/{t['slug']}",
            "_thumb": t["thumb"], "_preview": t["preview_src"],
        })
    if mirror_images:
        print("Mirroring theme previews…")
        with ThreadPoolExecutor(4) as ex:
            paths = list(ex.map(lambda t: mirror(t["id"], t["_preview"] or t["_thumb"]), out))
    else:
        paths = [t["_preview"] for t in out]
    for t, p in zip(out, paths):
        t["image"] = p
        del t["_thumb"], t["_preview"]
    # Installable themes first, then by stars, then name.
    out.sort(key=lambda t: (not (t["repo"] or t["builtin"]), -(t["stars"] or 0), t["name"].lower()))
    return out


if __name__ == "__main__":
    ts = collect(mirror_images="--mirror" in sys.argv)
    print(f"{len(ts)} themes · {sum(1 for t in ts if t['repo'] or t['builtin'])} installable · {sum(1 for t in ts if t['builtin'])} built-in · "
          f"{sum(1 for t in ts if t['mode'] == 'dark')} dark · {sum(1 for t in ts if t['mode'] == 'light')} light · "
          f"{sum(1 for t in ts if t['palette'])} with palette")
    for t in ts[:5]:
        print(json.dumps(t)[:400])
    if "--json" in sys.argv:
        json.dump(ts, open("/tmp/themes.json", "w"), indent=1)
