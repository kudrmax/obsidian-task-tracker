import { carry, cardBy } from "../lib/carry.mjs";

/**
 * Drag and drop with the timeline (docs/plugin/tasks.md, «Перетаскивание»), at two zooms: a card let go with its top on an
 * hour's line has that hour in the file, no duration; a block moved keeps its duration; a block let go on the day's list
 * loses its time. The oracle is the hour label a person aims at and the file.
 */
export default {
	name: "drag-timeline",
	features: ["F155", "F156", "F157", "F163"],
	async run(t) {
		/** The hour lines in sight, each with its label's words and its height on the screen. */
		const lines = (free = true) =>
			t.cdp.eval(`(() => {
				const tl = document.querySelector(".tc-timeline").getBoundingClientRect();
				/** Hours still to come today: a time already past rides the now line (F96), not this check's. */
				const now = document.querySelector(".tc-now")?.getBoundingClientRect().top ?? -Infinity;
				return [...document.querySelectorAll(".tc-hour-label:not(.is-minor)")].map((label) => {
					const line = label.nextElementSibling.getBoundingClientRect();
					return { hour: label.textContent, y: line.top, x: tl.left + tl.width / 2 };
				}).filter((l) => l.y > Math.max(tl.top + 60, now + 30) && l.y < tl.bottom - 120)
					/** A free hour: a task put where another stands is stacked under it (F92), not this check's. */
					.filter((l) => !${free} || ![...document.querySelectorAll(".tc-block")].some((b) => { const r = b.getBoundingClientRect(); return r.bottom > l.y - 2 && r.top < l.y + 48; }));
			})()`);
		const slotOf = async (title) => {
			const line = (await t.file()).split("\n").find((l) => l.includes(title));
			return /📌 \S+ (\d\d):(\d\d)(?:-(\d\d):(\d\d))?/u.exec(line ?? "");
		};
		for (const zoom of [56, 112]) {
			await t.cdp.eval(`${t.target.deviceSettings}.set({ zoom: ${zoom} }).then(() => 1)`);
			await t.setPlace("calendar");
			await t.open();
			/** The evening, past the day's timed tasks: scrolled to as a person scrolls, with the wheel. */
			const tl = await t.oracle.rect(".tc-timeline");
			for (let i = 0; i < 12; i++) {
				void t.input.wheel(tl.x, tl.y, 0, zoom * 0.5);
				await t.sleep(30);
			}
			await t.sleep(400);
			const [target] = await lines();
			const today = (await t.oracle.tasks("Now")).filter((task) => !task.timed && task.status === " " && /\d+$/.test(task.title));
			const title = today[zoom === 56 ? 0 : 1].title;
			const card = await cardBy(t, title, "day");
			const grab = card.y - card.top;
			const faults = await t.frames(() => carry(t, card, async () => ({ x: target.x, y: target.y + grab })), { cast: `list-to-timeline-${zoom}`, maxStep: 60, carried: { id: card.id, from: 0, until: 1500 } });
			await t.sleep(600);
			const slot = await slotOf(title);
			t.expect(slot !== null && slot[1] === target.hour && slot[2] === "00" && slot[3] === undefined, `zoom ${zoom}: let go with its top on «${target.hour}», the task is at ${target.hour}:00 with no duration: ${slot?.[0]}`);
			const block = await t.oracle.rect(`[data-block="${card.id}"]`);
			const line = (await lines(false)).find((l) => l.hour === target.hour);
			t.expect(block && line && Math.abs(block.top - line.y) <= 2, `zoom ${zoom}: its block's top stands on that line: ${block?.top} and ${line?.y}`);
			t.expect(faults.length === 0, `zoom ${zoom}, frames of a card onto the timeline: ${JSON.stringify(faults.slice(0, 4))}`);

			/** The block moved down an hour: a new start, its duration kept. */
			const before = await t.oracle.rect(`[data-block="${card.id}"]`);
			const next = (await lines()).find((l) => Number(l.hour) === (Number(target.hour) + 1) % 24);
			if (next) {
				await carry(t, { x: before.x, y: before.top + 8 }, async () => ({ x: before.x, y: next.y + 8 }));
				await t.sleep(600);
				const moved = await slotOf(title);
				t.expect(moved?.[1] === next.hour && moved?.[2] === "00", `zoom ${zoom}: the block moved to «${next.hour}» starts there: ${moved?.[0]}`);
			}

			/** Back onto the day's list: its time is gone, the task stays today's. */
			const there = await t.oracle.rect(`[data-block="${card.id}"]`);
			const first = await t.oracle.rect('[data-list="day"] .tc-card');
			let seen = null;
			const back = await t.frames(() => carry(t, { x: there.x, y: there.top + 8 }, async () => ({ x: first.x, y: first.top + 3 }), { during: async () => (seen = await t.cdp.eval(`JSON.stringify({ drag: window.__tcStandScreen?.store.getState().drag, under: document.elementFromPoint(${there.x}, ${there.top + 8})?.className })`)) }), { cast: `timeline-to-list-${zoom}`, maxStep: 60, carried: { id: card.id, from: 0, until: 1500 } });
			await t.sleep(600);
			t.expect((await slotOf(title)) === null && (await t.oracle.cards("day")).includes(title), `zoom ${zoom}: let go on the day's list, the task has no time and stands in the list (${seen})`);
			t.expect(back.length === 0, `zoom ${zoom}, frames of a block onto the list: ${JSON.stringify(back.slice(0, 4))}`);
		}
		await t.cdp.eval(`${t.target.deviceSettings}.set({ zoom: 56 }).then(() => 1)`);
	},
};
