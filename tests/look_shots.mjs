// Screenshot the store in each appearance (Dark / Glass / White) via CDP on :9343.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs;
for (let i = 0; i < 60; i++) { try { tabs = await (await fetch("http://127.0.0.1:9343/json")).json(); break; } catch { await sleep(500); } }
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = {};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; wait[i] = res; ws.send(JSON.stringify({ id: i, method, params })); });
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && wait[d.id]) { wait[d.id](d.result || d.error); delete wait[d.id]; } };
const fs = await import("fs");
await send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
const path = process.argv[2] || "/";
for (const look of ["dark", "glass", "white"]) {
  await send("Page.navigate", { url: "http://127.0.0.1:8794/" });
  await sleep(1500);
  await send("Runtime.evaluate", { expression: `localStorage.setItem("os-look2","${look}")` });
  await send("Page.navigate", { url: "http://127.0.0.1:8794" + path });
  await sleep(6000);
  const s = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(`/tmp/look-${look}${path.replace(/\W+/g, "_")}.png`, Buffer.from(s.data, "base64"));
  console.log("shot", look);
}
process.exit(0);
