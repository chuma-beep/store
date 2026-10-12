// Full sweep: every important page, on a given base URL, at laptop size, in Dark/Glass/White.
// Reports per page: JS errors, broken images, VIEW buttons on Discover, rows missing arrows, "page doesn't exist".
import { writeFileSync } from "fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = process.argv[2], tag = process.argv[3] || "x";
const PAGES = ["/", "/charts/", "/categories/", "/themes/", "/plugins/", "/screensavers/", "/get-omarchy/", "/ignite/",
  "/app/omarchy-store/", "/app/snapdock/", "/app/lifeboat/", "/app/rabbit-ears/", "/get-desktop/", "/contact/", "/legal/", "/category/utilities/"];
const tabs = await (await fetch("http://127.0.0.1:9346/json")).json();
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = {}; let errs = [];
const send = (m, p = {}) => new Promise((res) => { const i = ++id; wait[i] = res; ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = (m) => { const d = JSON.parse(m.data);
  if (d.id && wait[d.id]) { wait[d.id](d.result || d.error); delete wait[d.id]; return; }
  if (d.method === "Runtime.exceptionThrown") errs.push((d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).split("\n")[0].slice(0, 160)); };
await send("Runtime.enable");
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.value;
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
const problems = [];
for (const look of ["dark", "glass", "white"]) {
  for (const p of PAGES) {
    errs = [];
    await send("Page.navigate", { url: "about:blank" }); await sleep(200);
    await send("Page.navigate", { url: base + p + "?t=" + Date.now() }); await sleep(5500);
    await ev(`(() => { const b = document.querySelector('.look-switch [data-look="${look}"]'); if (b) b.click(); })()`);
    // scroll through the page so lazy images load
    await ev(`(async () => { const v = document.querySelector('#view'); for (let y = 0; y < v.scrollHeight; y += 700) { v.scrollTop = y; await new Promise(r => setTimeout(r, 120)); } v.scrollTop = 0; })()`);
    await sleep(1500);
    const r = await ev(`(() => {
      const text = document.querySelector('#view')?.innerText || '';
      const imgs = [...document.querySelectorAll('#view img')].filter(i => i.complete && i.naturalWidth === 0 && i.getAttribute('src'));
      const view = location.pathname === '/' ? [...document.querySelectorAll('#view .get')].filter(b => b.textContent.trim() === 'VIEW').length : 0;
      const noArrow = [...document.querySelectorAll('#view .scroller, #view .spot-row')].filter(sc => sc.id !== 'shots' && sc.scrollWidth - sc.clientWidth > 5 && !sc.closest('.rowwrap')).length;
      return { notFound: /doesn.t exist|Couldn.t load/.test(text), broken: imgs.map(i => i.getAttribute('src').slice(0, 70)).slice(0, 4), view, noArrow, look: document.documentElement.dataset.look };
    })()`);
    const issues = [];
    if (errs.length) issues.push("JS error: " + errs[0]);
    if (r.notFound) issues.push("page shows an error / not found");
    if (r.broken.length) issues.push("broken images: " + r.broken.join(", "));
    if (r.view) issues.push(r.view + " VIEW buttons on Discover");
    if (r.noArrow) issues.push(r.noArrow + " sideways rows without arrows");
    if (r.look !== look) issues.push("look switch didn't apply");
    console.log(`${tag} ${look.padEnd(5)} ${p.padEnd(22)} ${issues.length ? "PROBLEM: " + issues.join(" | ") : "ok"}`);
    if (issues.length) problems.push({ look, p, issues });
    if (look === "glass" && ["/", "/app/omarchy-store/"].includes(p)) {
      const s = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(`/tmp/sweep-${tag}-${p.replace(/\W+/g, "_")}.png`, Buffer.from(s.data, "base64"));
    }
  }
}
console.log(`${tag} SUMMARY: ${problems.length} problem(s) across ${PAGES.length * 3} page views`);
process.exit(0);
