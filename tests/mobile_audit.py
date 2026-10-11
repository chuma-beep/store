"""Mobile audit for omarchystore.com: loads pages at phone sizes, reports every element wider than the screen,
and saves screenshots. Usage: mobile_audit.py [base_url] (default https://omarchystore.com)"""
import asyncio, sys, json, os
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://omarchystore.com"
PAGES = ["/", "/ignite/", "/get-omarchy/", "/app/snapdock/", "/themes/", "/app/obsidian/", "/plugins/", "/submit", "/category/ai/", "/charts/", "/theme/retropc/"]
PHONES = [("iphone-se", 375, 667), ("small-android", 360, 740)]
OUT = "/tmp/mobile-audit"; os.makedirs(OUT, exist_ok=True)

JS = """() => {
  const W = document.documentElement.clientWidth, bad = [];
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || getComputedStyle(el).visibility === 'hidden') continue;
    if (r.right > W + 1 || r.left < -1) {
      // skip children of horizontal scrollers (those are meant to scroll sideways)
      let p = el.parentElement, scroller = false;
      while (p && p !== document.body) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) || s.overflowX === 'hidden') { scroller = true; break; } p = p.parentElement; }
      if (scroller) continue;
      const txt = (el.innerText || el.alt || '').trim().slice(0, 50).replace(/\\s+/g, ' ');
      bad.push({tag: el.tagName.toLowerCase(), cls: (el.className && el.className.baseVal === undefined ? el.className : '').toString().slice(0, 40),
                right: Math.round(r.right), w: Math.round(r.width), txt});
    }
  }
  // text that is cut off inside its own box (overflow hidden / ellipsis)
  const clipped = [];
  for (const el of document.querySelectorAll('h1,h2,h3,h4,p,a,span,b,div,li,button,code,pre,td')) {
    if (!el.offsetParent || el.children.length > 3) continue;
    const s = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 2 && /(hidden|clip)/.test(s.overflowX) && (el.innerText||'').trim().length > 3)
      clipped.push({tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0,40), w: el.clientWidth, need: el.scrollWidth, txt: el.innerText.trim().slice(0,50).replace(/\s+/g,' ')});
  }
  return {W, scrollW: document.documentElement.scrollWidth, bad: bad.slice(0, 15), clipped: clipped.slice(0, 15)};
}"""

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
        report = {}
        for name, w, h in PHONES:
            ctx = await br.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                       user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")
            pg = await ctx.new_page()
            for path in PAGES:
                try:
                    await pg.goto(BASE + path, wait_until="networkidle", timeout=45000)
                except Exception:
                    await pg.wait_for_timeout(3000)
                await pg.wait_for_timeout(1500)
                r = await pg.evaluate(JS)
                key = f"{name} {path}"
                report[key] = r
                flag = "OVERFLOW" if r["scrollW"] > r["W"] + 1 or r["bad"] else ("CLIPPED" if r["clipped"] else "ok")
                print(f"{flag:8} {key:32} page={r['scrollW']}px screen={r['W']}px  offenders={len(r['bad'])}")
                for b in r["bad"][:5]: print(f"           -> <{b['tag']} .{b['cls']}> right={b['right']} w={b['w']} '{b['txt']}'")
                for b in r["clipped"][:6]: print(f"           ~> clipped <{b['tag']} .{b['cls']}> shows {b['w']}px of {b['need']}px '{b['txt']}'")
                if name == "iphone-se":
                    await pg.screenshot(path=f"{OUT}/{path.strip('/').replace('/', '_') or 'home'}.png", full_page=True)
            await ctx.close()
        json.dump(report, open(f"{OUT}/report.json", "w"), indent=1)
        await br.close()

asyncio.run(main())
