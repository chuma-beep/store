"""Find content that is cut off on phones inside the store's scrolling <main> (which hides sideways overflow),
and take a full-length screenshot of <main>. Usage: phone_check.py URL NAME [width]"""
import asyncio, sys, subprocess
from playwright.async_api import async_playwright

JS = """() => {
  const m = document.querySelector('main'); const mr = m.getBoundingClientRect();
  const out = [];
  for (const el of m.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !el.offsetParent) continue;
    // ignore things inside sideways scrollers (meant to swipe)
    let p = el.parentElement, sc = false;
    while (p && p !== m) { if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) { sc = true; break; } p = p.parentElement; }
    if (sc) continue;
    if (r.right > mr.right + 1) {
      const parentOver = el.parentElement && el.parentElement.getBoundingClientRect().right > mr.right + 1;
      if (parentOver && el.parentElement !== m) continue;          // report outermost only
      out.push({tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 45), over: Math.round(r.right - mr.right),
                w: Math.round(r.width), txt: (el.innerText || '').trim().slice(0, 60).replace(/\\s+/g, ' ')});
    }
  }
  return {mainW: Math.round(mr.width), contentW: m.scrollWidth, h: m.scrollHeight, out: out.slice(0, 25)};
}"""

async def main(url, name, width=375):
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
        ctx = await br.new_context(viewport={"width": width, "height": 800}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                   user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")
        pg = await ctx.new_page()
        await pg.goto(url, wait_until="domcontentloaded", timeout=60000); await pg.wait_for_timeout(6000)
        r = await pg.evaluate(JS)
        print(f"{name} @{width}px: main={r['mainW']}px content={r['contentW']}px height={r['h']}px  cut-off items={len(r['out'])}")
        for o in r["out"]: print(f"   +{o['over']}px <{o['tag']} .{o['cls']}> w={o['w']} '{o['txt']}'")
        # full-length screenshot: let <main> grow so the page itself is tall
        await pg.add_style_tag(content="html,body{height:auto!important;overflow:visible!important} .app,#app,body>div{height:auto!important;overflow:visible!important} main{overflow:visible!important;height:auto!important;max-height:none!important}")
        await pg.wait_for_timeout(800)
        out = f"/tmp/{name}-full.png"
        await pg.screenshot(path=out, full_page=True)
        await br.close()
    subprocess.run(f"rm -f /tmp/{name}-[0-9]*.png", shell=True)
    subprocess.run(["magick", out, "-resize", "50%", "-crop", f"{width}x900", "+repage", f"/tmp/{name}-%02d.png"])

asyncio.run(main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 375))
