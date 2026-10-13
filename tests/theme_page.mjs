// Screenshot the Omarchy Store theme page and report which preview image URL it shows.
// Usage: node tests/theme_page.mjs <base-url> <tag>
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const [base, tag] = process.argv.slice(2);
const port = 9352;
const ch = spawn("chromium", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/tp-prof-${tag}`, "--disk-cache-size=1", "--window-size=1600,1000", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = {};
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) { pend[m.id](m.result); delete pend[m.id]; } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: base + "/theme/omarchy-store/" });
await sleep(7000);
const r = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => ({ h1: document.querySelector("h1")?.textContent, imgs: [...document.querySelectorAll("img")].map((i) => i.src).filter((s) => /omarchy-store/.test(s)).slice(0, 3), btn: document.querySelector(".actions .get, .actions button")?.textContent, loaded: [...document.querySelectorAll("img")].filter((i) => /theme-previews\\/omarchy-store/.test(i.src)).map((i) => i.naturalWidth) }))()` });
console.log(JSON.stringify(r.result.value));
const s = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(`/tmp/tp-${tag}.png`, Buffer.from(s.data, "base64"));
ch.kill(); process.exit(0);
