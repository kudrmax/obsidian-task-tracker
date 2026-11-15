import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openBlock, showBlock } from "./block";
import { TRACE_TAIL_MS, traced } from "./budget";
import { Driver, type Outcome } from "./driver";
import type { Fixture } from "./fixture";
import { budgetOfTrace, budgetSummary, judgeBudget } from "./frames";
import type { Platform, TestObsidian } from "./obsidian";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The new note block's budget (spec §Tests 6), apart from the old-against-new run: 300 tasks in the note's project, the
 * CPU slowed 4×, and for each of the block's gestures a trace judged as the screen's: under 8 ms of script in a frame,
 * no task over 16 ms.
 */
export async function blockBudget(obsidian: TestObsidian, fx: Fixture, run: string): Promise<Outcome[]> {
	const outcomes: Outcome[] = [];
	for (const platform of ["desktop", "phone"] as Platform[]) {
		await obsidian.reset(platform, "dark", { path: fx.tasksFile, text: fx.tasks });
		const d = new Driver(obsidian, platform, "dark", { baselines: join(run, "unused"), run }, false);
		await d.install();
		await openBlock(d, true);
		await obsidian.cdp.call("Emulation.setCPUThrottlingRate", { rate: 4 });
		const card = () => d.center(".tc-n-block .tc-n-card");
		const gestures: [string, () => Promise<void>][] = [
			["view menu, By project", async () => {
				await d.tapOn(".tc-n-block .tc-n-view-btn");
				await sleep(450);
				await d.tapOn(".tc-n-panel .tc-n-menu-label", "By project");
			}],
			["view menu, Rows", async () => {
				await d.tapOn(".tc-n-block .tc-n-view-btn");
				await sleep(450);
				await d.tapOn(".tc-n-panel .tc-n-menu-label", "Rows");
			}],
			["a card's menu", async () => {
				await d.tap(await card());
				await sleep(450);
				await d.key("Escape");
			}],
			["a task typed", async () => {
				await d.tapOn(".tc-n-block .tc-n-plus");
				await sleep(300);
				await d.type("Budget typed");
				await d.key("Enter");
				await sleep(300);
				await d.key("Escape");
			}],
			["drag a card", async () => {
				const at = await card();
				await d.drag(at, { x: at.x, y: at.y + at.h * 2.6 }, d.platform === "phone" ? 450 : 0, 24, 20);
			}],
		];
		try {
			for (const [name, act] of gestures) {
				await obsidian.cdp.call("Emulation.setCPUThrottlingRate", { rate: 1 });
				await showBlock(d);
				await obsidian.cdp.call("Emulation.setCPUThrottlingRate", { rate: 4 });
				await d.page("return __e2e.rest()");
				await d.page("__e2e.start(true); return true");
				let failed: string | null = null;
				const events = await traced(obsidian, async () => {
					await act().catch((e: unknown) => void (failed = e instanceof Error ? e.message : String(e)));
					await sleep(TRACE_TAIL_MS);
				});
				if (failed !== null) {
					outcomes.push({ combo: `block-budget-${platform}`, name, kind: "step", failures: [failed] });
					await d.key("Escape");
					continue;
				}
				await d.page("return __e2e.rest(10000)");
				await d.page("return __e2e.stop()");
				const b = budgetOfTrace(events);
				const failures = judgeBudget(b);
				const dir = join(run, `block-budget-${platform}`);
				mkdirSync(dir, { recursive: true });
				const file = join(dir, `${name}.json`);
				writeFileSync(file, JSON.stringify({ summary: budgetSummary(b), ...b, failures }, null, 1));
				outcomes.push({ combo: `block-budget-${platform}`, name: `${name}: ${budgetSummary(b)}`, kind: "step", failures, file });
			}
		} finally {
			await obsidian.cdp.call("Emulation.setCPUThrottlingRate", { rate: 1 });
		}
	}
	return outcomes;
}
