import { describe, expect, it } from "vitest";
import type { Destination, ListId, ScreenData, ScreenPort } from "../../../obsidian/ui/engine/port";

/** A port made for one check, its writes taking `delay` ms to land and be read back. */
export type PortMaker = (delay: number) => Promise<ScreenPort>;

/** The write delays every port is checked at: none, a real write and its read-back, a slow one. */
export const CONTRACT_DELAYS = [0, 30, 300] as const;

/** What a list draws, as the engine reads it: each row's kind, id and depth. */
const shapeOf = (data: ScreenData) => ({
	lists: (["inbox", "soon", "day"] as const).map((list) => data.lists[list].rows.map((row) => (row.kind === "task" ? `${row.id}@${row.depth}` : `§${row.id}`))),
	blocks: data.day.blocks.map((block) => `${block.id}@${block.start}`),
});

const firstTask = (data: ScreenData, list: ListId): string => {
	const row = data.lists[list].rows.find((r) => r.kind === "task");
	if (!row) throw new Error(`no task in ${list}`);
	return row.id;
};

/** A move every port takes: Inbox's first task to the end of Soon, at the top level. */
const toSoon = (): Destination => ({ list: "soon", before: null, dayOffset: 0, depth: 0 });

/**
 * The `ScreenPort` contract (spec 2026-11-18, «Data and writes»; the plan's step 5): what every port answers, whatever
 * rules sit behind it. The stand's `MockPort` and `CorePort` both run it.
 */
export function describeScreenPort(name: string, make: PortMaker): void {
	describe(`${name} keeps the ScreenPort contract`, () => {
		it("answers a screen: three lists whose task rows each have a card, a day with its hours and blocks that have cards", async () => {
			const port = await make(0);
			const data = port.read(0);
			for (const list of ["inbox", "soon", "day"] as const) {
				expect(typeof data.lists[list].title).toBe("string");
				for (const row of data.lists[list].rows) if (row.kind === "task") expect(data.cards[row.id]?.id).toBe(row.id);
			}
			expect(data.day.hours).toHaveLength(24);
			expect(data.day.isToday).toBe(true);
			for (const block of data.day.blocks) expect(data.cards[block.id]?.id).toBe(block.id);
			expect(port.read(1).day.isToday).toBe(false);
		});

		it("answers the same object for the same day until something changes", async () => {
			const port = await make(0);
			expect(port.read(0)).toBe(port.read(0));
		});

		it("tells the clock: the present minute and the time the now line writes", async () => {
			const port = await make(0);
			const now = port.now();
			expect(now.label).toBe(port.clockAt(now.minute));
		});

		for (const delay of CONTRACT_DELAYS) {
			it(`draws a move's preview as the move's result, the write landing after ${delay} ms and read back before it resolves`, async () => {
				const port = await make(delay);
				const before = port.read(0);
				const id = firstTask(before, "inbox");
				expect(port.takes(id, toSoon())).toBe(true);
				const preview = port.preview(id, toSoon());
				let told = 0;
				const off = port.subscribe(() => told++);
				const written = port.move(id, toSoon());
				if (delay > 0) expect(shapeOf(port.read(0))).toEqual(shapeOf(before));
				await written;
				expect(told).toBeGreaterThan(0);
				expect(shapeOf(port.read(0))).toEqual(shapeOf(preview));
				off();
			});
		}

		for (const delay of CONTRACT_DELAYS) {
			it(`writes two tasks typed in a row in their order, the second a level in under the first, its write not awaited (${delay} ms)`, async () => {
				const port = await make(delay);
				const draft = { level: null, projects: [], descriptionLine: null, section: false };
				const first = { at: port.listEnd("inbox", 0), renaming: null, stack: false };
				const typed = port.commit(first, "AAA", draft, true);
				if (!typed.next) throw new Error("no next field");
				await new Promise((resolve) => setTimeout(resolve, delay / 2));
				const offered = port.entryBar(typed.next, typed.draft, "").bar.some((group) => group.actions.some((action) => action.id === "indent" && !action.disabled));
				expect(offered).toBe(true);
				const shifted = { ...typed.next, at: { ...typed.next.at, under: undefined, depth: (typed.next.at.depth ?? 0) + 1 } };
				const second = port.commit(shifted, "BBB", typed.draft, false);
				await Promise.all([typed.write, second.write]);
				await new Promise((resolve) => setTimeout(resolve, delay + 50));
				const data = port.read(0);
				const rows = data.lists.inbox.rows.flatMap((row) => (row.kind === "task" ? [{ title: data.cards[row.id].title, depth: row.depth }] : []));
				const at = rows.findIndex((row) => row.title === "AAA");
				expect(rows.slice(at, at + 2)).toEqual([
					{ title: "AAA", depth: rows[at]?.depth },
					{ title: "BBB", depth: (rows[at]?.depth ?? 0) + 1 },
				]);
			});
		}

		it("keeps a task's id through a move, a rename, a status and a drop onto the calendar; a new task never takes an old id", async () => {
			const port = await make(0);
			const titleOf = (id: string) => {
				for (let day = 0; day <= 1; day++) {
					const card = port.read(day).cards[id];
					if (card) return card.title;
				}
				return null;
			};
			const before = port.read(0);
			const id = firstTask(before, "inbox");
			const seen = new Set([...Object.keys(before.cards), ...Object.keys(port.read(1).cards)]);
			await port.move(id, toSoon());
			expect(port.read(0).lists.soon.rows.some((row) => row.id === id)).toBe(true);
			const rename = port.rename(id, "list", 0);
			await port.commit(rename.field, "Переименована", rename.draft, false).write;
			expect(titleOf(id)).toBe("Переименована");
			await port.act(id, { kind: "status", id: "inProgress" }, "list", 0);
			expect(port.read(0).cards[id]?.inProgress).toBe(true);
			await port.move(id, { list: "day", before: null, dayOffset: 0, at: 23 * 60 });
			expect(port.read(0).day.blocks.some((block) => block.id === id)).toBe(true);
			const typed = port.commit({ at: port.listEnd("inbox", 0), renaming: null, stack: false }, "Совсем новая", { level: null, projects: [], descriptionLine: null, section: false }, false);
			await typed.write;
			const fresh = Object.keys(port.read(0).cards).find((key) => port.read(0).cards[key].title === "Совсем новая");
			expect(fresh !== undefined && !seen.has(fresh)).toBe(true);
		});

		it("stops telling a listener once it unsubscribes", async () => {
			const port = await make(0);
			let told = 0;
			const off = port.subscribe(() => told++);
			off();
			await port.move(firstTask(port.read(0), "inbox"), toSoon());
			expect(told).toBe(0);
		});

		it("stretches a block ahead of the clock while its dot is held, and says where a let-go dot puts it", async () => {
			const port = await make(0);
			const ahead = port.now().minute;
			const block = port.read(0).day.blocks.find((b) => b.length !== null && b.start > ahead);
			if (!block) throw new Error("no block with a length ahead of the clock");
			const later = block.start + (block.length ?? 0) + 30;
			const stretched = port.stretched(block.id, 0, "end", later).day.blocks.find((b) => b.id === block.id);
			expect(stretched?.length).toBe(later - (stretched?.start ?? 0));
			const to = port.resized(block.id, 0, "end", later, 15);
			expect(to?.end).toBe(later);
			expect(port.resized(block.id, 0, "end", block.start + (block.length ?? 0), 15)).toBeNull();
		});

		it("offers a task's menu and an event's", async () => {
			const port = await make(0);
			const data = port.read(0);
			const menu = port.menu(firstTask(data, "inbox"), "list", 0);
			expect(menu.kind).toBe("task");
			if (menu.kind === "task") expect(menu.layout.length).toBeGreaterThan(0);
			const event = data.day.events[0];
			if (event) expect(port.menu(event.id, "calendar", 0)).toEqual({ kind: "event", title: event.title });
		});

		it("opens the plus's field in the day's list while it shows, else in Inbox", async () => {
			const port = await make(0);
			expect(port.newTaskPlace(0, ["day"]).list).toBe("day");
			expect(port.newTaskPlace(0, ["inbox", "soon"]).list).toBe("inbox");
		});
	});
}
