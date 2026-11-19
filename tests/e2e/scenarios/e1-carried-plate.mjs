import { carry, cardBy } from "../lib/carry.mjs";

/**
 * The carried card is a compact plate drawn around the point the pointer took it by (Max, 2026-11-18: the plate stood
 * far right of his mouse, because the grab was read before dnd-kit had measured the card). Taken near its left edge, its
 * middle and its right edge, and moved off at once as a hand does, the plate is under the pointer in every frame from
 * the first one it is drawn in.
 */
export default {
	name: "e1-carried-plate",
	features: ["E1: the carried plate under the pointer", "E1: a list's dashed place has no fill (Decision 59)"],
	async run(t) {
		await t.setStop("inbox");
		const [, second] = (await t.oracle.tasks("Inbox")).map((task) => task.title);
		for (const share of [0.05, 0.5, 0.95]) {
			const card = await cardBy(t, second, "inbox");
			const from = { x: card.left + card.width * share, y: card.y };
			await t.cdp.eval(`(() => { window.__plate = []; (function look(n) { const r = document.querySelector(".tc-overlay .tc-card")?.getBoundingClientRect(); if (r) window.__plate.push([r.left, r.right]); if (n < 90) requestAnimationFrame(() => look(n + 1)); })(0); return 1; })()`);
			let place = null;
			await carry(t, from, async () => ({ x: from.x, y: from.y + card.height }), { steps: 4, stepMs: 8, holdMs: 100, during: async () => {
				place = await t.cdp.eval(`(() => { const p = document.querySelector('[data-list="inbox"] :is(.tc-drag-source.is-lifted > .tc-card, .tc-card.is-lifted.is-waiting)'); return p ? getComputedStyle(p).backgroundColor : null; })()`);
			} });
			t.expect(place === "rgba(0, 0, 0, 0)" || place === "transparent", `a list's dashed place has no fill, only on the calendar it is filled (Max, 2026-11-19, Decision 59): ${place}`);
			await t.sleep(500);
			const plates = await t.cdp.eval(`window.__plate`);
			const off = plates.filter(([left, right]) => from.x < left || from.x > right);
			t.expect(plates.length > 0 && off.length === 0, `taken at ${share} of the card (pointer x ${Math.round(from.x)}), the plate is under it in every frame: ${plates.length} frames, off in ${JSON.stringify(off.slice(0, 3))}`);
		}
	},
};
