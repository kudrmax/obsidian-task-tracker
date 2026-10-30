// Walks the plugin through every reference state in the scratch Obsidian and compares each screenshot with the
// board: node docs/design/reference/capture.mjs [port]. Needs the scratch Obsidian from CLAUDE.md running with
// remote debugging, the demo build installed (`npm run build:demo`), the window at 390×844 in phone emulation
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
/** A press held past the long-press delay, as on the switch to open the sources window. */
async function hold(x, y) {
	await mouse("mouseMoved", x, y, { button: "none" });
	await mouse("mousePressed", x, y);
	await sleep(400);
	await mouse("mouseReleased", x, y);
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
	await evaluate(`(async () => { await app.plugins.disablePlugin('task-calendar'); await app.plugins.enablePlugin('task-calendar'); await app.commands.executeCommandById('task-calendar:open'); await new Promise(r => setTimeout(r, 800)); await ${plugin}.update({ listShare: 0.5, rightMode: 'calendar', dayStartHour: 0 }); ${view}.render(); ${view}.timeline.scrollTo(540, 0); return 'ok'; })()`);
	await sleep(300);
}
const toNine = () => evaluate(`${view}.timeline.scrollTo(540, 0); 'ok'`);
const keyboard = () => evaluate(`document.querySelector('.task-calendar').style.setProperty('--tc-keyboard', '243px'); 'kb'`);
const cancelSheet = () => clickSelector(".tc-sheet-cancel");
/**
 * Halfway frames of the slide from Soon and Now to Now and the calendar: the boards mix the two layouts by the eased
 * share, so the transitions are paused at the time ease-in-out reaches it (a third: 119.6 of 300 ms, two thirds: 178.5).
 */
const slideTo = (ms) => evaluate(`(async () => { const v = ${view}; const toggle = v.header.switcher; await ${plugin}.update({ rightMode: 'soon' }); v.render(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); toggle.el.querySelector('[data-column=calendar]').click(); await new Promise(r => requestAnimationFrame(r)); window.clearTimeout(v.switching); window.clearTimeout(toggle.settling); for (const a of document.getAnimations()) { a.pause(); a.currentTime = ${ms}; } return document.getAnimations().length; })()`);
const endSlide = () => evaluate(`(async () => { for (const a of document.getAnimations()) a.finish(); ${view}.contentEl.classList.remove('is-switching'); ${view}.header.switcher.el.classList.remove('is-settling'); await ${plugin}.update({ rightMode: 'calendar' }); ${view}.render(); })()`);
const closeOverlay = () => click(200, 700);

/** The tasks each board of «Задачи на таймлайне» lays on the day (Screen.dc.html, TASK_SETS), in minutes. */
const TASKS = {
	day: [
		{ text: "Написать отчёт по проекту", start: 660, end: 720, inProgress: true },
		{ text: "Разобрать почту", start: 840, end: null },
		{ text: "Подготовить вопросы к планированию", start: 960, end: null },
		{ text: "Заказать продукты", start: 1020, end: null },
	],
	stack: [
		{ text: "Написать отчёт по проекту", start: 660, end: 720, inProgress: true },
		{ text: "Разобрать почту", start: 840, end: null },
		{ text: "Заказать продукты", start: 1020, end: null },
		{ text: "Позвонить в банк", start: 1020, end: null },
		{ text: "Купить корм коту", start: 1025, end: null },
		{ text: "Оплатить интернет", start: 1030, end: null },
	],
	stretch: [
		{ text: "Написать отчёт по проекту", start: 660, end: 720, inProgress: true },
		{ text: "Разобрать почту", start: 840, end: null },
		{ text: "Заказать продукты", start: 1020, end: null },
	],
	long: [
		{ text: "Разобрать почту", start: 840, end: null },
		{ text: "Ревью дизайна с командой", start: 870, end: 990 },
		{ text: "Ответить Вадиму", start: 900, end: null },
		{ text: "Заказать продукты", start: 1020, end: null },
	],
};
/** A board's tasks at its hour's height, the day scrolled to the minute the board shows at the top. */
const timelineBoard = (tasks, hourPx, top) => evaluate(`(async () => { const v = ${view}; v.deps.tasks.showTimeline(${JSON.stringify(tasks)}); await v.data.tasks(); v.hourPx = ${hourPx}; v.render(); v.timeline.scrollTo(${top}, 0); return 'ok'; })()`);
const dayBack = () => evaluate(`(async () => { const v = ${view}; v.timeline.select(null); v.deps.tasks.showTimeline(null); await v.data.tasks(); v.hourPx = 56; v.render(); return 'ok'; })()`);

/** The main screen's content region, and the task screen's region above the board's keyboard. */
const SCREEN = { dy: 18, region: [0, 236, 780, 1140] };
const SHEET = { dy: 114, region: [0, 108, 780, 980] };

const STATES = [
	{ board: "Screen", frame: SCREEN, run: async () => {} },
	{ board: "ScreenLeft", frame: SCREEN, run: () => evaluate(`(async () => { await ${plugin}.update({ listShare: 130 / 374 }); ${view}.render(); })()`), after: () => evaluate(`(async () => { await ${plugin}.update({ listShare: 0.5 }); ${view}.render(); })()`) },
	{ board: "ScreenRight", frame: SCREEN, run: () => evaluate(`(async () => { await ${plugin}.update({ listShare: 250 / 374 }); ${view}.render(); })()`), after: () => evaluate(`(async () => { await ${plugin}.update({ listShare: 0.5 }); ${view}.render(); })()`) },
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
	{ board: "ScreenInbox", frame: SCREEN, run: () => evaluate(`(async () => { await ${plugin}.update({ rightMode: 'inbox' }); ${view}.render(); })()`), after: () => evaluate(`(async () => { await ${plugin}.update({ rightMode: 'calendar' }); ${view}.render(); })()`) },
	{ board: "ScreenSwitch1", frame: SCREEN, run: () => slideTo(119.6), after: endSlide },
	{ board: "ScreenSwitch2", frame: SCREEN, run: () => slideTo(178.5), after: endSlide },
	{ board: "ScreenMenu", frame: SCREEN, run: () => click(100, 241, "right"), after: closeOverlay },
	{ board: "ScreenDue", frame: SCREEN, run: async () => { await click(100, 241, "right"); await clickSelector(".tc-menu-row", "Due date"); }, after: closeOverlay },
	{ board: "ScreenPicker", frame: SCREEN, run: async () => { await click(100, 241, "right"); await clickSelector(".tc-menu-row", "Due date"); await clickSelector(".tc-menu-row", "Pick a date"); }, after: closeOverlay },
	{ board: "ScreenSheet", frame: SHEET, run: async () => { await clickSelector(".tc-new:not(.is-soon):not(.is-inbox) .tc-new-btn"); await keyboard(); await type("Позвонить в банк"); }, after: cancelSheet },
	{ board: "ScreenSheetSlot", frame: SHEET, run: async () => { await evaluate(`${view}.newTaskSheet({ kind: 'now' }, { date: '2026-10-30', start: 990, end: 1050 }); 'ok'`); await keyboard(); await type("Позвонить в банк"); }, after: cancelSheet },
	{ board: "ScreenSheetInbox", frame: SHEET, run: async () => { await evaluate(`${view}.newTaskSheet({ kind: 'inbox' }, null); 'ok'`); await keyboard(); await type("Узнать про курсы итальянского"); }, after: cancelSheet },
	{ board: "ScreenSheetEdit", frame: SHEET, run: async () => { await click(100, 333, "right"); await clickSelector(".tc-menu-row", "Rename"); await keyboard(); }, after: cancelSheet },
	{ board: "ScreenSheetPicker", frame: SHEET, run: async () => { await clickSelector(".tc-new:not(.is-soon):not(.is-inbox) .tc-new-btn"); await keyboard(); await type("Позвонить в банк"); await clickSelector(".tc-tile", "", 3); await clickSelector(".tc-picker-next"); await clickSelector(".tc-day:not(.is-other)", "3"); await clickSelector(".tc-tile", "", 3); }, after: cancelSheet },
	{ board: "ScreenSheetLong", frame: SHEET, run: async () => { await clickSelector(".tc-new:not(.is-soon):not(.is-inbox) .tc-new-btn"); await keyboard(); await type("Позвонить в банк и узнать, почему списали комиссию за обслуживание карты"); }, after: cancelSheet },
	{ board: "ScreenSourcesDot", frame: SCREEN, run: async () => {} },
	{ board: "ScreenSourcesPopover", frame: SCREEN, run: () => hold(357, 145), after: closeOverlay },
	{
		board: "ScreenSourcesPull", frame: SCREEN,
		// The board draws the pull over the 9:00 view; a real pull starts only at the scroll top, so the pulled state is set on the DOM.
		run: () => evaluate(`(() => { const v = ${view}; v.pull.area.classList.add('is-open'); v.timeline.el.classList.add('is-pulling'); v.pull.setOffset(84); return 'ok'; })()`),
		after: () => evaluate(`(() => { const v = ${view}; v.pull.setOffset(0); v.pull.area.classList.remove('is-open'); v.timeline.el.classList.remove('is-pulling'); return 'ok'; })()`),
	},
	{
		board: "ScreenNewSlot", frame: SCREEN,
		// The board's target at 16:30 stands where the 16:00 card lies, so no press reaches it there: the target is shown by hand.
		run: () => evaluate(`(() => { ${view}.timelineDrop.previewNew(${view}.timeline.canvas.getBoundingClientRect().top + ${view}.timeline.yOf(990)); return 'ok'; })()`),
		after: () => evaluate(`(() => { ${view}.timelineDrop.clear(); return 'ok'; })()`),
	},
	{ board: "ScreenTasksStack", frame: SCREEN, run: () => timelineBoard(TASKS.stack, 56, 720), after: dayBack },
	{ board: "ScreenTasksLong", frame: SCREEN, run: () => timelineBoard(TASKS.long, 56, 810), after: dayBack },
	{ board: "ScreenTasksZoomIn", frame: SCREEN, run: () => timelineBoard(TASKS.day, 112, 645), after: dayBack },
	{ board: "ScreenTasksZoomOut", frame: SCREEN, run: () => timelineBoard([...TASKS.day, { text: "Оплатить интернет", start: 870, end: null }], 28, 540), after: dayBack },
	{
		board: "ScreenTasksResize", frame: SCREEN,
		// The card at 14:00 selected, its bottom dot carried by a mouse to 15:30; the shot while the button is down.
		run: async () => {
			await timelineBoard(TASKS.stretch, 56, 540);
			const at = await evaluate(`(() => { const v = ${view}; const item = v.data.day.slotted.find((t) => t.text === "Разобрать почту"); v.timeline.select(item); const grip = [...v.timeline.itemsEl.querySelectorAll(".tc-grips .tc-grip.is-end")][0].getBoundingClientRect(); const top = v.timeline.canvas.getBoundingClientRect().top; return [grip.x + grip.width / 2, grip.y + grip.height / 2, top + v.timeline.yOf(930)]; })()`);
			await mouse("mouseMoved", at[0], at[1], { button: "none" });
			await mouse("mousePressed", at[0], at[1]);
			for (let i = 1; i <= 10; i++) {
				await mouse("mouseMoved", at[0], at[1] + ((at[2] - at[1]) * i) / 10);
				await sleep(25);
			}
			await sleep(300);
		},
		shotWhileHeld: true,
		after: async () => {
			await mouse("mouseReleased", 300, 400);
			await sleep(400);
			await dayBack();
		},
	},
];

/** The light boards show the same states on Obsidian's light theme: the class on body switches the tokens, the view redraws its event colours. */
const setTheme = (name) => evaluate(`(() => { document.body.classList.toggle('theme-light', ${name === "light"}); document.body.classList.toggle('theme-dark', ${name === "dark"}); ${view}.render(); return 'ok'; })()`);
const LIGHT = { ScreenLight: "Screen", ScreenLightSoon: "ScreenSoon", ScreenLightInbox: "ScreenInbox", ScreenLightDrag: "ScreenDrag", ScreenLightMenu: "ScreenMenu", ScreenLightDue: "ScreenDue", ScreenLightPicker: "ScreenPicker", ScreenLightSheet: "ScreenSheet", ScreenLightSheetPicker: "ScreenSheetPicker", ScreenLightSources: "ScreenSourcesPopover" };
for (const [board, dark] of Object.entries(LIGHT)) {
	const base = STATES.find((s) => s.board === dark);
	STATES.push({
		...base,
		board,
		run: async () => { await setTheme("light"); await sleep(200); await base.run(); },
		after: async () => { await base.after?.(); await setTheme("dark"); },
	});
}

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
