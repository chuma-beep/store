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
  const h = [...document.querySelectorAll(".shelf h2")].find((h) => h.textContent.trim() === "Screensavers");
  if (!h) return "no Screensavers shelf";
  const cards = [...h.closest(".shelf").querySelectorAll(".get")].map((b) => b.textContent.trim());
  const names = [...h.closest(".shelf").querySelectorAll(".name")].map((n) => n.textContent.trim());
  return { cards: cards.length, GET: cards.filter((c) => c === "GET" || c === "ADDED").length, VIEW: cards.filter((c) => c === "VIEW").length, names };
})()` });
console.log(JSON.stringify(r.result.value));
process.exit(0);
