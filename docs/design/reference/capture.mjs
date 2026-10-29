// Walks the plugin through every reference state in the scratch Obsidian and compares each screenshot with the
// board: node docs/design/reference/capture.mjs [port]. Needs the scratch Obsidian from CLAUDE.md running with
// remote debugging, the branch build installed, the window at 390×844 in phone emulation and the demo wiring
// (today 2026-10-30 14:20). Writes diff/<Board>.obsidian.png, diff/<Board>.diff.png and diff/results.md.
//
// Obsidian's chrome stands where the boards draw it, only taller: the content starts 9 px lower than on the boards
// (111 against 102), and the task screen's bar 57 px lower (111 against 54). The comparison shifts by that, covers
// the plugin's content between the day row and the New task button (which Obsidian's navigation bar moves), and
// counts a pixel as different above a tolerance of 32 levels in any channel (text anti-aliasing and the blur of a
// backdrop differ by less) and, for the record, at zero tolerance too.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { diffImages } from "./diff.mjs";
import { decodePng, encodePng } from "./png.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "diff");
mkdirSync(out, { recursive: true });
const port = Number(process.argv[2] ?? 9333);
/** Board names to capture; none means all. */
const only = process.argv.slice(3);

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === "page" && t.url === "app://obsidian.md/index.html");
if (!page) throw new Error("no Obsidian vault window on the debugging port");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
ws.onmessage = (m) => {
	const msg = JSON.parse(m.data);
	if (msg.id && pending.has(msg.id)) {
		pending.get(msg.id)(msg);
		pending.delete(msg.id);
	}
};
const send = (method, params = {}) => new Promise((resolve) => {
	const id = ++seq;
	pending.set(id, resolve);
	ws.send(JSON.stringify({ id, method, params }));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function evaluate(expression) {
	const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
	if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails));
	return r.result.result.value;
}
const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });
async function click(x, y, button = "left") {
	await mouse("mouseMoved", x, y, { button: "none" });
	await mouse("mousePressed", x, y, { button });
	await sleep(60);
	await mouse("mouseReleased", x, y, { button });
	await sleep(400);
}
async function clickSelector(selector, text = "", index = 0) {
	const at = await evaluate(`(() => { const all = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(e => !${JSON.stringify(text)} || e.textContent.trim().startsWith(${JSON.stringify(text)})); const e = all[${index}]; if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
	if (!at) throw new Error(`nothing to click: ${selector} ${text}; on screen: ${await evaluate("JSON.stringify({ drops: document.querySelectorAll('.tc-drop').length, sheets: document.querySelectorAll('.tc-sheet').length, backdrops: document.querySelectorAll('.tc-backdrop').length, busy: " + view + ".arbiter.busy })")}`);
	await click(at[0], at[1]);
}
const park = () => mouse("mouseMoved", 200, 700, { button: "none" });
async function shot(file) {
	await park();
	await sleep(250);
	const r = await send("Page.captureScreenshot", { format: "png" });
	const buffer = Buffer.from(r.result.data, "base64");
	writeFileSync(file, buffer);
	return decodePng(buffer);
}
const view = "app.workspace.getLeavesOfType('task-calendar')[0].view";
const plugin = "app.plugins.plugins['task-calendar']";
const type = (text) => send("Input.insertText", { text });

async function reload() {
	await evaluate(`(async () => { await app.plugins.disablePlugin('task-calendar'); await app.plugins.enablePlugin('task-calendar'); await app.commands.executeCommandById('task-calendar:open'); await new Promise(r => setTimeout(r, 800)); await ${plugin}.update({ listWidth: 187, rightMode: 'calendar' }); ${view}.render(); ${view}.timeline.scrollTo(540, 0); return 'ok'; })()`);
	await sleep(300);
}
const toNine = () => evaluate(`${view}.timeline.scrollTo(540, 0); 'ok'`);
const keyboard = () => evaluate(`document.querySelector('.task-calendar').style.setProperty('--tc-keyboard', '243px'); 'kb'`);
const cancelSheet = () => clickSelector(".tc-sheet-cancel");
const closeOverlay = () => click(200, 700);

/** The main screen's content region, and the task screen's region above the board's keyboard. */
const SCREEN = { dy: 18, region: [0, 236, 780, 1140] };
const SHEET = { dy: 114, region: [0, 108, 780, 980] };

const STATES = [
	{ board: "Screen", frame: SCREEN, run: async () => {} },
	{ board: "ScreenLeft", frame: SCREEN, run: () => evaluate(`(async () => { await ${plugin}.update({ listWidth: 130 }); ${view}.render(); })()`), after: () => evaluate(`(async () => { await ${plugin}.update({ listWidth: 187 }); ${view}.render(); })()`) },
	{ board: "ScreenRight", frame: SCREEN, run: () => evaluate(`(async () => { await ${plugin}.update({ listWidth: 250 }); ${view}.render(); })()`), after: () => evaluate(`(async () => { await ${plugin}.update({ listWidth: 187 }); ${view}.render(); })()`) },
	{
		board: "ScreenDrag", frame: SCREEN,
		// Card 2 by a mouse, carried to the timeline so the target lands on 16:30; the shot while the button is down.
		run: async () => {
			await mouse("mouseMoved", 100, 259, { button: "none" });
			await mouse("mousePressed", 100, 259);
			for (let i = 1; i <= 20; i++) {
				await mouse("mouseMoved", 100 + ((233 - 100) * i) / 20, 259 + ((657 - 259) * i) / 20);
				await sleep(25);
			}
			await sleep(400);
		},
		shotWhileHeld: true,
		after: async () => {
			await mouse("mouseMoved", 50, 150);
			await sleep(100);
			await mouse("mouseReleased", 50, 150);
			await sleep(500);
			await reload();
		},
	},
	{ board: "ScreenSoon", frame: SCREEN, run: () => evaluate(`(async () => { await ${plugin}.update({ rightMode: 'soon' }); ${view}.render(); })()`), after: () => evaluate(`(async () => { await ${plugin}.update({ rightMode: 'calendar' }); ${view}.render(); })()`) },
	{ board: "ScreenMenu", frame: SCREEN, run: () => click(100, 241, "right"), after: closeOverlay },
	{ board: "ScreenDue", frame: SCREEN, run: async () => { await click(100, 241, "right"); await clickSelector(".tc-menu-row", "Due date"); }, after: closeOverlay },
	{ board: "ScreenPicker", frame: SCREEN, run: async () => { await click(100, 241, "right"); await clickSelector(".tc-menu-row", "Due date"); await clickSelector(".tc-menu-row", "Pick a date"); }, after: closeOverlay },
	{ board: "ScreenSheet", frame: SHEET, run: async () => { await clickSelector(".tc-new:not(.is-soon) .tc-new-btn"); await keyboard(); await type("Позвонить в банк"); }, after: cancelSheet },
	{ board: "ScreenSheetSlot", frame: SHEET, run: async () => { await evaluate(`${view}.newTaskSheet({ kind: 'now' }, { date: '2026-10-30', start: 990, end: 1050 }); 'ok'`); await keyboard(); await type("Позвонить в банк"); }, after: cancelSheet },
	{ board: "ScreenSheetEdit", frame: SHEET, run: async () => { await click(100, 333, "right"); await clickSelector(".tc-menu-row", "Rename"); await keyboard(); }, after: cancelSheet },
	{ board: "ScreenSheetPicker", frame: SHEET, run: async () => { await clickSelector(".tc-new:not(.is-soon) .tc-new-btn"); await keyboard(); await type("Позвонить в банк"); await clickSelector(".tc-tile", "", 2); await clickSelector(".tc-picker-next"); await clickSelector(".tc-day:not(.is-other)", "3"); await clickSelector(".tc-tile", "", 2); }, after: cancelSheet },
	{ board: "ScreenSheetLong", frame: SHEET, run: async () => { await clickSelector(".tc-new:not(.is-soon) .tc-new-btn"); await keyboard(); await type("Позвонить в банк и узнать, почему списали комиссию за обслуживание карты"); }, after: cancelSheet },
	{ board: "ScreenSourcesDot", frame: SCREEN, run: async () => {} },
	{ board: "ScreenSourcesPopover", frame: SCREEN, run: () => click(314, 145), after: closeOverlay },
	{
		board: "ScreenSourcesPull", frame: SCREEN,
		// The board draws the pull over the 9:00 view; a real pull starts only at the scroll top, so the pulled state is set on the DOM.
		run: () => evaluate(`(() => { const v = ${view}; v.pull.area.classList.add('is-open'); v.timeline.el.classList.add('is-pulling'); v.pull.setOffset(84); return 'ok'; })()`),
		after: () => evaluate(`(() => { const v = ${view}; v.pull.setOffset(0); v.pull.area.classList.remove('is-open'); v.timeline.el.classList.remove('is-pulling'); return 'ok'; })()`),
	},
	{
		board: "ScreenNewSlot", frame: SCREEN,
		// A mouse held still on an empty place at 16:40: the target shows while the button is down; letting go opens the task screen.
		run: async () => { await mouse("mouseMoved", 300, 640, { button: "none" }); await mouse("mousePressed", 300, 640); await sleep(500); },
		shotWhileHeld: true,
		after: async () => { await mouse("mouseReleased", 300, 640); await sleep(400); await cancelSheet(); },
	},
];

await reload();
const results = [];
for (const state of STATES) {
	if (only.length && !only.includes(state.board)) continue;
	await toNine();
	await state.run();
	await sleep(350);
	const file = join(out, `${state.board}.obsidian.png`);
	let actual;
	if (state.shotWhileHeld) {
		const r = await send("Page.captureScreenshot", { format: "png" });
		const buffer = Buffer.from(r.result.data, "base64");
		writeFileSync(file, buffer);
		actual = decodePng(buffer);
	} else actual = await shot(file);
	await state.after?.();
	await sleep(400);
	const expected = decodePng(readFileSync(join(here, `${state.board}@2x.png`)));
	const exact = diffImages(expected, actual, { tolerance: 0, dx: 0, dy: state.frame.dy, region: state.frame.region });
	const loose = diffImages(expected, actual, { tolerance: 32, dx: 0, dy: state.frame.dy, region: state.frame.region });
	writeFileSync(join(out, `${state.board}.diff.png`), encodePng(loose.image));
	results.push({ board: state.board, exact: exact.percent, loose: loose.percent });
	console.log(`${state.board}: ${loose.percent.toFixed(3)}% at tolerance 32, ${exact.percent.toFixed(3)}% exact`);
}
ws.close();

const table = ["| Board | Differing pixels, tolerance 32 | Differing pixels, exact |", "|---|---|---|", ...results.map((r) => `| ${r.board} | ${r.loose.toFixed(3)}% | ${r.exact.toFixed(3)}% |`)];
writeFileSync(join(out, "results.md"), `# Pixel comparison with the boards\n\nMade by \`node docs/design/reference/capture.mjs\` against the scratch Obsidian (CLAUDE.md). The region is the plugin's content between the day row and the New task button, shifted by Obsidian's taller chrome; see the script's header.\n\n${table.join("\n")}\n`);
