// Count GET vs VIEW buttons in the Discover "Screensavers" shelf.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const base = process.argv[2] || "http://127.0.0.1:8794";
const tabs = await (await fetch("http://127.0.0.1:9346/json")).json();
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = {};
const send = (m, p = {}) => new Promise((res) => { const i = ++id; wait[i] = res; ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait[d.id]) { wait[d.id](d.result || d.error); delete wait[d.id]; } };
await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: base + "/?t=" + Date.now() });
await sleep(8000);
const r = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
  const out = {};
  for (const h of [...document.querySelectorAll(".shelf h2")]) {
  const cards = [...h.closest(".shelf").querySelectorAll(".get")].map((b) => b.textContent.trim());
  const names = [...h.closest(".shelf").querySelectorAll(".name")].map((n) => n.textContent.trim());
  const v = cards.filter((c) => c === "VIEW").length;
  out[h.textContent.trim()] = { buttons: cards.length, VIEW: v, viewItems: names.filter((_, i) => cards[i] === "VIEW").slice(0, 5) };
  }
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x.buttons));
})()` });
console.log(JSON.stringify(r.result.value));
process.exit(0);
