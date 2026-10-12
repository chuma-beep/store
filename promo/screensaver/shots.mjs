// Screenshot the screensaver preview in several palettes after it has animated for a few real seconds.
import { writeFileSync } from "fs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tabs = await (await fetch("http://127.0.0.1:9346/json")).json();
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = {};
const send = (m, p = {}) => new Promise((res) => { const i = ++id; wait[i] = res; ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait[d.id]) { wait[d.id](d.result || d.error); delete wait[d.id]; } };
await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
for (const p of process.argv.slice(2)) {
  await send("Page.navigate", { url: "about:blank" }); await sleep(300);   // force a fresh page load, not just a #hash change
  await send("Page.navigate", { url: "file:///home/nemoclawai/omarchy-store/promo/screensaver/preview.html#" + p });
  await sleep(5000);
  const s = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`/tmp/ss-${p}.png`, Buffer.from(s.data, "base64"));
  console.log("shot", p);
}
process.exit(0);
