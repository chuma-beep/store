// Preview check: Discover (Glass default, our theme + screensaver first), Screensavers page, Themes page,
// screensaver plugin page. Live JSON URLs are redirected to the local files so unpublished data can be checked.
// Usage: node tests/ours_check.mjs <base-url> <tag> [local]
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const [base, tag, local] = process.argv.slice(2);
const port = 9351;
const ch = spawn("chromium", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/ours-prof-${tag}`, "--disk-cache-size=1", "--window-size=1600,1000", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);
const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = {}; const errs = [];
ws.onmessage = async (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend[m.id]) { pend[m.id](m.result || m.error); delete pend[m.id]; }
  if (m.method === "Runtime.exceptionThrown") errs.push(m.params.exceptionDetails.exception?.description?.slice(0, 160));
  if (m.method === "Fetch.requestPaused") {
    const u = m.params.request.url;
    const f = u.includes("/data/screensavers.json") ? "screensavers.json" : "plugins.json";
    send("Fetch.continueRequest", { requestId: m.params.requestId, url: `${base}/${f}` });
  }
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
if (local) await send("Fetch.enable", { patterns: [{ urlPattern: "https://raw.githubusercontent.com/omarchy-community/store/data/*" }] });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.value;
const out = {};
for (const [name, path] of [["discover", "/"], ["savers", "/screensavers/"], ["themes", "/themes/"], ["plugin", "/plugin/omarchy-store-screensaver/"]]) {
  await send("Page.navigate", { url: base + path });
  await sleep(7000);
  out[name] = await ev(`(() => {
    const look = document.documentElement.dataset.look;
    const h = [...document.querySelectorAll(".shelf")].map((s) => [s.querySelector("h2")?.textContent, [...s.querySelectorAll(".plug-card .name, .theme-card .name, .th-card .name, .theme-card b")].slice(0, 3).map((n) => n.textContent.trim())]);
    const grid = [...document.querySelectorAll("#sgrid .plug-card .name, #tgrid .name, .theme-grid .name")].slice(0, 3).map((n) => n.textContent.trim());
    const firstSaverBtn = document.querySelector("#sgrid .plug-card .get, .shelf .plug-row .plug-card .get")?.textContent;
    const h1 = document.querySelector("h1")?.textContent;
    const btn = document.querySelector(".actions .get")?.textContent;
    return { look, h1, btn, firstSaverBtn, grid, shelves: h.filter((x) => /Screensaver|Theme/i.test(x[0] || "")) };
  })()`);
  const s = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`/tmp/ours-${tag}-${name}.png`, Buffer.from(s.data, "base64"));
}
console.log(JSON.stringify(out, null, 1));
console.log("errors:", errs.length ? errs : "none");
ch.kill(); process.exit(0);
