import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Driver, type Outcome } from "./driver";
import type { Fixture } from "./fixture";
import { judgeBudget } from "./frames";
import type { Platform, TestObsidian } from "./obsidian";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The budget run (spec §Tests 6), apart from the smoke set: 300 tasks, the CPU slowed 4×, and for each gesture the
 * script time per frame (CDP Performance's ScriptDuration over the frames drawn) and the long tasks the page saw.
 */
export async function budget(obsidian: TestObsidian, fx: Fixture, run: string): Promise<Outcome[]> {
	const outcomes: Outcome[] = [];
	for (const platform of ["desktop", "phone"] as Platform[]) {
		await obsidian.reset(platform, "dark", { path: fx.tasksFile, text: fx.tasks });
		const d = new Driver(obsidian, platform, "dark", { baselines: join(run, "unused"), run }, false);
		await d.install();
		await obsidian.cdp.call("Performance.enable");
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
				const script = async () => (await obsidian.cdp.call<{ metrics: { name: string; value: number }[] }>("Performance.getMetrics")).metrics.find((m) => m.name === "ScriptDuration")?.value ?? 0;
				const before = await script();
				await d.page("__e2e.start(true); return true");
				await act();
				await d.page("return __e2e.rest(10000)");
				const recorded = await d.page<{ rafs: number; longTasks: { t: number; ms: number }[] }>("const r = __e2e.stop(); return { rafs: r.rafs, longTasks: r.longTasks }");
				const scriptMs = ((await script()) - before) * 1000;
				const failures = judgeBudget({ frames: recorded.rafs, scriptMs, longTasks: recorded.longTasks });
				const dir = join(run, `budget-${platform}`);
				mkdirSync(dir, { recursive: true });
				const file = join(dir, `${name}.json`);
				writeFileSync(file, JSON.stringify({ frames: recorded.rafs, scriptMs, perFrame: scriptMs / Math.max(1, recorded.rafs), longTasks: recorded.longTasks, failures }, null, 1));
				outcomes.push({ combo: `budget-${platform}`, name: `${name}: ${(scriptMs / Math.max(1, recorded.rafs)).toFixed(2)} ms/frame over ${recorded.rafs} frames, ${recorded.longTasks.length} long tasks`, kind: "step", failures, file });
			}
		} finally {
			await obsidian.cdp.call("Emulation.setCPUThrottlingRate", { rate: 1 });
		}
	}
	return outcomes;
}
