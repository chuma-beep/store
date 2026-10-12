// Reproduce the owner's window (2534 x 1290) and report every horizontal row whose content is cut off,
// whether it can be scrolled with the mouse (visible scrollbar or arrow buttons), and how wide the page is.
import { writeFileSync } from "fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [base, path = "/", W = "2534", H = "1290"] = process.argv.slice(2);
const tabs = await (await fetch("http://127.0.0.1:9346/json")).json();
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = {};
const send = (m, p = {}) => new Promise((res) => { const i = ++id; wait[i] = res; ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait[d.id]) { wait[d.id](d.result || d.error); delete wait[d.id]; } };
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true })).result?.value;
await send("Emulation.setDeviceMetricsOverride", { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "about:blank" }); await sleep(300);
await send("Page.navigate", { url: base + path + (path.includes("?") ? "&" : "?") + "t=" + Date.now() }); await sleep(8000);
const r = await ev(`(() => {
  const page = document.querySelector('#view .page')?.getBoundingClientRect();
  const rows = [...document.querySelectorAll('#view .scroller, #view .spot-row')].map((s) => {
    const sec = s.closest('section')?.querySelector('h2')?.textContent.trim() || (s.classList.contains('spot-row') ? 'Billboards' : s.className);
    const cut = s.scrollWidth - s.clientWidth;
    const st = getComputedStyle(s);
    const hasArrows = !!s.parentElement.querySelector('.row-nav, .g-nav');
    return { row: sec.slice(0, 40), hiddenPx: cut, scrollbarHidden: st.scrollbarWidth === 'none', arrows: hasArrows };
  }).filter((x) => x.hiddenPx > 4);
  return { window: innerWidth, pageLeft: Math.round(page.left), pageWidth: Math.round(page.width), rowsWithHiddenContent: rows };
})()`);
console.log(JSON.stringify(r, null, 1));
const s = await send("Page.captureScreenshot", { format: "png" });
writeFileSync("/tmp/scale.png", Buffer.from(s.data, "base64"));
process.exit(0);
