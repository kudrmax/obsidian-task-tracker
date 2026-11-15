import { describe, expect, it } from "vitest";
import { currentLists, shownLists } from "../../../obsidian/ui/next/model/block";
import { cardRows, menuInput, openMenu } from "../../../obsidian/ui/next/model/menuNeeds";
import { type MenuMsg, type PanelPart, panelModel, type TaskMenuLayer } from "../../../obsidian/ui/next/model/taskMenu";
import { monthGrid } from "../../../obsidian/ui/next/model/monthGrid";
import { menuActMessage } from "../../../obsidian/ui/next/update/menu";
import { BlockLoop } from "./blockLoop";

const keyOf = (loop: BlockLoop, title: string): string => {
	const row = [...cardRows(loop.model).values()].find((r) => r.item.title === title);
	if (!row) throw new Error(`no card ${title}`);
	return row.key;
};

const menu = (loop: BlockLoop, msg: MenuMsg) => loop.send({ kind: "menu", msg });

const layerOf = (loop: BlockLoop): TaskMenuLayer => {
	const layer = loop.model.layers.find((l): l is TaskMenuLayer => l.kind === "taskMenu");
	if (!layer) throw new Error("no menu");
	return layer;
};

const parts = (loop: BlockLoop): readonly PanelPart[] => {
	const layer = layerOf(loop);
	const input = menuInput(loop.model, layer)!;
	return panelModel(layer, input).parts;
};

const opened = async () => {
	const loop = await BlockLoop.open();
	const key = keyOf(loop, "Idea");
	loop.send({ kind: "cardTapped", key, part: "card" });
	return { loop, key };
};

describe("a task's menu in the block", () => {
	it("opens over the card tapped, from its list's column, the core's model as a view answer", async () => {
		const { loop, key } = await opened();
		const layer = layerOf(loop);
		expect(layer).toMatchObject({ id: key, from: "inbox", page: "menu", closing: false, bulk: null });
		expect(loop.model.answers.get("menu")?.ok).toBe(true);
		expect(parts(loop).map((p) => p.key)).toEqual(expect.arrayContaining(["statuses", "moves", "edits", "opens", "remove"]));
	});

	it("a write pick runs at the tap and closes the menu over the lists as they stood (R10); they change once it has gone", async () => {
		const { loop } = await opened();
		const before = currentLists(loop.model);
		menu(loop, { kind: "status", id: "done" });
		expect(loop.calls).toContain("tasks.pickStatus");
		expect(layerOf(loop).closing).toBe(true);
		expect(shownLists(loop.model)).toEqual(before);
		expect(currentLists(loop.model)).not.toEqual(before);
		loop.send({ kind: "layerGone" });
		expect(loop.model.layers).toEqual([]);
		expect(shownLists(loop.model)).not.toEqual(before);
	});

	it("keeps what it drew while it fades, its task gone by its own pick", async () => {
		const { loop } = await opened();
		menu(loop, { kind: "remove" });
		expect(layerOf(loop).asking).toBe("delete");
		menu(loop, { kind: "confirm" });
		expect(loop.calls).toContain("tasks.remove");
		expect(layerOf(loop).frozen?.panel.parts.length).toBeGreaterThan(0);
	});

	it("closes when its task is gone from the file (P6 pin)", async () => {
		const { loop } = await opened();
		loop.runtime.call("tasks.remove", [menuInput(loop.model, layerOf(loop))!.tasks[0].key]);
		loop.settle();
		expect(layerOf(loop).closing).toBe(true);
	});

	it("a label keeps it open, drawn again in place for the tasks as they then stand", async () => {
		const { loop } = await opened();
		const seq = layerOf(loop).seq;
		menu(loop, { kind: "placed", place: { seq, copy: null, copies: new Map(), above: 0, panel: { left: 0, top: 0, bottom: null, maxHeight: null }, upper: null, long: [] } });
		const labels = menuInput(loop.model, layerOf(loop))!.menu.labels.tiles;
		if (labels.length === 0) return;
		menu(loop, { kind: "label", name: labels[0].label.name });
		expect(loop.calls).toContain("tasks.toggleLabel");
		expect(layerOf(loop)).toMatchObject({ closing: false, keepAbove: 0 });
		expect(layerOf(loop).seq).toBeGreaterThan(seq);
	});

	it("takes a measured place only for the panel it was measured for", async () => {
		const { loop } = await opened();
		const place = { copy: null, copies: new Map(), above: 1, panel: { left: 0, top: 0, bottom: null, maxHeight: null }, upper: null, long: [] };
		menu(loop, { kind: "placed", place: { ...place, seq: 99 } });
		expect(layerOf(loop).place).toBeNull();
		menu(loop, { kind: "placed", place: { ...place, seq: layerOf(loop).seq } });
		expect(layerOf(loop).place?.above).toBe(1);
	});

	it("shows its pages in place, and back", async () => {
		const { loop } = await opened();
		menu(loop, { kind: "page", page: "reminders" });
		expect(layerOf(loop).page).toBe("reminders");
		expect(parts(loop)[0]).toMatchObject({ kind: "back", title: "Reminder" });
		menu(loop, { kind: "page", page: "projects" });
		expect(parts(loop).map((p) => p.kind)).toEqual(["back", "rows", "row"]);
		menu(loop, { kind: "page", page: "projectName" });
		expect(loop.effects).toContainEqual({ kind: "focus", field: "projectName" });
		menu(loop, { kind: "page", page: "menu" });
		expect(layerOf(loop).page).toBe("menu");
	});

	it("steps the date page's month and puts the task off to the day picked", async () => {
		const { loop } = await opened();
		menu(loop, { kind: "page", page: "picker" });
		const title = (parts(loop)[0] as Extract<PanelPart, { kind: "picker" }>).title;
		expect(title).toBe("November 2026");
		menu(loop, { kind: "month", by: 1 });
		expect((parts(loop)[0] as Extract<PanelPart, { kind: "picker" }>).title).toBe("December 2026");
		menu(loop, { kind: "move", date: "2026-12-03" });
		expect(loop.calls).toContain("tasks.postpone");
		expect(layerOf(loop).closing).toBe(true);
	});

	it("writes the repeat page's rule once, as the menu closes, through the core's repeatPage.end", async () => {
		const { loop } = await opened();
		menu(loop, { kind: "page", page: "repeat" });
		menu(loop, { kind: "repeat", change: { what: "every", by: 1 } });
		expect(loop.calls).not.toContain("tasks.setRepeat");
		loop.send({ kind: "layerDismissed" });
		expect(loop.calls).toContain("repeatPage.end");
		expect(loop.calls).toContain("tasks.setRepeat");
	});

	it("hands Rename, Add subtask and New section to the field, and Add description to the full card, inside the tap", async () => {
		const { loop } = await opened();
		menu(loop, { kind: "edit", id: "rename" });
		expect(layerOf(loop).closing).toBe(true);
	});

	it("is ignored once closed: a late pick writes nothing", async () => {
		const { loop } = await opened();
		loop.send({ kind: "layerDismissed" });
		const calls = loop.calls.length;
		menu(loop, { kind: "level", prefix: "!" });
		expect(loop.calls.length).toBe(calls);
		expect(openMenu(loop.model)).toBeNull();
	});
});

describe("the bulk menu", () => {
	it("opens over the picked cards, words its title by their count, and writes for them all", async () => {
		const loop = await BlockLoop.open();
		const picked = [keyOf(loop, "Idea"), keyOf(loop, "Call the bank")];
		loop.model = { ...loop.model, select: { selecting: true, picked } };
		menu(loop, { kind: "openedBulk", at: { at: "over" } });
		expect(layerOf(loop).bulk).toEqual({ at: "over" });
		loop.settle();
		expect(parts(loop)[0]).toMatchObject({ kind: "title", text: "2 tasks" });
		const remove = parts(loop).find((p) => p.key === "remove");
		expect(remove).toMatchObject({ row: { label: "Delete 2 tasks" } });
		menu(loop, { kind: "move", date: "2026-11-20" });
		expect(loop.calls).toContain("tasks.postponeAll");
	});
});

describe("the menu's acts", () => {
	it("reads what each mark means", () => {
		expect(menuActMessage("status", "done")).toEqual({ kind: "status", id: "done" });
		expect(menuActMessage("status", "bogus")).toBeNull();
		expect(menuActMessage("section", "")).toEqual({ kind: "section", name: null });
		expect(menuActMessage("section", "=Errands")).toEqual({ kind: "section", name: "Errands" });
		expect(menuActMessage("project", "=Дружба")).toEqual({ kind: "project", name: "Дружба" });
		expect(menuActMessage("newProject", "  ")).toEqual({ kind: "page", page: "projects" });
		expect(menuActMessage("newProject", " Garden ")).toEqual({ kind: "newProject", name: "Garden" });
		expect(menuActMessage("repeat", "every:-1")).toEqual({ kind: "repeat", change: { what: "every", by: -1 } });
		expect(menuActMessage("repeat", "weekday:3")).toEqual({ kind: "repeat", change: { what: "weekday", day: 3 } });
		expect(menuActMessage("month", "1")).toEqual({ kind: "month", by: 1 });
	});
});

describe("the date page's month", () => {
	it("is six weeks from the Monday on or before the first", () => {
		const cells = monthGrid("2026-11-01", "2026-11-15", "2026-11-20");
		expect(cells).toHaveLength(42);
		expect(cells[0]).toMatchObject({ date: "2026-10-26", other: true });
		expect(cells.find((c) => c.today)?.date).toBe("2026-11-15");
		expect(cells.find((c) => c.selected)?.date).toBe("2026-11-20");
	});
});
