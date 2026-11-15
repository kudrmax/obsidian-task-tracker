import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { budget } from "./budget";
import { Driver, type Outcome } from "./driver";
import { type Fixture, fixture } from "./fixture";
import { type Platform, prepareVault, TestObsidian, type Theme } from "./obsidian";
import { type Paths, paths } from "./paths";
import { smoke } from "./smoke";
import { blockCarry } from "./blockCarry";

const USAGE = `npm run e2e -- <command>
  smoke [--update] [--refresh-fixture]   the smoke set on desktop and phone view, dark and light; --update records the baselines
  budget                                 the budget run: 4x CPU, 300 tasks, script per frame and long tasks
  open                                   launch the test Obsidian and leave it running (for a look by hand)
  try <desktop|phone> <dark|light>       the smoke set once, in the running one
  carry <desktop|phone> <dark|light> <old|new>  the note block's carry, in the running one (new: newBlock on)
  eval "<js>"                            evaluate in the running one (an async function body)
  shot <file.png>                        a screenshot of the running one
  quit                                   quit the running one
Environment: E2E_WORK (the profile and scratch vault; default .e2e/work), E2E_HOME (default .e2e).`;

const COMBOS: readonly [Platform, Theme][] = [
	["desktop", "dark"],
	["desktop", "light"],
	["phone", "dark"],
	["phone", "light"],
];

const runDir = (p: Paths) => join(p.runs, new Date().toISOString().replace(/[:.]/g, "-"));

async function smokeIn(obsidian: TestObsidian, fx: Fixture, combos: readonly [Platform, Theme][], p: Paths, run: string, update: boolean): Promise<Outcome[]> {
	const outcomes: Outcome[] = [];
	for (const [platform, theme] of combos) {
		await obsidian.reset(platform, theme, { path: fx.tasksFile, text: fx.tasks });
		const driver = new Driver(obsidian, platform, theme, { baselines: p.baselines, run }, update);
		await driver.install();
		try {
			await smoke(driver);
		} catch (e) {
			driver.outcomes.push({ combo: driver.combo, name: "the scenario", kind: "step", failures: [e instanceof Error ? e.message : String(e)] });
		}
		outcomes.push(...driver.outcomes);
	}
	return outcomes;
}

function report(outcomes: readonly Outcome[], run: string): number {
	for (const o of outcomes) console.log(`${o.failures.length ? "FAIL" : "ok  "} ${o.combo} ${o.kind} ${o.name}${o.file ? `  ${o.file}` : ""}${o.failures.map((f) => `\n       ${f}`).join("")}`);
	const failed = outcomes.filter((o) => o.failures.length > 0).length;
	console.log(`\n${outcomes.length - failed} passed, ${failed} failed; the run: ${run}`);
	return failed > 0 ? 1 : 0;
}

/** `npm run e2e -- <command>`. */
export async function main(argv: readonly string[]): Promise<number> {
	const p = paths();
	const command = argv.find((a) => !a.startsWith("--")) ?? "smoke";
	const args = argv.slice(argv.indexOf(command) + 1).filter((a) => !a.startsWith("--"));
	if (["eval", "shot", "quit", "try", "carry"].includes(command)) {
		const obsidian = await TestObsidian.attach(p);
		try {
			if (command === "eval") console.log(JSON.stringify(await obsidian.cdp.eval(args[0]), null, 1));
			if (command === "shot") {
				const shot = await obsidian.cdp.call<{ data: string }>("Page.captureScreenshot", { format: "png" });
				writeFileSync(args[0], Buffer.from(shot.data, "base64"));
			}
			if (command === "try") {
				const run = runDir(p);
				return report(await smokeIn(obsidian, fixture(p, false), [[args[0] as Platform, args[1] as Theme]], p, run, argv.includes("--update")), run);
			}
			if (command === "carry") {
				const run = runDir(p);
				const fx = fixture(p, false);
				const [platform, theme, which] = args as [Platform, Theme, string];
				await obsidian.reset(platform, theme, { path: fx.tasksFile, text: fx.tasks });
				const driver = new Driver(obsidian, platform, theme, { baselines: join(p.baselines, "block"), run: join(run, which) }, argv.includes("--update"));
				await driver.install();
				try {
					await blockCarry(driver, which === "new");
				} catch (e) {
					driver.outcomes.push({ combo: driver.combo, name: "the scenario", kind: "step", failures: [e instanceof Error ? e.message : String(e)] });
				}
				return report(driver.outcomes, run);
			}
			if (command === "quit") await obsidian.quit();
			return 0;
		} finally {
			obsidian.cdp.close();
		}
	}
	if (!["smoke", "budget", "open"].includes(command)) {
		console.log(USAGE);
		return 2;
	}
	execFileSync("node", ["esbuild.config.mjs", "production", "e2e"], { cwd: p.root, stdio: "inherit" });
	const taken = fixture(p, argv.includes("--refresh-fixture"));
	const fx = command === "budget" ? { ...taken, tasks: budgetTasks(taken.tasks) } : taken;
	prepareVault(p, fx);
	const obsidian = await TestObsidian.launch(p);
	if (command === "open") {
		console.log(`the test Obsidian is up on port ${obsidian.port}`);
		obsidian.cdp.close();
		return 0;
	}
	const run = runDir(p);
	try {
		if (command === "budget") return report(await budget(obsidian, fx, run), run);
		return report(await smokeIn(obsidian, fx, COMBOS, p, run, argv.includes("--update")), run);
	} finally {
		await obsidian.quit();
	}
}

/** The fixture's file with tasks added to its Backlog until it holds 300 (the budget's load, §Tests 6). */
export function budgetTasks(text: string): string {
	const count = (text.match(/^\s*- \[[ x-]\] /gm) ?? []).length;
	const more = Array.from({ length: Math.max(0, 300 - count) }, (_, i) => `- [ ] Budget task ${i + 1}`);
	if (more.length === 0) return text;
	return /^## Backlog\s*$/m.test(text) ? text.replace(/^## Backlog\s*$/m, (h) => `${h}\n\n${more.join("\n")}`) : `${text}\n## Backlog\n\n${more.join("\n")}\n`;
}
