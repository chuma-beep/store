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
    return ("omarchy pkg aur add " if i["method"] == "aur" else "omarchy pkg add ") + " ".join(i["packages"])


def app_li(a):
    return (f'<li><a href="/app/{a["id"]}/"><img src="/{e(a["icon"])}" alt="{e(a["name"])} icon" width="48" height="48" loading="lazy"> '
            if a.get("icon") else f'<li><a href="/app/{a["id"]}/">') + f'<strong>{e(a["name"])}</strong></a> – {e(a["summary"])}</li>'


def main():
    cat = json.load(open(os.path.join(OUT, "catalog.json")))
    template = open(os.path.join(ROOT, "site", "index.html"), encoding="utf-8").read()
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
        image = abs_url(a["screenshots"][0]) if a.get("screenshots") else abs_url(a.get("icon"))
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
            sw["screenshot"] = a["screenshots"][:4]
        if a.get("developer"):
            sw["author"] = {"@type": "Organization", "name": a["developer"]}
        if pk.get("version") or a.get("release"):
            sw["softwareVersion"] = a.get("release") or pk.get("version")
        if a.get("license"):
            sw["license"] = a["license"]
        if a.get("github"):
            sw["sameAs"] = [f"https://github.com/{a['github']}"]
        jsonld = [sw, crumbs(("Omarchy Store", "/"), (c, f"/category/{a['category']}/"), (a["name"], f"/app/{a['id']}/"))]
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
                + ("".join(f'<img src="{e(s)}" alt="{e(a["name"])} screenshot {i+1}" loading="lazy" width="624" height="351">' for i, s in enumerate(a["screenshots"][:3])) if a.get("screenshots") else "")
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

    # ---- Other pages
    simple = {
        "/charts/": ("Top Charts – Most Popular Omarchy Apps | Omarchy Store",
                     f"The {len(apps)} most popular apps for Omarchy Linux, ranked by GitHub stars and updated weekly.",
                     '<h1 class="page-title">Top Charts</h1><ol class="ssr-list">' + "".join(app_li(a) for a in apps[:100]) + "</ol>"),
        "/categories/": ("App Categories | Omarchy Store", "Browse Omarchy Linux apps by category.",
                         '<h1 class="page-title">Categories</h1><ul>' + "".join(f'<li><a href="/category/{c["id"]}/">{e(c["name"])}</a></li>' for c in cats) + "</ul>"),
        "/legal/": ("Disclaimer | Omarchy Store", "Omarchy Store lists third-party software provided as-is, without warranty. Read the full disclaimer.",
                    '<h1 class="page-title">Disclaimer</h1>'),
        "/get-desktop/": ("Get the Omarchy Store Desktop App | Omarchy Store",
                          "Install the Omarchy Store desktop app for one-click installs on Omarchy Linux.",
                          '<h1 class="page-title">Get the desktop app</h1><pre><code>curl -fsSL https://omarchystore.com/install.sh | bash</code></pre>'),
    }
    for path, (t, d, b) in simple.items():
        write(path, render(template, head(t, d, path, f"{SITE}/assets/og-default.png", "Omarchy Store", [org]), b))
        urls.append((f"{SITE}{path}", now, "0.5" if path in ("/legal/",) else "0.6"))

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
        f.write(f"User-agent: *\nAllow: /\nDisallow: /search/\nDisallow: /api/\nDisallow: /desktop-files/\n\nSitemap: {SITE}/sitemap.xml\n")
    print(f"✓ SEO: {len(urls)} pages + sitemap.xml + robots.txt → {OUT}")


if __name__ == "__main__":
    main()
