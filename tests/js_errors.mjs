// Load a store URL in headless chromium (CDP :9345) and report JS errors + whether the catalog rendered.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tabs;
for (let i = 0; i < 60; i++) { try { tabs = await (await fetch("http://127.0.0.1:9345/json")).json(); break; } catch { await sleep(500); } }
const ws = new WebSocket(tabs.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const wait = {}; const errs = [];
const send = (m, p = {}) => new Promise((res) => { const i = ++id; wait[i] = res; ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.onmessage = (m) => { const d = JSON.parse(m.data);
  if (d.id && wait[d.id]) { wait[d.id](d.result || d.error); delete wait[d.id]; return; }
  if (d.method === "Runtime.exceptionThrown") { const e = d.params.exceptionDetails; errs.push((e.exception?.description || e.text).split("\n").slice(0, 3).join(" | ") + ` @${e.url?.split("/").pop()}:${e.lineNumber}`); }
  if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errs.push("console: " + d.params.args.map((a) => a.value || a.description).join(" ").slice(0, 300)); };
await send("Runtime.enable");
for (const url of process.argv.slice(2)) {
  errs.length = 0;
  await send("Page.navigate", { url });
  await sleep(8000);
  const r = await send("Runtime.evaluate", { expression: "document.querySelector('#view')?.innerText.slice(0,200).replace(/\\s+/g,' ')", returnByValue: true });
  console.log("==", url, "\n  view:", r.result?.value, "\n  errors:", errs.length ? errs.join("\n          ") : "none");
}
process.exit(0);
