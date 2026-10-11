"""One banner design, every size. Writes promo/og/banner-<name>.html and renders PNGs.
Design: full-bleed wall of real Omarchy theme screenshots, dark glow behind centered text,
big OMARCHY STORE pixel wordmark, slogan, omarchystore.com pill. No bag logo (the profile photo is the logo).
Usage: python banners.py   -> renders x, youtube, og into ~/omarchy-social/brand/"""
import os, subprocess
OG = os.path.expanduser("~/omarchy-store/promo/og")
OUT = os.path.expanduser("~/omarchy-social/brand")

# name: canvas w,h ; text box (cx, cy, width) ; sizes (wordmark, h1, sub, pill) ; wall tile columns
SIZES = {
    "x":       dict(w=1500, h=500,  cx=750,  cy=250, bw=900,  wm=68, h1=76,  sub=31, pill=32, cols=7, glow=(760, 330)),
    # YouTube: only the centre 1546x423 shows on every device, so the text lives there
    "youtube": dict(w=2560, h=1440, cx=1280, cy=720, bw=1500, wm=56, h1=84, sub=34, pill=34, cols=9, glow=(1100, 420)),
    "og":      dict(w=1200, h=630,  cx=600,  cy=315, bw=1100, wm=64, h1=80,  sub=32, pill=32, cols=6, glow=(680, 400)),
}
THEMES = ["omarchy-lumon-theme", "aetheria", "miasma", "osaka-jade", "copper-night", "retropc", "aamis",
          "void", "felix", "blackturq", "mecha-no-onna", "rose-pine-dark"]

def html(s):
    rows = max(6, int(s["cols"] * s["h"] / s["w"] * 1.6) + 4)   # taller canvases need more rows to fill the bottom
    n = s["cols"] * rows
    imgs = "".join(f'<img src="t/{THEMES[(i * 5 + i // s["cols"]) % len(THEMES)]}.jpg">' for i in range(n))
    gw, gh = s["glow"]
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{width:{s['w']}px;height:{s['h']}px;overflow:hidden;font-family:"Adwaita Sans","Inter","Noto Sans",sans-serif;color:#fff;-webkit-font-smoothing:antialiased;background:#111118;position:relative}}
.wall{{position:absolute;left:-{s['w']*0.1:.0f}px;top:-{s['h']*0.35:.0f}px;width:{s['w']*1.25:.0f}px;display:grid;grid-template-columns:repeat({s['cols']},1fr);gap:{s['w']/95:.0f}px;transform:rotate(-8deg);opacity:.9}}
.wall img{{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:{s['w']/150:.0f}px;box-shadow:0 14px 30px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.08)}}
.glow{{position:absolute;inset:0;background:radial-gradient({s['w']*.47:.0f}px {s['h']*.8:.0f}px at 83% 16%, rgba(157,124,242,.28), transparent 60%),radial-gradient({s['w']*.4:.0f}px {s['h']*.8:.0f}px at 10% 90%, rgba(158,206,106,.18), transparent 60%)}}
.shade{{position:absolute;inset:0;background:radial-gradient({gw}px {gh}px at {s['cx']}px {s['cy']}px, rgba(14,14,21,.95) 0%, rgba(14,14,21,.88) 50%, rgba(14,14,21,.35) 80%, rgba(14,14,21,0) 100%),linear-gradient(rgba(14,14,21,.25),rgba(14,14,21,.25))}}
.box{{position:absolute;left:{s['cx'] - s['bw']/2:.0f}px;top:0;width:{s['bw']}px;height:100%;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center}}
.box.y{{top:{s['cy'] - s['h']/2:.0f}px}}
.wm{{display:flex;gap:{s['wm']*.38:.0f}px;align-items:center;margin-bottom:{s['wm']*.32:.0f}px}}
.wm img{{height:{s['wm']}px;image-rendering:pixelated}}
h1{{font-size:{s['h1']}px;line-height:1.0;font-weight:800;letter-spacing:-{s['h1']/38:.1f}px}}
h1 span{{color:#9ece6a}}
.sub{{font-size:{s['sub']}px;color:rgba(255,255,255,.9);margin-top:{s['sub']*.5:.0f}px;font-weight:600}}
.url{{display:inline-block;margin-top:{s['pill']*.56:.0f}px;font-size:{s['pill']}px;font-weight:800;color:#111118;background:#9ece6a;padding:{s['pill']*.31:.0f}px {s['pill']*1.06:.0f}px;border-radius:{s['pill']*1.3:.0f}px}}
</style></head><body>
<div class="wall">{imgs}</div><div class="glow"></div><div class="shade"></div>
<div class="box"><div class="wm"><img src="wordmark-omarchy.svg"><img src="wordmark-store.svg"></div>
<h1>The largest <span>Omarchy</span><br>app store on Earth.</h1>
<div class="sub">Apps, themes and plugins. One click each. Free.</div>
<div class="url">omarchystore.com</div></div>
</body></html>"""

if __name__ == "__main__":
    for name, s in SIZES.items():
        f = f"{OG}/banner-{name}.html"
        open(f, "w").write(html(s))
        png = f"{OUT}/banner-{name}.png"
        subprocess.run(["chromium", "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={s['w']},{s['h']}",
                        "--virtual-time-budget=3000", f"--screenshot={png}", f"file://{f}"], capture_output=True)
        subprocess.run(["magick", png, "-quality", "92", png.replace(".png", ".jpg")])
        print(name, png)
