import type { Driver } from "./driver";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The shots' tolerances: the timeline's event texts are drawn over tinted grounds, a little looser. */
const SHOT = { regions: [{ name: "timeline", selector: ".tc-right", channel: 24, share: 0.003 }], masks: [] };

/**
 * The first smoke set, against today's (old) screen, to prove the harness: the view opened, the screen standing still,
 * the modes switched, the projects panel opened and closed, a swipe each way in Two columns, a card dragged in the day's
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
	for (const mode of ["Rows", "By project", twoColumns]) {
		await d.step(`mode ${mode}`, "context", async () => {
			await d.tapOn(".tc-view-btn");
			await sleep(450);
			await d.tapOn(".tc-panel.is-view .tc-menu-label", mode);
		});
		await d.shot(`mode ${mode}`, SHOT);
	}

	await d.step("projects panel opens", "interaction", () => d.tapOn(".tc-folder-btn"));
	await d.shot("projects panel", SHOT);
	await d.step("projects panel closes", "interaction", async () => {
		if (!phone) return d.tapOn(".tc-folder-btn");
		const dim = await d.page<{ x: number; y: number; w: number; h: number }>(`return __e2e.rect(".tc-tree-dim")`);
		await d.tap({ x: dim.x + dim.w - 12, y: dim.y + dim.h / 2 });
	});

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
	await d.step("drag a card", "interaction", () => d.drag(card, { x: card.x, y: card.y + card.h * 2.6 }, d.platform === "phone" ? 450 : 0, 24, 20), { carried: [title], expectMotion: true });
	await d.shot("dragged", SHOT);
}
