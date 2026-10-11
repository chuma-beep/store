"""Check GET/VIEW ordering: Discover plugin shelf, Plugins page (all filters), Screensavers page, search results.
Prints the sequence of button labels and fails if any VIEW appears before a GET."""
import sys, asyncio, subprocess, time
from playwright.async_api import async_playwright
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8831"

async def labels(pg, sel):
    return await pg.evaluate("s => [...document.querySelectorAll(s)].map(e => e.textContent.trim()).filter(t => t === 'GET' || t === 'VIEW' || t === 'ADDED')", sel)

def ok(seq):
    seen_view = False
    for t in seq:
        if t == "VIEW": seen_view = True
        elif seen_view: return False
    return True

async def main():
    p = subprocess.Popen(["chromium", "--headless=new", "--disable-gpu", "--remote-debugging-port=9443", "--user-data-dir=/tmp/shot-prof4"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(3); bad = 0
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.connect_over_cdp("http://127.0.0.1:9443")
            pg = await (await b.new_context(viewport={"width": 1300, "height": 900})).new_page()
            checks = [("/", ".plug-row .plug-card .get, .plug-row .plug-card .ghosty", "Discover plugin shelf"),
                      ("/plugins/", "#pgrid .get, #pgrid .ghosty", "Plugins page (popular)"),
                      ("/screensavers/", "#sgrid .get, #sgrid .ghosty", "Screensavers page"),
                      ("/search/bar/", ".plug-card .get, .plug-card .ghosty", "Search 'bar' plugins")]
            for path, sel, name in checks:
                await pg.goto(BASE + path, wait_until="domcontentloaded"); await pg.wait_for_timeout(9000)
                if path.startswith("/search/"):  # plugins load after the page: give the shelf time to appear
                    for _ in range(10):
                        if await pg.locator(".plug-card").count(): break
                        await pg.wait_for_timeout(1500)
                seq = await labels(pg, sel)
                good = ok(seq) and len(seq) > 0
                bad += not good
                print(("  ✓ " if good else "  ✗ ") + name, f"{len(seq)} buttons: GET×{seq.count('GET')} VIEW×{seq.count('VIEW')}", "" if good else seq[:30])
            # plugins page: click Show more a few times and re-check
            await pg.goto(BASE + "/plugins/", wait_until="domcontentloaded"); await pg.wait_for_timeout(9000)
            for _ in range(3):
                m = pg.locator("[data-plug-more]")
                if await m.count(): await m.first.click(); await pg.wait_for_timeout(1500)
            seq = await labels(pg, "#pgrid .get, #pgrid .ghosty"); good = ok(seq); bad += not good
            print(("  ✓ " if good else "  ✗ ") + "Plugins page after Show more ×3", f"GET×{seq.count('GET')} VIEW×{seq.count('VIEW')}")
    finally:
        p.terminate()
    print("FAIL" if bad else "ALL OK"); sys.exit(1 if bad else 0)

asyncio.run(main())
