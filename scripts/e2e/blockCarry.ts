import type { Driver } from "./driver";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The block's shots: nothing of Obsidian's around it is compared. */
const SHOT = { masks: [] };

/**
 * The note's block, old or new (`newBlock`), on the note Дружба.md: the block at rest, a card carried within a list and
 * let go between two others, a card lifted and let go where it stood (it flies back), each step judged frame by frame.
 */
export async function blockCarry(d: Driver, newBlock: boolean): Promise<void> {
	{
		await d.page(`
			app.saveLocalStorage("task-calendar:new-screens", { newBlock: ${newBlock} });
			await app.plugins.disablePlugin("task-calendar");
			await app.plugins.enablePlugin("task-calendar");
			await app.workspace.getLeaf(false).openFile(app.vault.getAbstractFileByPath("Дружба.md"));
			for (let i = 0; i < 50 && !document.querySelector(".tc-n-block, .tc-project-block"); i++) await new Promise((r) => setTimeout(r, 100));
			document.querySelector(".tc-n-block, .tc-project-block").scrollIntoView({ block: "end" });
			return true;`);
		for (let i = 0; i < 50 && !(await d.page<boolean>("return __e2e.rows().length > 0")); i++) await sleep(100);
		await d.page("return __e2e.rest()");
	}
	await d.shot("block rows", SHOT);
	const titles = await d.page<string[]>(`return __e2e.texts(".workspace-leaf.mod-active :is(.tc-n-card, .tc-card) :is(.tc-n-card-title, .tc-card-title)")`);
	const last = titles[titles.length - 1];
	if (!last || titles.length < 3) throw new Error("the block shows too few cards to carry");
	const card = await d.page<{ x: number; y: number; w: number; h: number }>(`const c = [...document.querySelectorAll(".workspace-leaf.mod-active :is(.tc-n-card, .tc-card)")].find((e) => e.textContent.includes(${JSON.stringify(last)})); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 3, y: r.top + r.height / 2, w: r.width, h: r.height };`);
	const hold = d.platform === "phone" ? 450 : 0;
	await d.step("a card lifted and let go where it stood", "interaction", () => d.liftAndHold(card, 400), { carried: [last.slice(0, 60)], moves: [] });
	await d.shot("block after a carry let go home", SHOT);
	await d.step("a card carried up a list and let go", "interaction", () => d.drag(card, { x: card.x, y: card.y - card.h * 2 + 4 }, hold, 24, 20), { carried: [last.slice(0, 60)], expectMotion: true });
	await d.shot("block after a drop", SHOT);
}
