import type { Driver } from "./driver";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The shots' tolerances: the timeline's event texts are drawn over tinted grounds, a little looser. */
const SHOT = { regions: [{ name: "timeline", selector: ".tc-right", channel: 6, share: 0.003 }], masks: [] };

/**
 * The first smoke set, against today's (old) screen, to prove the harness: the view opened, the screen standing still,
 * the modes switched, All columns tried sideways (nothing may move), the projects panel opened, a project chosen and
 * all again, the panel closed, a swipe each way in Two columns, a card lifted and held, a card dragged in the day's
 * list. Each step is recorded and judged; each rest is shot against its baseline.
 */
export async function smoke(d: Driver): Promise<void> {
	const phone = d.platform === "phone";
	await d.step("open", "interaction", async () => {
		await d.page(`app.commands.executeCommandById("task-calendar:open"); return true`);
		for (let i = 0; i < 50 && !(await d.page<boolean>("return __e2e.rows().length > 0")); i++) await sleep(100);
	});
	await d.shot("open", SHOT);
	await d.step("standing still", "none", async () => void (await sleep(1200)));

	const twoColumns = phone ? "Columns" : "Two columns";
	for (const mode of ["Rows", "By project", twoColumns]) await chooseMode(d, mode, true);

	if (!phone) {
		await chooseMode(d, "All columns", true);
		const stage = await d.page<{ x: number; y: number; w: number; h: number }>(`return __e2e.rect("view")`);
		await d.step("All columns tried sideways", "none", () => d.swipe({ x: stage.x + stage.w * 0.3, y: stage.y + stage.h * 0.45 }, -stage.w * 0.4));
		await chooseMode(d, twoColumns, false, `mode ${twoColumns} again`);
	}

	await d.step("projects panel opens", "interaction", () => d.tapOn(".tc-folder-btn"));
	await d.shot("projects panel", SHOT);
	const names = await d.page<string[]>(`return __e2e.texts(".tc-tree-panel .tc-tree-name")`);
	const project = names.find((n) => !["All", "No project", "Done", ""].includes(n));
	if (!project) throw new Error("the fixture's tree has no project to choose");
	await d.step("a project chosen", "context", () => d.tapOn(".tc-tree-panel .tc-tree-name", project));
	await d.shot("project chosen", SHOT);
	if (phone) await d.step("projects panel opens again", "interaction", () => d.tapOn(".tc-folder-btn"));
	await d.step("all projects again", "context", () => d.tapOn(".tc-tree-panel .tc-tree-name", "All"));
	if (!phone) await d.step("projects panel closes", "interaction", () => d.tapOn(".tc-folder-btn"));

	const view = await d.page<{ x: number; y: number; w: number; h: number }>(`return __e2e.rect("view")`);
	/** A swipe starts on the content, clear of the divider in the middle: from the left quarter going back, the right going forward. */
	const left = { x: view.x + view.w * 0.2, y: view.y + view.h * 0.45 };
	const right = { x: view.x + view.w * 0.8, y: view.y + view.h * 0.45 };
	await d.step("swipe back", "swipe", () => d.swipe(left, view.w * 0.6), { expectPlaces: -1, expectMotion: true });
	await d.shot("swiped back", SHOT);
	await d.step("swipe forward", "swipe", () => d.swipe(right, -view.w * 0.6), { expectPlaces: 1, expectMotion: true });

	/** A finger lifts a card by holding it; the mouse by moving it (holding opens its menu). */
	const card = await d.center(".tc-left .tc-card");
	const title = await d.page<string>(`return document.querySelector(".tc-left .tc-card .tc-card-title")?.textContent?.trim() ?? ""`);
	await d.step("a card lifted and held", "interaction", () => d.liftAndHold(card, 900), { carried: [title], moves: [] });
	await d.step("drag a card", "interaction", () => d.drag(card, { x: card.x, y: card.y + card.h * 2.6 }, d.platform === "phone" ? 450 : 0, 24, 20), { carried: [title], expectMotion: true });
	await d.shot("dragged", SHOT);
}

/** The view menu's mode chosen: a context change, drawn in place. */
async function chooseMode(d: Driver, mode: string, shoot: boolean, name = `mode ${mode}`): Promise<void> {
	await d.step(name, "context", async () => {
		await d.tapOn(".tc-view-btn");
		await sleep(450);
		await d.tapOn(".tc-panel.is-view .tc-menu-label", mode);
	});
	if (shoot) await d.shot(`mode ${mode}`, SHOT);
}
