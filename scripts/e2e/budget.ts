import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Driver, type Outcome } from "./driver";
import type { Fixture } from "./fixture";
import { budgetOfTrace, budgetSummary, judgeBudget } from "./frames";
import type { Platform, TestObsidian } from "./obsidian";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** How long a trace runs on after the gesture: longer than any transition the screen runs (the slowest is under 400 ms). */
export const TRACE_TAIL_MS = 1200;

/** The page's trace while `act` runs (CDP Tracing: the timeline's tasks, script and frames). */
export async function traced(obsidian: TestObsidian, act: () => Promise<void>): Promise<Parameters<typeof budgetOfTrace>[0]> {
	const events: Parameters<typeof budgetOfTrace>[0][number][] = [];
	const offData = obsidian.cdp.on("Tracing.dataCollected", (p) => void events.push(...(p.value as typeof events)));
	const complete = new Promise<void>((resolve) => {
		const off = obsidian.cdp.on("Tracing.tracingComplete", () => {
			off();
			resolve();
		});
	});
	await obsidian.cdp.call("Tracing.start", { transferMode: "ReportEvents", traceConfig: { includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "toplevel", "v8.execute", "__metadata"] } });
	try {
		await act();
	} finally {
		await obsidian.cdp.call("Tracing.end");
		await Promise.race([complete, sleep(20_000)]);
		offData();
	}
	return events;
}

/**
 * The budget run (spec §Tests 6), apart from the smoke set: 300 tasks, the CPU slowed 4×, and for each gesture a trace:
 * the script in each frame (its worst and its average over the frames that ran script), the longest frame, and every
 * main-thread task over 16 ms.
 */
export async function budget(obsidian: TestObsidian, fx: Fixture, run: string): Promise<Outcome[]> {
	const outcomes: Outcome[] = [];
	for (const platform of ["desktop", "phone"] as Platform[]) {
		await obsidian.reset(platform, "dark", { path: fx.tasksFile, text: fx.tasks });
		const d = new Driver(obsidian, platform, "dark", { baselines: join(run, "unused"), run }, false);
		await d.install();
		await d.page(`app.commands.executeCommandById("task-calendar:open"); return true`);
		for (let i = 0; i < 50 && !(await d.page<boolean>("return __e2e.view()")); i++) await sleep(100);
		await d.page("return __e2e.rest()");
		await obsidian.cdp.call("Emulation.setCPUThrottlingRate", { rate: 4 });
		const view = await d.page<{ x: number; y: number; w: number; h: number }>(`return __e2e.rect("view")`);
		const left = { x: view.x + view.w * 0.2, y: view.y + view.h * 0.45 };
		const right = { x: view.x + view.w * 0.8, y: view.y + view.h * 0.45 };
		const gestures: [string, () => Promise<void>][] = [
			["swipe back", () => d.swipe(left, view.w * 0.6)],
			["swipe forward", () => d.swipe(right, -view.w * 0.6)],
			["drag a card", async () => {
				const card = await d.center(".tc-left .tc-card");
				await d.drag(card, { x: card.x, y: card.y + card.h * 2.6 }, d.platform === "phone" ? 450 : 0, 24, 20);
			}],
			["mode Rows", async () => {
				await d.tapOn(".tc-view-btn");
				await sleep(450);
				await d.tapOn(".tc-panel.is-view .tc-menu-label", "Rows");
			}],
		];
		try {
			for (const [name, act] of gestures) {
				await d.page("return __e2e.rest()");
				await d.page("__e2e.start(true); return true");
				/** The gesture and a fixed tail for what it set moving; the harness's wait for rest runs after the trace. */
				const events = await traced(obsidian, async () => {
					await act();
					await sleep(TRACE_TAIL_MS);
				});
				await d.page("return __e2e.rest(10000)");
				await d.page("return __e2e.stop()");
				const b = budgetOfTrace(events);
				const failures = judgeBudget(b);
				const dir = join(run, `budget-${platform}`);
				mkdirSync(dir, { recursive: true });
				const file = join(dir, `${name}.json`);
				writeFileSync(file, JSON.stringify({ summary: budgetSummary(b), ...b, failures }, null, 1));
				outcomes.push({ combo: `budget-${platform}`, name: `${name}: ${budgetSummary(b)}`, kind: "step", failures, file });
			}
		} finally {
			await obsidian.cdp.call("Emulation.setCPUThrottlingRate", { rate: 1 });
		}
	}
	return outcomes;
}
