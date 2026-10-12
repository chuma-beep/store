// Rows test at several window sizes: every row with hidden content must have a working › button;
// clicking › must move the row; billboard dots must still work; no JS errors; screenshot each size.
import { writeFileSync } from "fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = process.argv[2], path = process.argv[3] || "/";
const sizes = [[2534, 1290, "big"], [1440, 900, "laptop"], [390, 844, "phone"]];
const tabs = await (await fetch("http://127.0.0.1:9346/json")).json();
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = {}; const errs = [];
const send = (m, p = {}) => new Promise((res) => { const i = ++id; wait[i] = res; ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = (m) => { const d = JSON.parse(m.data);
  if (d.id && wait[d.id]) { wait[d.id](d.result || d.error); delete wait[d.id]; return; }
  if (d.method === "Runtime.exceptionThrown") errs.push((d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).split("\n")[0]); };
await send("Runtime.enable");
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.value;
for (const [W, H, name] of sizes) {
  errs.length = 0;
  await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: name === "phone" });
  await send("Page.navigate", { url: "about:blank" }); await sleep(300);
  await send("Page.navigate", { url: base + path + "?t=" + Date.now() }); await sleep(8000);
  const r = await ev(`(async () => {
    const rows = [...document.querySelectorAll('#view .rowwrap')];
    const out = { rows: rows.length, needArrows: 0, haveArrow: 0, moved: 0, pageWidth: Math.round(document.querySelector('#view .page').getBoundingClientRect().width) };
    for (const w of rows) {
      const sc = w.querySelector('.scroller, .spot-row'); if (sc.scrollWidth - sc.clientWidth < 5) continue;
      out.needArrows++;
      const nx = w.querySelector('.row-next');
      if (nx && !nx.hidden && getComputedStyle(nx).display !== 'none') { out.haveArrow++; const b = sc.scrollLeft; nx.click(); await new Promise(r => setTimeout(r, 700)); if (sc.scrollLeft > b) out.moved++; sc.scrollLeft = 0; }
    }
    const dots = document.querySelectorAll('.spot-dots i');
    if (dots.length > 1) { dots[1].click(); await new Promise(r => setTimeout(r, 900)); out.dotsWork = document.querySelector('.spot-row').scrollLeft > 10 && dots[1].classList.contains('on'); document.querySelector('.spot-row').scrollLeft = 0; }
    return out; })()`);
  await sleep(500);
  console.log(name, W + "x" + H, JSON.stringify(r), "errors:", errs.length ? errs.join(" | ") : "none");
  const s = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`/tmp/rows-${name}.png`, Buffer.from(s.data, "base64"));
}
process.exit(0);
