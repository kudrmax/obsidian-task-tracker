#!/usr/bin/env node
/**
 * The end-to-end checks: every scenario of tests/e2e/scenarios in the test Obsidian, on the desktop window and in the
 * phone view, in the dark and the light theme, each with a fresh tasks file of ~300 tasks. `npm run e2e` builds first.
 *
 *   npm run e2e -- [--only <name part>] [--platform desktop,phone] [--theme dark,light] [--no-build] [--quit]
 *
 * E2E_TARGET (stand, the default, or plugin) names what runs: the stand's engine over tasks in memory, or the plugin over
 * the vault's tasks file. E2E_DIR (the test Obsidian's profile, vault and output; default <tmp>/task-calendar-e2e) and
 * E2E_PORT (its debugging port; default 9447) name the instance. Frames, screencasts and screenshots go to E2E_DIR/out/<scenario>/<platform>-<theme>/.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { sleep } from "./lib/cdp.mjs";
import { FrameRecorder, frameFaults, Screencast, screenshot } from "./lib/frames.mjs";
import { Input } from "./lib/input.mjs";
import { TestObsidian } from "./lib/obsidian.mjs";
import * as oracle from "./lib/oracle.mjs";
import { replay } from "./lib/replay.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const args = process.argv.slice(2);
const option = (name, fallback) => {
	const at = args.indexOf(`--${name}`);
	return at >= 0 ? args[at + 1] : fallback;
};
const platforms = option("platform", "desktop,phone").split(",");
const themes = option("theme", "dark,light").split(",");
const only = option("only", "");

const target = new TestObsidian().target;
if (!args.includes("--no-build")) execFileSync("npm", ["run", target.buildScript], { cwd: ROOT, stdio: "inherit" });

const scenarioDir = new URL("./scenarios/", import.meta.url).pathname;
const scenarios = [];
for (const file of readdirSync(scenarioDir).filter((f) => f.endsWith(".mjs")).sort()) {
	const scenario = (await import(pathToFileURL(join(scenarioDir, file)).href)).default;
	if (!only || scenario.name.includes(only)) scenarios.push(scenario);
}

const obsidian = await new TestObsidian().start();
/** E2E_BUILD: a folder holding another build (main.js, manifest.json, styles.css) to run the scenarios on, such as the released one. */
await obsidian.deploy(process.env.E2E_BUILD ?? target.build);
console.log(`test Obsidian on port ${obsidian.config.port}, build ${await obsidian.buildMark()}`);


const results = [];
for (const platform of platforms) {
	await obsidian.platform(platform);
	for (const theme of themes) {
		await obsidian.theme(theme);
		for (const scenario of scenarios) {
			if (scenario.platforms && !scenario.platforms.includes(platform)) continue;
			const out = join(obsidian.config.out, scenario.name, `${platform}-${theme}`);
			mkdirSync(out, { recursive: true });
			const failures = [];
			const cdp = obsidian.cdp;
			const t = {
				cdp,
				platform,
				theme,
				out,
				input: new Input(cdp),
				oracle: {
					columns: () => oracle.columnsInView(cdp, target.root),
					cards: (list) => oracle.cardsInView(cdp, list, target.root),
					text: () => oracle.screenText(cdp, target.root),
					rect: (selector, index) => oracle.rectOf(cdp, selector, index),
					textAt: (x, y) => oracle.textAt(cdp, x, y),
					/** The tasks of `## list` in the file on disk. */
					tasks: async (list) => oracle.tasksOf(await obsidian.fileText(), list),
				},
				file: () => obsidian.fileText(),
				/** The stand's own reach (`window.__tcStand`): an edit from outside, the write delay. */
				stand: (call) => cdp.eval(`(() => { const r = window.__tcStand.${call}; return r === undefined ? 1 : r; })()`),
				target,
				notePath: obsidian.notePath,
				expect(ok, message) {
					if (!ok) failures.push(message);
					return ok;
				},
				async setStop(stop) {
					await cdp.eval(target.setStop(stop));
					await sleep(500);
				},
				async open() {
					await t.input.move(1, 1);
					await obsidian.openView();
					if (platform === "phone") await t.input.touchOn();
					await sleep(600);
				},
				/** Records every frame while `gesture` runs (and `settleMs` after), then checks them: the faults found. */
				async frames(gesture, { settleMs = 600, cast = null, ...checks } = {}) {
					const recorder = new FrameRecorder(cdp);
					const screencast = cast ? new Screencast(cdp, join(out, cast)) : null;
					await screencast?.start();
					await recorder.start();
					await gesture();
					await sleep(settleMs);
					const frames = await recorder.stop();
					await screencast?.stop();
					writeFileSync(join(out, `${cast ?? "frames"}.json`), JSON.stringify(frames));
					return frameFaults(frames, checks);
				},
				shot: (name) => screenshot(cdp, join(out, `${name}.png`)),
				replay: (recording, opts) => replay(cdp, join(ROOT, "tests/e2e/recordings", recording), opts),
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
			await obsidian.newTasks();
			await sleep(400);
			const errors = [];
			const off = cdp.on("Runtime.exceptionThrown", (e) => errors.push(e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text));
			try {
				await t.open();
				await scenario.run(t);
			} catch (error) {
				failures.push(`threw: ${error instanceof Error ? error.stack : String(error)}`);
			}
			off();
			for (const error of errors) failures.push(`page error: ${error}`);
			results.push({ scenario: scenario.name, features: scenario.features, platform, theme, failures, out });
			console.log(`${failures.length ? "FAIL" : "PASS"} ${scenario.name} [${platform}, ${theme}]${failures.map((f) => `\n    - ${f}`).join("")}`);
		}
	}
}
await obsidian.platform("desktop");
writeFileSync(join(obsidian.config.out, "results.json"), JSON.stringify(results, null, 1));
if (args.includes("--quit")) await obsidian.quit();
else obsidian.cdp.close();
const failed = results.filter((r) => r.failures.length);
console.log(`\n${results.length - failed.length}/${results.length} passed; output in ${obsidian.config.out}`);
process.exit(failed.length ? 1 : 0);
