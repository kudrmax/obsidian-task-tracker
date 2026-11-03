// Shoots every screen of Task Calendar in a test Obsidian, over its debugging port.
// node scripts/design-catalog/catalog.mjs <outDir> <phone|mac> <dark|light> [state,state…]
// Env: PORT (default 9345). See README.md next to this file.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const [, , out, platform, theme, only] = process.argv;
if (!out || !["phone", "mac"].includes(platform) || !["dark", "light"].includes(theme)) {
	console.error("usage: catalog.mjs <outDir> <phone|mac> <dark|light> [state,…]");
	process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const port = process.env.PORT ?? "9345";
fs.mkdirSync(out, { recursive: true });

const list = await (await fetch(`http://localhost:${port}/json`)).json();
const page = list.find((t) => t.type === "page" && t.url.startsWith("app:"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (m) => {
	const d = JSON.parse(m.data);
	pending.get(d.id)?.(d);
};
const call = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await new Promise((r) => (ws.onopen = r));
const ev = async (expr) => {
	const r = await call("Runtime.evaluate", { expression: `(async()=>{try{${expr}}catch(e){return "ERR "+e.stack}})()`, awaitPromise: true, returnByValue: true });
	return r.result?.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitForView = async () => {
	for (let i = 0; i < 60; i++) {
		const shown = await ev(`if (!window.app?.workspace?.layoutReady) return "wait"; const l=app.workspace.getLeavesOfType("task-calendar"); if (!l.length) { await app.commands.executeCommandById("task-calendar:open"); return "opened"; } return l[0].view?.contentEl?.querySelector(".tc-card") ? "shown" : "wait";`);
		if (shown === "shown") return;
		await sleep(500);
	}
	throw new Error("the Task Calendar view did not show");
};

// Helpers inside the page.
const H = `
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const V=()=>app.workspace.getLeavesOfType("task-calendar")[0].view;
const vis=(el)=>el&&el.getClientRects().length>0;
const byText=(t)=>[...document.querySelectorAll("button,[role=button],.tc-menu-row,.tc-menu-tile,div,span")].reverse().find(e=>vis(e)&&e.textContent.trim()===t);
const pe=(t,x,y,el,id=7,metaKey=false)=>(el??document).dispatchEvent(new PointerEvent(t,{pointerId:id,clientX:x,clientY:y,bubbles:true,isPrimary:true,pointerType:"mouse",button:0,metaKey}));
const tap=async(el,metaKey=false)=>{const r=el.getBoundingClientRect();const x=r.left+r.width/2,y=r.top+r.height/2;pe("pointerdown",x,y,el,7,metaKey);await sleep(40);pe("pointerup",x,y,el,7,metaKey);el.dispatchEvent(new MouseEvent("click",{bubbles:true,clientX:x,clientY:y,metaKey}));await sleep(500);};
const named=(t)=>[...V().contentEl.querySelectorAll(".tc-left .tc-card")].find(c=>vis(c)&&c.textContent.includes(t));
const bulk=async()=>{top(); await tap(named("Work task 2"),true); await tap(named("Work task 4"),true); await tap(named("Work task 2")); await sleep(400);};
const field=()=>V().contentEl.querySelector(".tc-quick-field [contenteditable=true]")??V().contentEl.querySelector(".tc-quick-field");
const quick=async()=>{top(); V().quick.openAtEnd("left"); await sleep(600); field().focus(); for (const ch of "Новая задача") { document.execCommand("insertText", false, ch); await sleep(15);} await sleep(900);};
const unquick=async()=>{field()?.focus(); document.execCommand("selectAll"); document.execCommand("delete"); V().quick.close(); await sleep(600);};
const block=(t)=>[...V().contentEl.querySelectorAll(".tc-block")].find(b=>vis(b)&&b.textContent.includes(t));
const card=(i=1)=>[...V().contentEl.querySelectorAll(".tc-left .tc-card")].filter(vis)[i];
const top=()=>{const s=V().contentEl.querySelector(".tc-left > div"); if(s) s.scrollTop=0;};
const esc=async()=>{for(let i=0;i<3;i++){document.activeElement?.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",code:"Escape",bubbles:true,cancelable:true}));document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",code:"Escape",bubbles:true,cancelable:true}));await sleep(250);}};
`;

// Each state: how to get there; `force` puts a pseudo-class on the first element matching a selector; `on` limits it to a platform.
const states = {
	main: { setup: `V().showMode("calendar"); top(); await sleep(800);` },
	soon: { setup: `V().showMode("soon"); await sleep(900);`, teardown: `V().showMode("calendar"); await sleep(600);` },
	inbox: { setup: `V().showMode("inbox"); await sleep(900);`, teardown: `V().showMode("calendar"); await sleep(600);` },
	menu: { setup: `top(); await tap(card(1)); await sleep(500);` },
	section: { setup: `top(); await tap(card(0)); await tap(byText("Section")); await sleep(400);` },
	picker: { setup: `top(); await tap(card(1)); await tap(byText("Pick a date")); await sleep(400);` },
	confirm: { setup: `top(); await tap(card(1)); await tap(byText("Delete")); await sleep(400);` },
	group: { setup: `top(); const h=[...V().contentEl.querySelectorAll(".tc-left .tc-group-head")].filter(vis)[0]; await tap(h); await sleep(400);` },
	sources: { setup: `V().showSources(V().contentEl.querySelector(".tc-seg")); await sleep(700);` },
	sheet: {
		setup: `V().descriptionSheet({ text: "Задача с описанием", description: "Первая строка описания.\\n\\n- пункт один\\n- пункт два", key: { section: "x", index: 0 } }, false); await sleep(900);`,
		teardown: `document.querySelector(".tc-sheet-bar > .tc-btn")?.click(); await sleep(700);`,
	},
	quick: { setup: `await quick();`, teardown: `await unquick();` },
	"quick-priority": { setup: `await quick(); await tap(V().containerEl.ownerDocument.querySelector(".tc-bar-flag")); await sleep(400);`, teardown: `await unquick();` },
	"quick-place": { setup: `await quick(); await tap(document.querySelector(".tc-bar-place")); await sleep(400);`, teardown: `await unquick();` },
	"quick-picker": { setup: `await quick(); await tap(document.querySelector(".tc-bar-place")); await tap(byText("Date")); await sleep(400);`, teardown: `await unquick();` },
	"block-menu": { setup: `top(); await tap(block("Work task 9")); await sleep(500);` },
	bulk: { on: "mac", setup: `await bulk();` },
	"bulk-section": { on: "mac", setup: `await bulk(); await tap(byText("Section")); await sleep(400);` },
	"bulk-picker": { on: "mac", setup: `await bulk(); await tap(byText("Pick a date")); await sleep(400);` },
	drag: {
		setup: `top(); const c=card(1); const r=c.getBoundingClientRect(); const x=r.left+40,y=r.top+10; window.__tcDrag={x,y}; pe("pointerdown",x,y,c,9); pe("pointermove",x+10,y+10,c,9); await sleep(50); for(let i=0;i<=25;i++){pe("pointermove",x+10,y+10+i*6,undefined,9); await sleep(16);} await sleep(900);`,
		teardown: `const {x,y}=window.__tcDrag; pe("pointermove",x+10,y+10,undefined,9); await sleep(100); pe("pointerup",x+10,y+10,undefined,9); await sleep(900);`,
	},
	undo: {
		setup: `top(); await tap(card(1)); await tap(byText("In progress")); await sleep(1200);`,
		teardown: `const u=V().contentEl.querySelector(".tc-undo"); if(vis(u)) await tap(u); await sleep(900);`,
	},
	settings: { setup: `app.setting.open(); app.setting.openTabById("task-calendar"); await sleep(900); document.activeElement?.blur(); await sleep(200);`, teardown: `app.setting.close(); await sleep(400);` },
	"hover-row": { on: "mac", setup: `top(); await tap(card(1)); await sleep(500);`, force: [".tc-panel .tc-menu-row", ["hover"]] },
	"hover-plus": { on: "mac", setup: `await sleep(300);`, force: [".tc-plus", ["hover"]] },
	"active-tile": { on: "mac", setup: `top(); await tap(card(1)); await sleep(500);`, force: [".tc-panel .tc-menu-tile", ["active"]] },
	"active-row": { on: "phone", setup: `top(); await tap(card(1)); await sleep(500);`, force: [".tc-panel .tc-menu-row", ["active"]] },
	"focus-arrow": { on: "mac", setup: `await sleep(300);`, force: [".tc-arrow", ["focus", "focus-visible"]] },
	"active-handle": { setup: `top(); await sleep(300);`, force: [".tc-divider-handle", ["active"]] },
	"hover-tile-on": {
		on: "mac",
		setup: `top(); await tap(card(1)); await tap(document.querySelector(".tc-panel .tc-menu-tile[data-priority]")); await sleep(700); await esc(); top(); await tap(card(1)); await sleep(500);`,
		teardown: `await esc(); top(); await tap(card(1)); const on=document.querySelector(".tc-panel .tc-menu-tile.is-on[data-priority]"); if (on) await tap(on); await sleep(700);`,
		force: [".tc-panel .tc-menu-tile.is-on", ["hover"]],
	},
	// The reference tasks carry no date the picker can show as chosen: the 12th is marked chosen as MonthPicker marks one.
	"hover-day": {
		on: "mac",
		setup: `top(); await tap(card(1)); await tap(byText("Pick a date")); await sleep(400); [...document.querySelectorAll(".tc-picker .tc-day:not(.is-other)")].find((d)=>d.textContent==="12").classList.add("is-selected");`,
		force: [".tc-picker .tc-day.is-selected", ["hover"]],
	},
	"focus-row": { on: "mac", setup: `top(); await tap(card(1)); await sleep(500);`, force: [".tc-panel .tc-menu-row", ["focus", "focus-visible"]] },
	"focus-seg": { on: "mac", setup: `await sleep(300);`, force: [".tc-seg", ["focus", "focus-visible"]] },
	"hover-sheet": {
		on: "mac",
		setup: `V().descriptionSheet({ text: "Задача с описанием", description: "Первая строка описания.\\n\\n- пункт один\\n- пункт два", key: { section: "x", index: 0 } }, false); await sleep(900);`,
		teardown: `document.querySelector(".tc-sheet-bar > .tc-btn")?.click(); await sleep(700);`,
		force: [".tc-sheet-bar > .tc-btn", ["hover"]],
	},
};

async function force(selector, pseudo) {
	await call("DOM.enable");
	await call("CSS.enable");
	const root = (await call("DOM.getDocument", { depth: -1 })).result.root.nodeId;
	const nodeId = (await call("DOM.querySelector", { nodeId: root, selector })).result?.nodeId;
	if (!nodeId) return null;
	await call("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: pseudo });
	return nodeId;
}

const remote = `const R=require("@electron/remote"); R.getCurrentWebContents().setBackgroundThrottling(false);`;
if (platform === "phone") await ev(`${remote} R.getCurrentWindow().setSize(390,844); app.emulateMobile(true); await new Promise(r=>setTimeout(r,2500)); return 1`);
else await ev(`${remote} app.emulateMobile(false); R.getCurrentWindow().setSize(1280,820); await new Promise(r=>setTimeout(r,2500)); return 1`);
await waitForView();
await ev(`${remote} app.changeTheme("${theme === "light" ? "moonstone" : "obsidian"}"); await new Promise(r=>setTimeout(r,3000)); return 1`);
// The reference tasks, and the clock stopped at noon on the day they are written for: a run is the same pixels every time.
const tasks = fs.readFileSync(process.env.TASKS ?? path.join(here, "tasks.md"), "utf8");
// The clock stops before the tasks are written: on a fresh page the plugin would otherwise carry them over to the real today.
await ev(`const T=new Date(2026,10,3,12,0,0,0).getTime(); if (window.__tcFrozen !== T) { const O=Date; class F extends O { constructor(...a){ if (a.length) super(...a); else super(T); } static now(){ return T; } } window.Date=F; window.__tcFrozen=T; } return 1`);
await ev(`await app.vault.adapter.write("tasks.md", ${JSON.stringify(tasks)}); return 1`);
await ev(`app.workspace.getLeavesOfType("task-calendar").forEach((l)=>l.detach()); await app.commands.executeCommandById("task-calendar:open"); await new Promise(r=>setTimeout(r,1500)); return 1`);
await waitForView();
await sleep(1000);

for (const name of only ? only.split(",") : Object.keys(states)) {
	const state = states[name];
	if (!state) throw new Error(`no state ${name}`);
	if (state.on && state.on !== platform) continue;
	// The plugin's tab is the focused one in every shot: Obsidian draws the active tab's title brighter.
	await ev(`const l=app.workspace.getLeavesOfType("task-calendar")[0]; app.workspace.setActiveLeaf(l,{focus:true}); await new Promise(r=>setTimeout(r,200)); return 1`);
	const res = await ev(`${H} ${state.setup} return "ok"`);
	let forced = null;
	if (state.force) forced = await force(...state.force);
	await sleep(400);
	const shot = await call("Page.captureScreenshot", { format: "png" });
	fs.writeFileSync(path.join(out, `${platform}-${theme}-${name}.png`), Buffer.from(shot.result.data, "base64"));
	if (forced) await call("CSS.forcePseudoState", { nodeId: forced, forcedPseudoClasses: [] });
	const done = await ev(`${H} ${state.teardown ?? ""} await esc(); return "ok"`);
	console.log(name, res, done, state.force && !forced ? "(nothing to force)" : "");
}
ws.close();
