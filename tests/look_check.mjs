// For each look (dark/glass/white): open a page, scroll the sidebar to the bottom, screenshot.
// Usage: node tests/look_check.mjs <base url> <path> <width> <height>
import { writeFileSync } from "fs";
const [base, path = "/charts/", W = "1280", H = "768"] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs;
for (let i = 0; i < 60; i++) { try { tabs = await (await fetch("http://127.0.0.1:9346/json")).json(); break; } catch { await sleep(500); } }
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = {};
const send = (m, p = {}) => new Promise((res) => { const i = ++id; wait[i] = res; ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait[d.id]) { wait[d.id](d.result || d.error); delete wait[d.id]; } };
await send("Emulation.setDeviceMetricsOverride", { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
for (const look of ["dark", "glass", "white"]) {
  await send("Emulation.setDeviceMetricsOverride", { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: base + path });
  await sleep(5000);
  const clicked = (await send("Runtime.evaluate", { returnByValue: true, expression: `(() => { const b = document.querySelector('.look-switch [data-look="${look}"]'); if (!b) return "no switch (width " + innerWidth + ")"; b.click(); return "ok"; })()` })).result.value;
  if (clicked !== "ok") console.log(look, clicked);
  await sleep(800);
  // Overlap shows while the menu is scrolled PART way (at the very bottom nothing is under the panel), so test several positions.
  const scan = (await send("Runtime.evaluate", { returnByValue: true, awaitPromise: true, expression: `(async () => {
    const sb = document.querySelector(".sidebar"), out = [];
    for (const y of [0, 150, 300, 450, 1e6]) {
      sb.scrollTop = y; await new Promise((r) => setTimeout(r, 120));
      const foot = document.querySelector(".side-foot").getBoundingClientRect();
      // a link counts as "showing through" if its text is under the panel AND the panel isn't covering it
      const under = [...sb.querySelectorAll("nav a")].filter((a) => { const r = a.getBoundingClientRect(); return r.bottom > foot.top + 2 && r.top < foot.bottom - 2; });
      const hit = under.filter((a) => { const r = a.getBoundingClientRect(); const x = r.left + 40, yy = Math.min(Math.max(r.top + r.height / 2, foot.top + 3), foot.bottom - 3);
        const el = document.elementFromPoint(x, yy); return el && a.contains(el); });
      out.push({ y, under: under.length, visibleThrough: hit.length, footTop: Math.round(foot.top), footBottom: Math.round(foot.bottom), view: innerHeight });
    }
    sb.scrollTop = 300; return out;
  })()` })).result.value;
  console.log(look, JSON.stringify(scan));
  await sleep(400);
  const r = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
    // does any GET button sit within 4px of its row's right edge, or poke outside it?
    const bad = [...document.querySelectorAll(".chart .lockup")].slice(0, 30).filter((row) => {
      const g = row.querySelector(".get"); if (!g) return false;
      const a = row.getBoundingClientRect(), b = g.getBoundingClientRect(); return b.right > a.right - 4;
    }).length;
    // is any sidebar link visible underneath the bottom panel?
    const foot = document.querySelector(".side-foot").getBoundingClientRect();
    const under = [...document.querySelectorAll(".sidebar nav a")].filter((a) => { const r = a.getBoundingClientRect(); return r.bottom > foot.top + 2 && r.top < foot.bottom; }).length;
    const bg = getComputedStyle(document.querySelector(".side-foot")).backgroundColor;
    return { look: document.documentElement.dataset.look, getsTouchingEdge: bad, linksUnderPanel: under, panelBg: bg };
  })()` });
  console.log(JSON.stringify(r.result.value));
  const s = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`/tmp/lk-${look}.png`, Buffer.from(s.data, "base64"));
}
process.exit(0);
