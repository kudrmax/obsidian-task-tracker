import { test as base } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { sleep } from "./lib/cdp.mjs";
import { FrameRecorder, frameFaults, Screencast, screenshot } from "./lib/frames.mjs";
import { Input } from "./lib/input.mjs";
import * as oracle from "./lib/oracle.mjs";
import { replay } from "./lib/replay.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const PAGE = pathToFileURL(join(ROOT, "build/e2e-page/index.html")).href;
const SCREEN = ".task-calendar";
/** The port the page's screen runs on: the stand's `MockPort`, or with `TC_PORT=core` the core's (`CorePort`, the plan's step 5). */
const PORT = process.env.TC_PORT === "core" ? "&port=core" : "";

/**
 * A scenario's `t` over a Playwright page holding the test page (tests/e2e/page): `cdp` evaluates in the page and sends the
 * DevTools Protocol over the page's own session (real input through the browser's pipeline, screencasts), `input` and
 * `frames` are the shared ones, `expect` collects the scenario's failures for the test to assert at its end.
 */
async function scenarioTools(page, { platform, theme, out }) {
	const session = await page.context().newCDPSession(page);
	const cdp = {
		eval: (expression) => page.evaluate(expression),
		call: (fn, ...args) => page.evaluate(`(${fn.toString()})(...${JSON.stringify(args)})`),
		send: (method, params = {}) => session.send(method, params),
		on(method, listener) {
			session.on(method, listener);
			return () => session.off(method, listener);
		},
	};
	const failures = [];
	const t = {
		cdp,
		platform,
		theme,
		/** The port the screen runs on: "mock" or "core"; a check of a rule `MockPort` made up reads the core's where it runs on the core. */
		port: PORT ? "core" : "mock",
		out,
		failures,
		input: new Input(cdp),
		target: { root: SCREEN },
		oracle: {
			columns: () => oracle.columnsInView(cdp, SCREEN),
			cards: (list) => oracle.cardsInView(cdp, list, SCREEN),
			text: () => oracle.screenText(cdp, SCREEN),
			rect: (selector, index) => oracle.rectOf(cdp, selector, index),
			textAt: (x, y) => oracle.textAt(cdp, x, y),
			/** The tasks of `## list` in the made-up tasks file. */
			tasks: async (list) => oracle.tasksOf(await t.file(), list),
		},
		file: () => cdp.eval(`window.__tcStand.fileText()`),
		/** The stand's own reach (`window.__tcStand`): an edit from outside, the write delay, a step. */
		stand: (call) => cdp.eval(`(() => { const r = window.__tcStand.${call}; return r === undefined ? 1 : r; })()`),
		expect(ok, message) {
			if (!ok) failures.push(message);
			return ok;
		},
		async setStop(stop) {
			await cdp.eval(`(() => { window.__tcStand.setStop(${JSON.stringify(stop)}); return 1; })()`);
			await sleep(500);
		},
		/** The page loaded afresh: the whole screen over new made-up tasks. */
		async open() {
			await page.goto(`${PAGE}?platform=${platform}&theme=${theme}${PORT}`);
			await page.waitForFunction(() => !!window.__tcStand && !!document.querySelector(".task-calendar"));
			if (platform === "phone") await t.input.touchOn();
			await t.input.move(1, 1);
			await sleep(600);
		},
		/**
		 * The page's clock stopped at `hhmm` today (Date only; the timers, the frames and `performance.now` run on), on every
		 * page opened from now on, and the page opened afresh. Not Playwright's `page.clock`: on a page opened again after it
		 * is installed, its `performance.now` runs ahead of the document's timeline by the time since, and Motion's animations
		 * (started on the timeline at `performance.now`) wait that long (e8-calendar-event-hits on CorePort, 2026-11-21).
		 */
		async setClock(hhmm) {
			const [h, m] = hhmm.split(":").map(Number);
			const now = new Date();
			const fixed = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).getTime();
			await page.addInitScript((at) => {
				const Real = Date;
				class Fixed extends Real {
					constructor(...args) {
						super(...(args.length === 0 ? [at] : args));
					}
					static now() {
						return at;
					}
				}
				window.Date = Fixed;
			}, fixed);
			await t.open();
		},
		/** Records every frame while `gesture` runs (and `settleMs` after), then checks them: the faults found. */
		async frames(gesture, { settleMs = 600, cast = null, ...checks } = {}) {
			return frameFaults(await t.record(gesture, { settleMs, cast }), checks);
		},
		/** Every frame while `gesture` runs (and `settleMs` after), as the page painted it. */
		async record(gesture, { settleMs = 600, cast = null } = {}) {
			const recorder = new FrameRecorder(cdp);
			const screencast = cast ? new Screencast(cdp, join(out, cast)) : null;
			await screencast?.start();
			await recorder.start();
			await gesture();
			await sleep(settleMs);
			const frames = await recorder.stop();
			await screencast?.stop();
			writeFileSync(join(out, `${cast ?? "frames"}.json`), JSON.stringify(frames));
			return frames;
		},
		/** The screen, or a region of it (`clip`: x, y, width, height) magnified three times. */
		shot: (name, clip) => screenshot(cdp, join(out, `${name}.png`), clip),
		/** A recording replayed in a window of its size: an event recorded past this window's edge would never reach the page. */
		async replay(recording, opts) {
			const file = join(ROOT, "tests/e2e/recordings", recording);
			const { w, h } = JSON.parse(readFileSync(file, "utf8"));
			if (w && h) {
				await page.setViewportSize({ width: w, height: h });
				await sleep(400);
			}
			return replay(cdp, file, opts);
		},
		/** The window resized, as a person drags its edge or turns the phone: the page is not loaded again. */
		async setViewport(width, height) {
			await page.setViewportSize({ width, height });
			await sleep(400);
		},
		sleep,
		/** Waits until `check` answers truthy, as a person waits for the screen, up to `ms`; its last answer. */
		async waitFor(check, ms = 5000) {
			const until = Date.now() + ms;
			let last = await check();
			while (!last && Date.now() < until) {
				await sleep(150);
				last = await check();
			}
			return last;
		},
	};
	return t;
}

export const test = base.extend({
	platform: ["desktop", { option: true }],
	theme: ["dark", { option: true }],
	t: async ({ page, platform, theme }, use, testInfo) => {
		const out = testInfo.outputPath();
		mkdirSync(out, { recursive: true });
		const t = await scenarioTools(page, { platform, theme, out });
		page.on("pageerror", (error) => t.failures.push(`page error: ${error.stack ?? String(error)}`));
		await t.open();
		await use(t);
	},
});

export { expect } from "@playwright/test";
