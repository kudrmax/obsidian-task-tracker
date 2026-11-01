// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NewTaskPlace, Placement, TaskDraft, TaskItem, TaskKey } from "../../src/application/contracts";
import type { RightMode } from "../../src/settings";
import type { DragPayload, DropResult, DropTarget, ListColumn, PlacedResult } from "../../src/ui/drag/DropTarget";
import { GestureArbiter } from "../../src/ui/gestures";
import { type ColumnDrop, QuickEntryController } from "../../src/ui/quick/QuickEntryController";
import { TaskList } from "../../src/ui/TaskList";

const TODAY = "2026-11-01";
const COLUMNS: readonly ListColumn[] = ["left", "soon", "inbox"];

const key = (section: TaskKey["section"], index: number, path: number[] = []): TaskKey => ({ section, index, path, raw: `${section}${index}${path.join("")}` });

const item = (text: string, k: TaskKey, group: string | null = null, subtasks: TaskItem[] = []): TaskItem => ({
	key: k,
	text,
	status: "todo",
	dueDate: null,
	slot: null,
	priority: null,
	group,
	subtasks,
	progress: null,
	parentText: null,
});

interface SetUp {
	mode?: RightMode;
	day?: string;
	items?: Partial<Record<ListColumn, TaskItem[]>>;
}

function setUp({ mode: startMode = "calendar", day: startDay = TODAY, items = {} }: SetUp = {}) {
	const root = document.createElement("div");
	document.body.appendChild(root);
	let mode = startMode;
	let day = startDay;
	const turned: RightMode[] = [];
	const buttons = [{ shown: true }, { shown: true }, { shown: true }];
	const created: { text: string; priority: string | null; place: NewTaskPlace }[] = [];
	const edits: { key: TaskKey; draft: TaskDraft }[] = [];
	const beginNew = vi.fn<(source: HTMLElement, e: PointerEvent, targets: readonly DropTarget[], onDrop: (result: PlacedResult | null) => void) => void>();
	const drops: ColumnDrop[] = [];
	const lists = {} as Record<ListColumn, TaskList>;
	let controller: QuickEntryController | null = null;
	for (const column of COLUMNS) {
		lists[column] = new TaskList(root.appendChild(document.createElement("div")), {
			items: () => items[column] ?? [],
			day: () => null,
			grouped: () => column !== "left",
			entry: () => controller?.entryIn(column) ?? null,
			onCard: (card, it) => controller?.dress(card, it),
		});
	}
	const render = () => {
		for (const column of COLUMNS) lists[column].render();
		controller?.rendered();
	};
	controller = new QuickEntryController({
		root,
		tasks: {
			createInPlace: async (text, priority, place) => {
				created.push({ text, priority, place });
			},
			edit: async (k, draft) => {
				edits.push({ key: k, draft });
			},
			placementOf: (): Placement => ({ kind: "now" }),
		},
		arbiter: new GestureArbiter(),
		drag: { beginNew },
		list: (column) => lists[column],
		newTasks: () => buttons,
		dropTargets: () => ({ lists: drops, timeline: null }),
		levels: () => [{ prefix: "p1", color: "red" }],
		today: () => TODAY,
		day: () => day,
		mode: () => mode,
		turnTo: (to) => {
			turned.push(to);
			mode = to;
		},
		showDay: async (date) => {
			day = date;
			render();
		},
		fresh: async () => {},
		render,
		onError: vi.fn(),
	});
	render();
	const plus = root.querySelector<HTMLElement>(".tc-plus")!;
	const field = () => root.querySelector<HTMLTextAreaElement>("textarea.tc-quick-field");
	const rowsOf = (column: ListColumn) => [...lists[column].el.children].map((row) => (row.classList.contains("tc-quick-row") ? "field" : row.textContent || row.className));
	const type = (text: string) => {
		field()!.value = text;
		field()!.dispatchEvent(new Event("input", { bubbles: true }));
	};
	const press = (k: string) => field()!.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
	const setMode = (to: RightMode) => {
		mode = to;
		render();
	};
	return { controller, root, plus, field, lists, rowsOf, type, press, buttons, created, edits, beginNew, drops, turned, setMode, day: () => day };
}

afterEach(() => {
	document.body.replaceChildren();
});

describe("QuickEntryController", () => {
	describe("where a task written in a column goes", () => {
		const task = { kind: "task", group: "Work", before: key("now", 2) } as const;

		it("the day column of today: Now", () => {
			expect(setUp().controller.placeOf("left", task)).toEqual({ kind: "list", list: "now", group: "Work", before: key("now", 2) });
		});

		it("the day column of a later day: Soon with that day", () => {
			expect(setUp({ day: "2026-11-05" }).controller.placeOf("left", task)).toEqual({ kind: "list", list: "soon", group: "Work", before: key("now", 2), date: "2026-11-05" });
		});

		it("the day column of a past day: Now with that day", () => {
			expect(setUp({ day: "2026-10-28" }).controller.placeOf("left", task)).toEqual({ kind: "list", list: "now", group: "Work", before: key("now", 2), date: "2026-10-28" });
		});

		it("Soon and Inbox: their own lists", () => {
			const { controller } = setUp();
			expect(controller.placeOf("soon", task)).toEqual({ kind: "list", list: "soon", group: "Work", before: key("now", 2) });
			expect(controller.placeOf("inbox", task)).toEqual({ kind: "list", list: "inbox", group: "Work", before: key("now", 2) });
		});

		it("a subtask: under its task, wherever the column", () => {
			expect(setUp().controller.placeOf("inbox", { kind: "subtask", parent: key("inbox", 0), before: null })).toEqual({ kind: "subtask", parent: key("inbox", 0), before: null });
		});
	});

	describe("the plus", () => {
		const items = { left: [item("A", key("now", 0))], inbox: [item("I", key("inbox", 0), "Home"), item("J", key("inbox", 1), "Work")] };

		it("tapped, opens the field at the end of the day column while it shows", () => {
			for (const mode of ["calendar", "soon"] as const) {
				const { controller, rowsOf, field } = setUp({ mode, items });
				controller.openFromPlus();
				expect(rowsOf("left")).toEqual(["A", "field"]);
				expect(document.activeElement).toBe(field());
			}
		});

		it("tapped with Inbox and Soon on screen, opens it at the end of Inbox, in its last section", () => {
			const { controller, rowsOf } = setUp({ mode: "inbox", items });
			controller.openFromPlus();
			expect(rowsOf("inbox")).toEqual(["Home", "I", "Work", "J", "field"]);
			expect(rowsOf("left")).toEqual(["A"]);
		});

		it("hides while the field is open, and comes back when it closes", () => {
			const { controller, plus, press } = setUp({ items });
			expect(plus.classList.contains("is-hidden")).toBe(false);
			controller.openFromPlus();
			expect(plus.classList.contains("is-hidden")).toBe(true);
			press("Escape");
			expect(plus.classList.contains("is-hidden")).toBe(false);
		});

		it("hides while a card is carried", () => {
			const { controller, plus } = setUp();
			controller.onDragging(true);
			expect(plus.classList.contains("is-hidden")).toBe(true);
			controller.onDragging(false);
			expect(plus.classList.contains("is-hidden")).toBe(false);
		});

		it("carried, starts the drag of a new task over the lists only, hides, and comes back when let go off them", () => {
			const { controller, plus, beginNew, drops } = setUp({ items });
			drops.push(stubDrop("left", { kind: "listBefore", before: null, column: "left" }));
			controller.dragFromPlus(new PointerEvent("pointermove"), plus);
			expect(beginNew).toHaveBeenCalledOnce();
			expect(beginNew.mock.calls[0][2]).toHaveLength(1);
			expect(plus.classList.contains("is-hidden")).toBe(true);
			beginNew.mock.calls[0][3](null);
			expect(plus.classList.contains("is-hidden")).toBe(false);
		});

		it("let go on a list, opens the field where the drop showed", () => {
			const { controller, plus, beginNew, drops, rowsOf } = setUp({ items: { left: [item("A", key("now", 0)), item("B", key("now", 1))] } });
			const result: DropResult = { kind: "listBefore", before: key("now", 1), column: "left" };
			drops.push(stubDrop("left", result));
			controller.dragFromPlus(new PointerEvent("pointermove"), plus);
			const [, , targets, onDrop] = beginNew.mock.calls[0];
			const dropped = targets[0].drop(0, 0, { from: "new" } as DragPayload) as PlacedResult;
			onDrop(dropped);
			expect(rowsOf("left")).toEqual(["A", "field", "B"]);
		});

		it("let go over a card's middle, opens the field as its last subtask", () => {
			const parent = item("A", key("now", 0), null, [item("A1", key("now", 0, [0]))]);
			const { controller, plus, beginNew, drops, lists } = setUp({ items: { left: [parent, item("B", key("now", 1))] } });
			drops.push(stubDrop("left", { kind: "nest", parent: parent.key, before: null }));
			controller.dragFromPlus(new PointerEvent("pointermove"), plus);
			const [, , targets, onDrop] = beginNew.mock.calls[0];
			onDrop(targets[0].drop(0, 0, { from: "new" } as DragPayload) as PlacedResult);
			const rows = [...lists.left.el.children] as HTMLElement[];
			expect(rows[2].className).toBe("tc-quick-row");
			expect(rows[2].style.getPropertyValue("--tc-level")).toBe("1");
		});
	});

	it("shows New task beside another list, and not with Now and the calendar", () => {
		const { buttons, setMode } = setUp();
		expect(buttons.map((b) => b.shown)).toEqual([false, false, false]);
		setMode("soon");
		expect(buttons.map((b) => b.shown)).toEqual([true, true, true]);
		setMode("inbox");
		expect(buttons.map((b) => b.shown)).toEqual([true, true, true]);
	});

	it("writes the task typed at the place of the field on Enter, and opens the next field under it", async () => {
		const { controller, type, press, created, rowsOf } = setUp({ items: { left: [item("A", key("now", 0))] } });
		controller.openAtEnd("left");
		type("Buy milk");
		press("Enter");
		expect(rowsOf("left")).toEqual(["A", "Buy milk", "field"]);
		await vi.waitFor(() => expect(created).toEqual([{ text: "Buy milk", priority: null, place: { kind: "list", list: "now", group: null, before: null } }]));
	});

	it("shows the bar while the field is open, and puts the switch and New task away", () => {
		const { controller, root, press } = setUp();
		controller.openAtEnd("soon");
		expect(root.querySelector<HTMLElement>(".tc-quick-bar")!.hidden).toBe(false);
		expect(root.classList.contains("is-entering")).toBe(true);
		press("Escape");
		expect(root.querySelector<HTMLElement>(".tc-quick-bar")!.hidden).toBe(true);
		expect(root.classList.contains("is-entering")).toBe(false);
	});

	it("closes on a tap elsewhere, keeping the text, but not on a tap on the bar", async () => {
		const { controller, root, type, created, field } = setUp();
		controller.openAtEnd("inbox");
		type("Call");
		root.querySelector<HTMLElement>(".tc-bar-flag")!.click();
		expect(field()).not.toBeNull();
		document.body.click();
		expect(field()).toBeNull();
		await vi.waitFor(() => expect(created.map((c) => c.text)).toEqual(["Call"]));
	});

	it("adds a subtask as the last one of its task, in the list that shows it", () => {
		const parent = item("A", key("soon", 0), null, [item("A1", key("soon", 0, [0]))]);
		const { controller, lists } = setUp({ mode: "soon", items: { soon: [parent, item("B", key("soon", 1))] } });
		controller.addSubtask(parent);
		const rows = [...lists.soon.el.children] as HTMLElement[];
		expect(rows.map((r) => r.textContent || r.className)).toEqual(["A", "A1", "tc-quick-row", "B"]);
		expect(rows[2].style.getPropertyValue("--tc-level")).toBe("1");
	});

	it("renames a card in place: the field with its text stands for it, and Enter saves it", async () => {
		const a = item("A", key("now", 0));
		const { controller, lists, field, type, press, edits } = setUp({ items: { left: [a, item("B", key("now", 1))] } });
		controller.rename(a);
		const rows = [...lists.left.el.children] as HTMLElement[];
		expect(rows[0].className).toBe("tc-quick-row");
		expect(rows[1].classList.contains("is-renaming")).toBe(true);
		expect(field()!.value).toBe("A");
		type("A2");
		press("Enter");
		await vi.waitFor(() => expect(edits).toEqual([{ key: a.key, draft: { text: "A2", placement: { kind: "now" }, priority: null } }]));
	});

	it("moves the field to the end of the place chosen in the bar, turning the wheel to show it", () => {
		const { controller, root, rowsOf, turned, field } = setUp({ items: { soon: [item("S", key("soon", 0))] } });
		controller.openAtEnd("left");
		type(root, "Call");
		root.querySelector<HTMLElement>(".tc-bar-place")!.click();
		tile(root, "Soon").click();
		expect(turned).toEqual(["soon"]);
		expect(rowsOf("soon")).toEqual(["S", "field"]);
		expect(rowsOf("left")).toEqual([]);
		expect(field()!.value).toBe("Call");
	});

	it("opens the chosen day in the day column and moves the field to the end of its list", async () => {
		const { controller, root, turned, day, rowsOf } = setUp({ mode: "inbox" });
		controller.openAtEnd("inbox");
		root.querySelector<HTMLElement>(".tc-bar-place")!.click();
		tile(root, "Date").click();
		[...root.querySelectorAll<HTMLElement>(".tc-day:not(.is-other)")].find((d) => d.textContent === "5")!.click();
		expect(turned).toEqual(["soon"]);
		await vi.waitFor(() => expect(day()).toBe("2026-11-05"));
		expect(rowsOf("left")).toEqual(["field"]);
	});
});

function type(root: HTMLElement, text: string): void {
	const field = root.querySelector<HTMLTextAreaElement>("textarea.tc-quick-field")!;
	field.value = text;
	field.dispatchEvent(new Event("input", { bubbles: true }));
}

function tile(root: HTMLElement, label: string): HTMLElement {
	return [...root.querySelectorAll<HTMLElement>(".tc-menu-tile")].find((t) => t.textContent === label)!;
}

function stubDrop(column: ListColumn, result: DropResult): ColumnDrop {
	return { column, hitTest: () => true, preview: () => {}, landing: () => null, clear: () => {}, drop: () => result };
}
