// Check: listing icon, gallery (whole pictures, arrows, dots), lightbox arrows, version badge.
import { writeFileSync } from "fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = process.argv[2];
const tabs = await (await fetch("http://127.0.0.1:9346/json")).json();
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = {};
const send = (m, p = {}) => new Promise((res) => { const i = ++id; wait[i] = res; ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait[d.id]) { wait[d.id](d.result || d.error); delete wait[d.id]; } };
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.value;
const shot = async (f) => { const s = await send("Page.captureScreenshot", { format: "png" }); writeFileSync(f, Buffer.from(s.data, "base64")); };
await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: "about:blank" }); await sleep(300);
await send("Page.navigate", { url: base + "/app/omarchy-store/?t=" + Date.now() }); await sleep(7000);
console.log("badge:", await ev(`document.querySelector('#mode-badge')?.innerText.replace(/\\s+/g,' ')`));
console.log("gallery:", JSON.stringify(await ev(`(() => { const imgs = [...document.querySelectorAll('#shots img')];
  return { pictures: imgs.length, arrows: document.querySelectorAll('.g-nav').length, dots: document.querySelectorAll('.g-dots i').length,
    cropped: imgs.filter(i => i.complete && Math.abs(i.getBoundingClientRect().width / i.getBoundingClientRect().height - i.naturalWidth / i.naturalHeight) > 0.02).length }; })()`)));
await ev(`document.querySelector('#shots').scrollIntoView({block:'center'})`); await sleep(800);
await shot("/tmp/gal-1.png");
await ev(`document.querySelector('.g-next').click()`); await sleep(1200);
console.log("after next: dot on =", await ev(`[...document.querySelectorAll('.g-dots i')].findIndex(d => d.classList.contains('on'))`));
await shot("/tmp/gal-2.png");
await ev(`document.querySelector('#shots img').click()`); await sleep(800);
await ev(`document.querySelector('.lb-next')?.click()`); await sleep(800);
console.log("lightbox:", await ev(`document.querySelector('#lb-count')?.textContent`));
await shot("/tmp/gal-lb.png");
process.exit(0);
