"""Full-length phone screenshots of one page, sliced for review. Usage: phone_shot.py URL NAME [width]"""
import asyncio, sys, subprocess
from playwright.async_api import async_playwright

async def main(url, name, width=375):
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox"])
        ctx = await br.new_context(viewport={"width": width, "height": 800}, device_scale_factor=2, is_mobile=True, has_touch=True,
                                   user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")
        pg = await ctx.new_page()
        await pg.goto(url, wait_until="domcontentloaded", timeout=60000); await pg.wait_for_timeout(6000)
        h = await pg.evaluate("document.documentElement.scrollHeight")
        await pg.set_viewport_size({"width": width, "height": min(h, 12000)})
        await pg.wait_for_timeout(1500)
        out = f"/tmp/{name}-full.png"
        await pg.screenshot(path=out, full_page=True)
        await br.close()
    # slice into phone-screen chunks at 1x
    subprocess.run(["magick", out, "-resize", "50%", "-crop", f"{width}x900", "+repage", f"/tmp/{name}-%02d.png"])
    print(out, "height", h)

asyncio.run(main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 375))
