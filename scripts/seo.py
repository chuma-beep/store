#!/usr/bin/env python3
"""Generate a real, indexable HTML page for every app and category.

Reads site/catalog.json + site/index.html (template) and writes into an output dir:
  /index.html                      home (Discover)
  /app/<id>/index.html             one per app
  /category/<id>/index.html        one per category
  /charts/ /categories/ /legal/ /get-desktop/
  /404.html                        GitHub Pages fallback (store handles unknown paths)
  /sitemap.xml  /robots.txt

Each page carries its own <title>, meta description, canonical URL, Open Graph +
Twitter preview tags, JSON-LD structured data (SoftwareApplication / ItemList /
BreadcrumbList), and server-rendered text content so crawlers see real words
without running JavaScript. The store's JS takes over on load.

Usage: python3 scripts/seo.py <out_dir>   (defaults to site/)
"""
import html, json, os, sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://omarchystore.com"
OUT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(ROOT, "site")

e = lambda s: html.escape(str(s or ""), quote=True)


def clip(s, n=158):
    s = " ".join(str(s or "").split())
    return s if len(s) <= n else s[: n - 1].rsplit(" ", 1)[0].rstrip(",.;:") + "…"


def k(n):
    if n is None:
        return ""
    return f"{n/1e6:.1f}M".replace(".0M", "M") if n >= 1e6 else f"{n/1e3:.1f}K".replace(".0K", "K") if n >= 1e3 else str(n)


def abs_url(p):
    if not p:
        return f"{SITE}/assets/og-default.png"
    return p if p.startswith("http") else f"{SITE}/{p.lstrip('/')}"


def head(title, desc, path, image, image_alt, jsonld, kind="website", extra=""):
    url = f"{SITE}{path}"
    def ldtag(x):
        body = json.dumps(x, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
        return '<script type="application/ld+json">' + body + "</script>"
    ld = "".join(ldtag(x) for x in jsonld)
    return f"""<title>{e(title)}</title>
<meta name="description" content="{e(desc)}">
<link rel="canonical" href="{url}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:site_name" content="Omarchy Store">
<meta property="og:type" content="{kind}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{e(image)}">
<meta property="og:image:alt" content="{e(image_alt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{e(title)}">
<meta name="twitter:description" content="{e(desc)}">
<meta name="twitter:image" content="{e(image)}">
{extra}{ld}"""


def render(template, head_html, body_html):
    t = template
    # replace default title + description with page-specific head
    start = t.index("<title>")
    end = t.index("<!--SEO-->") + len("<!--SEO-->")
    t = t[:start] + head_html + t[end:]
    s = t.index("<!--CONTENT-->")
    f = t.index("<!--/CONTENT-->") + len("<!--/CONTENT-->")
    return t[:s] + f'<div class="page ssr">{body_html}</div>' + t[f:]


def write(path, content):
    full = os.path.join(OUT, path.strip("/"), "index.html") if path != "/404.html" else os.path.join(OUT, "404.html")
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)


def crumbs(*items):
    return {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": i + 1, "name": n, "item": f"{SITE}{p}"} for i, (n, p) in enumerate(items)]}


def install_cmd(a):
    i = a["install"]
    if i["method"] == "omarchy":
        return i["command"]
    if i["method"] == "release":
        return f"curl -fsSL {SITE}/get.sh | bash -s {a['id']}"
    return ("omarchy pkg aur add " if i["method"] == "aur" else "omarchy pkg add ") + " ".join(i["packages"])


def app_li(a):
    return (f'<li><a href="/app/{a["id"]}/"><img src="/{e(a["icon"])}" alt="{e(a["name"])} icon" width="48" height="48" loading="lazy"> '
            if a.get("icon") else f'<li><a href="/app/{a["id"]}/">') + f'<strong>{e(a["name"])}</strong></a> – {e(a["summary"])}</li>'


def main():
    cat = json.load(open(os.path.join(OUT, "catalog.json")))
    template = open(os.path.join(ROOT, "site", "index.html"), encoding="utf-8").read()
    # Cache-busting: every deploy points pages at this exact version of styles/app code,
    # so browsers (phones especially) never mix new pages with an old saved stylesheet.
    import hashlib
    def _ver(f):
        try: return hashlib.sha1(open(os.path.join(ROOT, "site", f), "rb").read()).hexdigest()[:10]
        except OSError: return "0"
    template = (template.replace('href="/styles.css"', f'href="/styles.css?v={_ver("styles.css")}"')
                        .replace('src="/app.js"', f'src="/app.js?v={_ver("app.js")}"'))
    apps, cats = cat["apps"], cat["categories"]
    cname = {c["id"]: c["name"] for c in cats}
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    urls = []  # (loc, lastmod, priority)
    org = {"@context": "https://schema.org", "@type": "Organization", "name": "Omarchy Store", "url": SITE,
           "logo": f"{SITE}/assets/icon-512.png", "sameAs": ["https://github.com/omarchy-community/store"]}

    # ---- Home
    top = apps[:30]
    desc = f"The app store for Omarchy Linux: browse {len(apps)} hand-picked apps with real GitHub stars, screenshots and versions, and install them in one click."
    jsonld = [org,
              {"@context": "https://schema.org", "@type": "WebSite", "name": "Omarchy Store", "url": SITE,
               "potentialAction": {"@type": "SearchAction", "target": f"{SITE}/search/{{q}}/", "query-input": "required name=q"}},
              {"@context": "https://schema.org", "@type": "ItemList", "name": "Top apps for Omarchy",
               "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": f"{SITE}/app/{a['id']}/", "name": a["name"]} for i, a in enumerate(top)]}]
    body = (f'<h1 class="page-title">Omarchy Store – apps for Omarchy Linux</h1>'
            f'<p>{e(desc)} Every app installs through Arch Linux packages, the AUR, or Omarchy\'s own installers.</p>'
            '<h2>Top apps</h2><ul class="ssr-list">' + "".join(app_li(a) for a in top) + "</ul>"
            '<h2>Categories</h2><ul>' + "".join(f'<li><a href="/category/{c["id"]}/">{e(c["name"])}</a></li>' for c in cats) + "</ul>")
    write("/", render(template, head("Omarchy Store – The App Store for Omarchy Linux", desc, "/", f"{SITE}/assets/og-default.png", "Omarchy Store", jsonld), body))
    urls.append((f"{SITE}/", now, "1.0"))

    # ---- Apps
    for a in apps:
        c = cname.get(a["category"], a["category"])
        pk = a.get("package") or {}
        title = f"{a['name']} for Omarchy Linux – Install {a['name']} | Omarchy Store"
        d = f"Install {a['name']} on Omarchy Linux in one click. {a['summary']}".strip()
        if a.get("stars"):
            d += f" ★ {k(a['stars'])} GitHub stars."
        d = clip(d)
        F = a.get("featured")
        image = abs_url(F["og"]) if F and F.get("og") else abs_url(a["screenshots"][0]) if a.get("screenshots") else abs_url(a.get("icon"))
        if F:
            title = f"{a['name']} – {F['headline']} | Omarchy Store"
            d = clip(f"{a['summary']} {F.get('launch_offer') or ''}. How to install and use {a['name']} on Omarchy Linux.")
        sw = {"@context": "https://schema.org", "@type": "SoftwareApplication", "name": a["name"],
              "description": clip(a.get("description") or a["summary"], 500),
              "applicationCategory": {"games": "GameApplication", "developer-tools": "DeveloperApplication", "terminal": "DeveloperApplication",
                                      "security": "SecurityApplication", "graphics": "DesignApplication", "video-audio": "MultimediaApplication",
                                      "media": "EntertainmentApplication", "communication": "CommunicationApplication",
                                      "productivity": "BusinessApplication", "education": "EducationalApplication",
                                      "browsers": "BrowserApplication", "utilities": "UtilitiesApplication", "ai": "DeveloperApplication"}.get(a["category"], "UtilitiesApplication"),
              "operatingSystem": "Omarchy Linux, Arch Linux", "url": f"{SITE}/app/{a['id']}/",
              "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}}
        if a.get("icon"):
            sw["image"] = abs_url(a["icon"])
        if a.get("screenshots"):
            sw["screenshot"] = [abs_url(s) for s in a["screenshots"][:4]]
        if a.get("developer"):
            sw["author"] = {"@type": "Organization", "name": a["developer"]}
        if pk.get("version") or a.get("release"):
            sw["softwareVersion"] = a.get("release") or pk.get("version")
        if a.get("license"):
            sw["license"] = a["license"]
        if a.get("github"):
            sw["sameAs"] = [f"https://github.com/{a['github']}"]
        if F:
            jsonld_faq = {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
                {"@type": "Question", "name": x["q"], "acceptedAnswer": {"@type": "Answer", "text": x["a"]}} for x in F["faq"]]}
        jsonld = ([jsonld_faq] if F else []) + [sw, crumbs(("Omarchy Store", "/"), (c, f"/category/{a['category']}/"), (a["name"], f"/app/{a['id']}/"))]
        related = [x for x in apps if x["category"] == a["category"] and x["id"] != a["id"]][:8]
        facts = []
        if a.get("stars"):
            facts.append(f"{k(a['stars'])} GitHub stars")
        if a.get("developer"):
            facts.append(f"by {e(a['developer'])}")
        if pk.get("version"):
            facts.append(f"version {e(pk['version'])}")
        if a.get("license"):
            facts.append(f"license {e(a['license'])}")
        body = (f'<nav class="ssr-crumbs"><a href="/">Omarchy Store</a> › <a href="/category/{a["category"]}/">{e(c)}</a> › {e(a["name"])}</nav>'
                + (f'<img src="/{e(a["icon"])}" alt="{e(a["name"])} icon" width="128" height="128">' if a.get("icon") else "")
                + f'<h1 class="page-title">{e(a["name"])} for Omarchy Linux</h1>'
                f'<p><strong>{e(a["summary"])}</strong></p>'
                f'<p>{" · ".join(facts)}</p>'
                f'<h2>How to install {e(a["name"])} on Omarchy</h2>'
                f'<p>Click <strong>GET</strong> in the Omarchy Store desktop app, or run this in a terminal:</p>'
                f'<pre><code>{e(install_cmd(a))}</code></pre>'
                f'<h2>About {e(a["name"])}</h2>'
                f'<p>{e(a.get("description") or a["summary"]).replace(chr(10) + chr(10), "</p><p>")}</p>'
                + ("".join(f'<img src="{e(abs_url(s))}" alt="{e(a["name"])} screenshot {i+1}" loading="lazy" width="624" height="351">' for i, s in enumerate(a["screenshots"][:3])) if a.get("screenshots") else "")
                + (('<h2>How to use ' + e(a["name"]) + '</h2><ol>' + "".join(f'<li><strong>{e(s["title"])}</strong> – {e(s["body"])}</li>' for s in F["steps"]) + '</ol>'
                    '<h2>Keyboard shortcuts</h2><ul>' + "".join(f'<li>{" + ".join(e(k) for k in s["keys"])}: {e(s["does"])}</li>' for s in F["shortcuts"]) + '</ul>'
                    '<h2>Questions</h2>' + "".join(f'<h3>{e(x["q"])}</h3><p>{e(x["a"])}</p>' for x in F["faq"])) if F else "")
                + (f'<p>Source code: <a href="https://github.com/{e(a["github"])}" rel="noopener">github.com/{e(a["github"])}</a></p>' if a.get("github") else "")
                + (f'<h2>More {e(c)} apps</h2><ul class="ssr-list">' + "".join(app_li(x) for x in related) + "</ul>" if related else ""))
        write(f"/app/{a['id']}/", render(template, head(title, d, f"/app/{a['id']}/", image, f"{a['name']} on Omarchy", jsonld, extra=""), body))
        lm = (a.get("released_at") or a.get("last_commit") or pk.get("updated") or now)[:10]
        urls.append((f"{SITE}/app/{a['id']}/", lm, "0.8"))

    # ---- Categories
    for c in cats:
        lst = [a for a in apps if a["category"] == c["id"]]
        title = f"Best {c['name']} Apps for Omarchy Linux | Omarchy Store"
        names = ", ".join(a["name"] for a in lst[:5])
        d = clip(f"The {len(lst)} best {c['name'].lower()} apps for Omarchy Linux, ranked by GitHub stars: {names} and more. Install in one click.")
        jsonld = [{"@context": "https://schema.org", "@type": "ItemList", "name": f"{c['name']} apps for Omarchy",
                   "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": f"{SITE}/app/{a['id']}/", "name": a["name"]} for i, a in enumerate(lst)]},
                  crumbs(("Omarchy Store", "/"), (c["name"], f"/category/{c['id']}/"))]
        body = (f'<h1 class="page-title">Best {e(c["name"])} apps for Omarchy Linux</h1><p>{e(d)}</p>'
                '<ol class="ssr-list">' + "".join(app_li(a) for a in lst) + "</ol>")
        write(f"/category/{c['id']}/", render(template, head(title, d, f"/category/{c['id']}/", f"{SITE}/assets/og-default.png", c["name"], jsonld), body))
        urls.append((f"{SITE}/category/{c['id']}/", now, "0.7"))

    # ---- Themes (directory data from omarchythemes.com — credited on every page)
    themes = cat.get("themes") or []
    src = cat.get("themes_source") or {"name": "Omarchy Themes", "url": "https://omarchythemes.com"}
    credit = f'<p>Theme directory courtesy of <a href="{e(src["url"])}" rel="noopener">{e(src["name"])}</a>.</p>'

    def theme_li(t):
        return (f'<li><a href="/theme/{e(t["id"])}/">' + (f'<img src="/{e(t["image"])}" alt="{e(t["name"])} theme preview" width="160" height="100" loading="lazy"> ' if t.get("image") else "")
                + f'<strong>{e(t["name"])}</strong></a> by {e(t["author"] or "unknown")}</li>')
    if themes:
        d = clip(f"Browse {len(themes)} themes for Omarchy Linux: dark and light color schemes that restyle your terminal, Waybar, launcher, lock screen and wallpaper. Install in one click.")
        jsonld = [{"@context": "https://schema.org", "@type": "ItemList", "name": "Omarchy themes",
                   "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": f"{SITE}/theme/{t['id']}/", "name": t["name"]} for i, t in enumerate(themes[:100])]},
                  crumbs(("Omarchy Store", "/"), ("Themes", "/themes/"))]
        first = next((t for t in themes if t.get("image")), None)
        write("/themes/", render(template, head("Omarchy Themes – Browse & Install Desktop Themes | Omarchy Store", d, "/themes/",
                                               abs_url(first["image"]) if first else f"{SITE}/assets/og-default.png", "Omarchy themes", jsonld),
                                 f'<h1 class="page-title">Themes for Omarchy Linux</h1><p>{e(d)}</p>{credit}<ul class="ssr-list">' + "".join(theme_li(t) for t in themes) + "</ul>"))
        urls.append((f"{SITE}/themes/", now, "0.8"))
        for t in themes:
            mode = {"dark": "dark", "light": "light"}.get(t.get("mode"), "")
            title = f"{t['name']} Theme for Omarchy – by {t['author'] or 'community'} | Omarchy Store"
            d = clip(f"{t['name']} is a {mode + ' ' if mode else ''}theme for Omarchy Linux by {t['author'] or 'the community'}. "
                     + (f"{t['description']} " if t.get("description") and len(t["description"]) < 160 else "")
                     + "See the preview and color palette, and install it in one click.")
            cmd = (f"omarchy-theme-set {t['builtin']}" if t.get("builtin") else f"omarchy-theme-install https://github.com/{t['repo']}" if t.get("repo") else "")
            ld = {"@context": "https://schema.org", "@type": "CreativeWork", "name": f"{t['name']} (Omarchy theme)", "url": f"{SITE}/theme/{t['id']}/",
                  "author": {"@type": "Person", "name": t["author"] or "Unknown"}, "isAccessibleForFree": True, "description": d}
            if t.get("image"):
                ld["image"] = abs_url(t["image"])
            if t.get("repo"):
                ld["sameAs"] = [f"https://github.com/{t['repo']}"]
            body = (f'<nav class="ssr-crumbs"><a href="/">Omarchy Store</a> › <a href="/themes/">Themes</a> › {e(t["name"])}</nav>'
                    f'<h1 class="page-title">{e(t["name"])} theme for Omarchy</h1><p>by {e(t["author"] or "unknown")}</p>'
                    + (f'<img src="/{e(t["image"])}" alt="{e(t["name"])} theme on Omarchy" width="800" height="500">' if t.get("image") else "")
                    + f'<p>{e(d)}</p>'
                    + (f'<h2>How to install {e(t["name"])}</h2><p>Click <strong>GET</strong> in the Omarchy Store desktop app, or run:</p><pre><code>{e(cmd)}</code></pre>' if cmd else "")
                    + (f'<h2>Color palette</h2><p>{" ".join(e(c) for c in t["palette"])}</p>' if t.get("palette") else "")
                    + (f'<h2>What it recolors</h2><p>{e(", ".join(t["apps"]))}</p>' if t.get("apps") else "")
                    + (f'<p>Source: <a href="https://github.com/{e(t["repo"])}" rel="noopener">github.com/{e(t["repo"])}</a></p>' if t.get("repo") else "")
                    + f'<p>Listed via <a href="{e(t["source_url"])}" rel="noopener">{e(src["name"])}</a>.</p>')
            write(f"/theme/{t['id']}/", render(template, head(title, d, f"/theme/{t['id']}/", abs_url(t["image"]) if t.get("image") else f"{SITE}/assets/og-default.png",
                                                              f"{t['name']} theme", [ld, crumbs(("Omarchy Store", "/"), ("Themes", "/themes/"), (t["name"], f"/theme/{t['id']}/"))]), body))
            urls.append((f"{SITE}/theme/{t['id']}/", (t.get("updated") or now)[:10], "0.6"))

    # ---- Plugins (Omarchy Plugin Marketplace — credited on every page). Pages for the top plugins;
    # the store app shows all of them live.
    try:
        pdata = json.load(open(os.path.join(ROOT, "site", "plugins.json")))
    except Exception:
        pdata = {"plugins": []}
    plugs = pdata.get("plugins") or []
    if plugs:
        psrc = pdata.get("source") or {"name": "Omarchy Plugin Marketplace", "url": "https://plugins.omarchy.org/"}
        pcredit = f'<p>Plugin listings courtesy of the <a href="{e(psrc["url"])}" rel="noopener">{e(psrc["name"])}</a>.</p>'
        from urllib.parse import quote as _q
        purl = lambda x: f"/plugin/{_q(x['id'], safe='')}/"
        d = clip(f"Browse {len(plugs):,} community plugins for Omarchy Linux: bar widgets, system tools, productivity add-ons and more, "
                 f"each marked Verified or Unverified. Updated every 30 minutes.")
        top = sorted(plugs, key=lambda x: (-(x.get("s") or 0), not x.get("ok")))[:1500]
        write("/plugins/", render(template, head("Omarchy Plugins – Bar Widgets & Desktop Add-ons | Omarchy Store", d, "/plugins/",
                                                 f"{SITE}/assets/og-default.png", "Omarchy plugins",
                                                 [crumbs(("Omarchy Store", "/"), ("Plugins", "/plugins/"))]),
                                  f'<h1 class="page-title">Plugins for Omarchy Linux</h1><p>{e(d)}</p>{pcredit}<ul class="ssr-list">'
                                  + "".join(f'<li><a href="{purl(x)}"><strong>{e(x["n"])}</strong></a> by {e(x.get("a") or "community")}'
                                            f' – {"Verified" if x.get("ok") else "Unverified"}</li>' for x in top[:300]) + "</ul>"))
        urls.append((f"{SITE}/plugins/", now, "0.8"))
        for x in top:
            status = "Verified" if x.get("ok") else "Unverified"
            title = f"{x['n']} – Omarchy Plugin by {x.get('a') or 'community'} | Omarchy Store"
            d = clip(f"{x['n']} is a plugin for Omarchy Linux by {x.get('a') or 'the community'}. {x.get('d') or ''} "
                     f"Status: {status}.")
            cmd = f"omarchy plugin add {x['r']}.git --enable" if x.get("i") and x.get("r") else ""
            body = (f'<nav class="ssr-crumbs"><a href="/">Omarchy Store</a> › <a href="/plugins/">Plugins</a> › {e(x["n"])}</nav>'
                    f'<h1 class="page-title">{e(x["n"])} plugin for Omarchy</h1><p>by {e(x.get("a") or "community")} · {status}</p>'
                    f'<p>{e(x.get("d") or "")}</p>'
                    + (f'<h2>How to add {e(x["n"])}</h2><p>Click <strong>GET</strong> in the Omarchy Store desktop app, or run:</p><pre><code>{e(cmd)}</code></pre>' if cmd else
                       f'<h2>Setup</h2><p>{e(x.get("note") or "Manual setup: see the plugin page.")}</p>')
                    + (f'<p>Source: <a href="{e(x["r"])}" rel="noopener">{e(x["r"].replace("https://", ""))}</a></p>' if x.get("r") else "")
                    + f'<p>Listed on the <a href="{e(psrc["url"])}plugin.html?id={_q(x["id"], safe="")}" rel="noopener">{e(psrc["name"])}</a>.</p>')
            ld = {"@context": "https://schema.org", "@type": "SoftwareApplication", "name": x["n"], "applicationCategory": "UtilitiesApplication",
                  "operatingSystem": "Omarchy Linux", "url": f"{SITE}{purl(x)}", "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
                  "author": {"@type": "Person", "name": x.get("a") or "Unknown"}, "description": d}
            write(purl(x), render(template, head(title, d, purl(x), f"{SITE}/assets/og-default.png", x["n"],
                                                 [ld, crumbs(("Omarchy Store", "/"), ("Plugins", "/plugins/"), (x["n"], purl(x)))]), body))
            urls.append((f"{SITE}{purl(x)}", (x.get("u") or now)[:10], "0.5"))

    # ---- Screensavers (marketplace screensaver plugins + GitHub projects; the app shows them live)
    try:
        sdata = json.load(open(os.path.join(ROOT, "site", "screensavers.json")))
    except Exception:
        sdata = {}
    if sdata.get("count"):
        pby = {x["id"]: x for x in plugs}
        sp = [pby[x["id"]] for x in sdata.get("plugins", []) if x["id"] in pby]
        sr = sdata.get("repos") or []
        from urllib.parse import quote as _sq
        d = clip(f"{len(sp) + len(sr)} screensavers for Omarchy Linux: ASCII art, Matrix rain, aquariums, shaders, music visualizers "
                 f"and more, plus tools to set screensaver and lock timing. {len(sp)} install in one click.")
        body = ('<h1 class="page-title">Screensavers for Omarchy Linux</h1>'
                f'<p>{e(d)}</p><h2>One-click screensavers</h2><ul class="ssr-list">'
                + "".join(f'<li><a href="/plugin/{_sq(x["id"], safe="")}/"><strong>{e(x["n"])}</strong></a> by {e(x.get("a") or "community")} – {e(x.get("d") or "")}</li>' for x in sp)
                + '</ul><h2>More screensavers on GitHub</h2><ul class="ssr-list">'
                + "".join(f'<li><a href="https://github.com/{e(x["id"])}" rel="noopener"><strong>{e(x["n"])}</strong></a> by {e(x["a"])} – {e(x.get("d") or "")}</li>' for x in sr)
                + '</ul><p>One-click listings courtesy of the <a href="https://plugins.omarchy.org/" rel="noopener">Omarchy Plugin Marketplace</a>.</p>')
        write("/screensavers/", render(template, head("Omarchy Screensavers – Custom Screensavers & Idle Tools | Omarchy Store", d, "/screensavers/",
                                                      f"{SITE}/assets/og-default.png", "Omarchy screensavers",
                                                      [crumbs(("Omarchy Store", "/"), ("Screensavers", "/screensavers/"))]), body))
        urls.append((f"{SITE}/screensavers/", now, "0.8"))

    # ---- Other pages
    simple = {
        "/charts/": ("Top Charts – Most Popular Omarchy Apps | Omarchy Store",
                     f"The {len(apps)} most popular apps for Omarchy Linux, ranked by GitHub stars and updated weekly.",
                     '<h1 class="page-title">Top Charts</h1><ol class="ssr-list">' + "".join(app_li(a) for a in apps[:100]) + "</ol>"),
        "/categories/": ("App Categories | Omarchy Store", "Browse Omarchy Linux apps by category.",
                         '<h1 class="page-title">Categories</h1><ul><li><a href="/themes/">Themes</a></li><li><a href="/plugins/">Plugins</a></li><li><a href="/screensavers/">Screensavers</a></li>' + "".join(f'<li><a href="/category/{c["id"]}/">{e(c["name"])}</a></li>' for c in cats) + "</ul>"),
        "/legal/": ("Disclaimer | Omarchy Store", "Omarchy Store lists third-party software provided as-is, without warranty. Read the full disclaimer.",
                    '<h1 class="page-title">Disclaimer</h1>'),
        "/submit/": ("Submit an App to the Omarchy Store – Free Listing | Omarchy Store",
                     "List your Linux app in the Omarchy Store for free. Every app is reviewed; installs through Arch, the AUR or Omarchy installers.",
                     '<h1 class="page-title">Submit an app</h1><p>Listing is free. Fill in a short form and a maintainer reviews your app.</p>'
                     '<p><a href="https://github.com/omarchy-community/store/issues/new?template=submit-app.yml">Submit your app</a></p>'),
        "/contact/": ("Contact the Omarchy Store",
                      "Get in touch with the Omarchy Store: info@omarchystore.com. Developers, advertisers, press and support.",
                      '<h1 class="page-title">Contact us</h1><p>Email <a href="mailto:info@omarchystore.com">info@omarchystore.com</a>.</p>'),
        "/advertise/": ("Advertise on the Omarchy Store | Omarchy Store",
                        "Reach Omarchy and Arch Linux users with a Discover banner, sponsored app or search banner. Clearly labelled, no tracking.",
                        '<h1 class="page-title">Advertise on the Omarchy Store</h1><p>Discover banners, sponsored apps and search banners.</p>'
                        '<p><a href="https://github.com/omarchy-community/store/issues/new?template=advertising.yml">Ask about advertising</a></p>'),
        "/get-omarchy/": ("Get Omarchy – How to Install Omarchy Linux, Free & Step by Step | Omarchy Store",
                  "How to install Omarchy Linux in about 15 minutes: make the installer USB, keep Windows or replace it, install, then add the Omarchy Store for one-click apps and themes.",
                  '<h1 class="page-title">Get Omarchy</h1><p>Omarchy is a free, fast and beautiful Linux desktop made by DHH. Install it in about 15 minutes.</p>'
                  '<h2>1. Make the installer USB</h2><p>Download the latest Omarchy ISO, then write it to an 8 GB+ USB stick with Rufus (Windows), balenaEtcher (Windows and Mac) or Ignite in the Omarchy Store.</p>'
                  '<h2>2. Replace Windows or keep it</h2><p>Use the whole drive, or shrink Windows in Disk Management and choose Free space install to dual boot.</p>'
                  '<h2>3. Install</h2><p>Boot from the USB (F12, F11, F8 or Esc), turn off Secure Boot if needed, and answer a few questions.</p>'
                  '<h2>4. Get the Omarchy Store</h2><pre><code>curl -fsSL https://omarchystore.com/install.sh | bash</code></pre>'),
        "/ignite/": ("Ignite for Omarchy – Make an Omarchy Installer USB & Dual Boot with Windows | Omarchy Store",
                  "Ignite makes a bootable Omarchy USB installer in one click: always the latest official Omarchy ISO, SHA-256 verified. Plus how to install Omarchy next to Windows (dual boot) without erasing it.",
                  '<h1 class="page-title">Ignite for Omarchy</h1>'
                  '<p>Make an Omarchy installer USB stick in one click with Ignite in the Omarchy Store desktop app: it downloads the newest official '
                  'Omarchy ISO from iso.omarchy.org, checks its SHA-256, and writes it to your USB drive.</p>'
                  '<h2>Install Omarchy next to Windows (dual boot)</h2><ol><li>Turn off BitLocker (Settings, Privacy &amp; security, Device encryption).</li>'
                  '<li>Open Disk Management (diskmgmt.msc), right-click C:, Shrink Volume by 51200 MB (50 GB) or 102400 MB (100 GB).</li>'
                  '<li>Boot the Omarchy USB, pick your drive and choose Free space install.</li><li>In Omarchy, run limine-scan to add Windows to the boot menu.</li></ol>'
                  + (f'<p><a href="{e(cat.get("omarchy_iso", {}).get("url", ""))}">Download Omarchy {e(cat.get("omarchy_iso", {}).get("version", ""))}</a></p>' if cat.get("omarchy_iso") else "")
                  + '<h2>On Windows or Mac</h2><ol><li>Download the latest Omarchy ISO.</li><li>Install Rufus (Windows) or balenaEtcher (Windows and Mac).</li>'
                  '<li>Choose the ISO, choose your USB stick, and press Start or Flash.</li></ol>'),
        "/get-desktop/": ("Get the Omarchy Store Desktop App | Omarchy Store",
                          "Install the Omarchy Store desktop app for one-click installs on Omarchy Linux.",
                          '<h1 class="page-title">Get the desktop app</h1><pre><code>curl -fsSL https://omarchystore.com/install.sh | bash</code></pre>'),
    }
    for path, (t, d, b) in simple.items():
        write(path, render(template, head(t, d, path, f"{SITE}/assets/og-default.png", "Omarchy Store", [org]), b))
        urls.append((f"{SITE}{path}", now, "0.5" if path in ("/legal/",) else "0.6"))

    # ---- short links for social media
    for short in ("/get/", "/omarchy/"):
        write(short, '<!doctype html><meta charset="utf-8"><title>Get Omarchy</title>'
              f'<link rel="canonical" href="{SITE}/get-omarchy/"><meta http-equiv="refresh" content="0; url=/get-omarchy/">'
              '<meta name="robots" content="noindex"><a href="/get-omarchy/">Get Omarchy</a>')

    # ---- old address: /usb/ -> /ignite/
    write("/usb/", '<!doctype html><meta charset="utf-8"><title>Ignite for Omarchy</title>'
          f'<link rel="canonical" href="{SITE}/ignite/"><meta http-equiv="refresh" content="0; url=/ignite/">'
          '<meta name="robots" content="noindex"><a href="/ignite/">Ignite for Omarchy</a>')

    # ---- 404 fallback: lets the store handle /search/... and any old/unknown path
    nf = render(template, '<title>Omarchy Store</title><meta name="robots" content="noindex">', "")
    write("/404.html", nf)

    # ---- sitemap + robots
    with open(os.path.join(OUT, "sitemap.xml"), "w") as f:
        f.write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n')
        for loc, lm, pr in urls:
            f.write(f"  <url><loc>{loc}</loc><lastmod>{lm}</lastmod><priority>{pr}</priority></url>\n")
        f.write("</urlset>\n")
    with open(os.path.join(OUT, "robots.txt"), "w") as f:
        f.write(f"User-agent: *\nAllow: /\nDisallow: /search/\nDisallow: /api/\nDisallow: /desktop-files/\nDisallow: /admin/\n\nSitemap: {SITE}/sitemap.xml\n")
    print(f"✓ SEO: {len(urls)} pages + sitemap.xml + robots.txt → {OUT}")


if __name__ == "__main__":
    main()
