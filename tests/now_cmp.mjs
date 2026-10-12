import { spawn } from 'node:child_process';
const P=process.argv[2];
const ch=spawn('chromium',['--headless=new','--remote-debugging-port=9347','--user-data-dir=/tmp/nowcmp-prof','--disk-cache-size=1','--window-size=2032,922','about:blank'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,2500));
const tabs=await (await fetch('http://127.0.0.1:9347/json')).json();
const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);
let id=0;const pend={};ws.onmessage=e=>{const m=JSON.parse(e.data);if(pend[m.id]){pend[m.id](m.result);delete pend[m.id]}};
const cdp=(method,params={})=>new Promise(r=>{const i=++id;pend[i]=r;ws.send(JSON.stringify({id:i,method,params}))});
await cdp('Emulation.setDeviceMetricsOverride',{width:2032,height:840,deviceScaleFactor:1,mobile:false});
for (const [name,url] of [['web','https://omarchystore.com/'],['desk',`http://127.0.0.1:${P}/`]]){
  await cdp('Page.navigate',{url});await new Promise(r=>setTimeout(r,6000));
  const r=await cdp('Runtime.evaluate',{returnByValue:true,expression:`(()=>{const h=document.querySelector('.page,main');const b=h.getBoundingClientRect();const ic=[...document.querySelectorAll('.spot img, .spot-row img')].filter(i=>/icon/.test(i.src)).map(i=>i.src.replace(location.origin,''));return {pageLeft:Math.round(b.left),pageW:Math.round(b.width),sideW:Math.round(document.querySelector('.sidebar').getBoundingClientRect().width),icons:ic}})()`});
  console.log(name,JSON.stringify(r.result.value));
  const s=await cdp('Page.captureScreenshot',{format:'png'});(await import('node:fs')).writeFileSync(`/tmp/now-${name}.png`,Buffer.from(s.data,'base64'));
}
ch.kill();process.exit(0);
