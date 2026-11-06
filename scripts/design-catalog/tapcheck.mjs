// Phone: gives every visible plugin button Obsidian's tap mark (.mobile-tap), or with TAB=1 marks the body .is-tablet,
// and prints the buttons whose ground, shadow or padding change. Nothing printed under a state means none did.
// node scripts/design-catalog/tapcheck.mjs   Env: PORT (default 9345), TAB.
const port = process.env.PORT ?? "9345";
const list = await (await fetch(`http://localhost:${port}/json`)).json();
const page = list.find((t) => t.type === "page" && t.url.startsWith("app:"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); };
const call = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await new Promise((r) => (ws.onopen = r));
const ev = async (expr) => (await call("Runtime.evaluate", { expression: `(async()=>{try{${expr}}catch(e){return "ERR "+e.stack}})()`, awaitPromise: true, returnByValue: true })).result?.result?.value;
const H = `const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));const V=()=>app.workspace.getLeavesOfType("task-calendar")[0].view;const vis=(el)=>el&&el.getClientRects().length>0;
const byText=(t)=>[...document.querySelectorAll("button,div,span")].reverse().find(e=>vis(e)&&e.textContent.trim()===t);
const pe=(t,x,y,el)=>(el??document).dispatchEvent(new PointerEvent(t,{pointerId:7,clientX:x,clientY:y,bubbles:true,isPrimary:true,pointerType:"mouse",button:0}));
const tap=async(el)=>{const r=el.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;pe("pointerdown",x,y,el);await sleep(40);pe("pointerup",x,y,el);el.dispatchEvent(new MouseEvent("click",{bubbles:true,clientX:x,clientY:y}));await sleep(500);};
const card=(i=1)=>[...V().contentEl.querySelectorAll(".tc-left .tc-card")].filter(vis)[i];
const esc=async()=>{for(let i=0;i<3;i++){document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",code:"Escape",bubbles:true,cancelable:true}));await sleep(250);}};
const TAB=${process.env.TAB?"true":"false"};const mark=TAB?"tc-probe":"mobile-tap";const probe=()=>{const out=[];for(const b of document.querySelectorAll(":is(.task-calendar,.tc-panel,.tc-picker,.tc-popover,.tc-quick-bar) button")){if(!vis(b))continue;b.style.transition="none";const s=getComputedStyle(b);const a=[s.backgroundColor,s.boxShadow,s.padding];b.classList.add(mark);document.body.classList.toggle("is-tablet",TAB);const s2=getComputedStyle(b);const c=[s2.backgroundColor,s2.boxShadow,s2.padding];b.classList.remove(mark);document.body.classList.remove("is-tablet");b.style.transition="";if(a.join("|")!==c.join("|"))out.push(b.className.split(" ").slice(0,2).join(".")+" :: "+a.join(" / ")+"  =>  "+c.join(" / "));}return [...new Set(out)];};`;
const states = {
	main: ``,
	menu: `await tap(card(1));`,
	picker: `await tap(card(1)); await tap(byText("Pick a date"));`,
	confirm: `await tap(card(1)); await tap(byText("Delete"));`,
	sources: `V().showSources(V().contentEl.querySelector(".tc-seg")); await sleep(500);`,
	full: `await tap(card(1)); await tap(byText("Open full screen")); await sleep(700);`,
	quick: `V().quick.openAtEnd("left"); await sleep(700);`,
};
await ev(`require("@electron/remote").getCurrentWindow().setSize(390,844); app.emulateMobile(true); await new Promise(r=>setTimeout(r,2500)); return 1`);
for (const [n, s] of Object.entries(states)) {
	const r = await ev(`${H} ${s} await sleep(400); const p=probe(); document.querySelector(".tc-sheet-bar > .tc-btn")?.click(); try{V().quick.close()}catch{} await esc(); await sleep(400); return p;`);
	console.log("==", n); for (const l of (Array.isArray(r) ? r : [r])) console.log("  ", l);
}
ws.close();
