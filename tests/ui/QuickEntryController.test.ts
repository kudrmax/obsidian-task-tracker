// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NewTaskPlace, Placement, TaskDraft, TaskItem, TaskKey } from "../../src/application/contracts";
import type { RightMode } from "../../src/settings";
import type { DragPayload, DropResult, DropTarget, ListColumn, PlacedResult } from "../../src/ui/drag/DropTarget";
import { GestureArbiter } from "../../src/ui/gestures";
import { type ColumnDrop, QuickEntryController } from "../../src/ui/quick/QuickEntryController";
import { TaskMenu } from "../../src/ui/menu/TaskMenu";
import { TaskList } from "../../src/ui/TaskList";
import { Timeline } from "../../src/ui/Timeline";
import { DayBoundary } from "../../src/application/contracts";
import { FakeTitleField } from "../fakes/FakeTitleField";

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
	description: null,
});

interface SetUp {
	mode?: RightMode;
	day?: string;
	items?: Partial<Record<ListColumn, TaskItem[]>>;
	/** The tasks on the timeline. */
	slotted?: TaskItem[];
}

function setUp({ mode: startMode = "calendar", day: startDay = TODAY, items = {}, slotted = [] }: SetUp = {}) {
	const root = document.createElement("div");
	document.body.appendChild(root);
	let mode = startMode;
	let day = startDay;
	const turned: RightMode[] = [];
	const buttons = [{ shown: true }, { shown: true }, { shown: true }];
	const created: { text: string; priority: string | null; place: NewTaskPlace }[] = [];
	const edits: { key: TaskKey; draft: TaskDraft }[] = [];
	const beginNew = vi.fn<(source: HTMLElement, e: PointerEvent, targets: readonly DropTarget[], onDrop: (result: PlacedResult | null) => void) => boolean>(() => true);
	/** Each write waits for the lists to catch up; held, the test says when they have. */
	let holdFresh = false;
	const freshWaiting: (() => void)[] = [];
	const drops: ColumnDrop[] = [];
	const lists = {} as Record<ListColumn, TaskList>;
	let controller: QuickEntryController | null = null;
	/** Every title field the entry made, in order. */
	const titleFields: FakeTitleField[] = [];
	for (const column of COLUMNS) {
		lists[column] = new TaskList(root.appendChild(document.createElement("div")), {
			items: () => items[column] ?? [],
			day: () => null,
			grouped: () => column !== "left",
			entry: () => controller?.entryIn(column) ?? null,
		});
	}
	const timeline = new Timeline(root.appendChild(document.createElement("div")), {
		theme: () => "dark",
		date: () => day,
		today: () => TODAY,
		boundary: () => DayBoundary.MIDNIGHT,
		hourPx: () => 56,
		tasks: () => slotted,
		events: () => [],
		now: () => new Date(2026, 10, 1, 8, 0),
	});
	const render = () => {
		for (const column of COLUMNS) lists[column].render();
		timeline.render();
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
		titleField: (parent, opts) => {
			const made = new FakeTitleField(parent, opts);
			titleFields.push(made);
			return made;
		},
		list: (column) => lists[column],
		timeline: () => timeline,
		task: (k) => slotted.find((t) => t.key.raw === k.raw) ?? null,
		newTasks: () => buttons,
		dropTargets: () => ({ lists: drops, timeline: null }),
		levels: () => [{ prefix: "p1", color: "red" }],
		today: () => TODAY,
		day: () => day,
		mode: () => mode,
		turnTo: (to) => {
			turned.push(to);
			mode = to;
			void controller?.settle();
		},
		showDay: async (date) => {
			day = date;
			render();
		},
		fresh: () => (holdFresh ? new Promise<void>((resolve) => freshWaiting.push(resolve)) : Promise.resolve()),
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
	/** What the view does on a day arrow, Today, a swipe or the wheel: the entry settles first, then the day changes. */
	const switchDay = async (date: string) => {
		await controller!.settle();
		day = date;
		render();
	};
	const holdWrites = () => (holdFresh = true);
	const releaseWrites = () => freshWaiting.splice(0).forEach((resolve) => resolve());
	return { controller, root, plus, field, titleFields, lists, timeline, slotted, render, rowsOf, type, press, buttons, created, edits, beginNew, drops, turned, setMode, switchDay, holdWrites, releaseWrites, day: () => day };
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

		it("stays put when the drag cannot start", () => {
			const { controller, plus, beginNew } = setUp({ items });
			beginNew.mockReturnValueOnce(false);
			controller.dragFromPlus(new PointerEvent("pointermove"), plus);
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

	it("keeps its one title field, focused, across Enter and the redraws, and lets it go when the entry ends", () => {
		const { controller, type, press, titleFields } = setUp({ items: { left: [item("A", key("now", 0))] } });
		controller.openAtEnd("left");
		type("Buy milk");
		press("Enter");
		type("Bread");
		press("Enter");
		expect(titleFields).toHaveLength(1);
		expect(titleFields[0].focused).toBe(true);
		press("Escape");
		expect(titleFields[0].el.isConnected).toBe(false);
	});

	it("lets the next field move in under the task just written once the list shows it", async () => {
		const items: Partial<Record<ListColumn, TaskItem[]>> = { left: [item("A", key("now", 0))] };
		const { controller, root, type, press, created, render } = setUp({ items });
		controller.openAtEnd("left");
		type("Buy milk");
		press("Enter");
		await vi.waitFor(() => expect(created).toHaveLength(1));
		items.left = [item("A", key("now", 0)), item("Buy milk", key("now", 1))];
		render();
		expect(root.querySelector<HTMLButtonElement>(".tc-bar-indent")!.disabled).toBe(false);
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

	it("keeps the field open on a tap in what its editor shows outside it, the note search", async () => {
		const { controller, type, created, field, titleFields } = setUp();
		controller.openAtEnd("inbox");
		type("Call [[Ann");
		titleFields[0].popup.click();
		expect(field()).not.toBeNull();
		expect(created).toEqual([]);
	});

	it("scrolls the list as the text wraps and the field grows, keeping it 16 px over the bar", () => {
		const { controller, root, type, field, lists } = setUp();
		controller.openAtEnd("inbox");
		root.getBoundingClientRect = () => new DOMRect(0, 0, 390, 500);
		const list = lists.inbox.el;
		list.getBoundingClientRect = () => new DOMRect(0, 0, 175, 500);
		list.scrollTop = 0;
		let height = 35;
		field()!.getBoundingClientRect = () => new DOMRect(10, 405 - list.scrollTop, 175, height);
		height = 71;
		type("A text long enough to wrap onto three lines");
		expect(field()!.getBoundingClientRect().bottom).toBe(500 - 44 - 16);
	});

	describe("settling before the screen shows another day or column", () => {
		const later = "2026-11-03";
		const items = { left: [item("A", key("soon", 0)), item("B", key("soon", 1))] };

		it("writes the text typed, Enter not pressed, for the day and place it was typed at, then lets the day change", async () => {
			const { controller, type, created, field, switchDay, holdWrites, releaseWrites, day } = setUp({ day: later, items });
			controller.openAtEnd("left");
			type("Call");
			holdWrites();
			const switched = switchDay("2026-11-04");
			expect(field()).toBeNull();
			await Promise.resolve();
			expect(day()).toBe(later);
			releaseWrites();
			await switched;
			expect(created).toEqual([{ text: "Call", priority: null, place: { kind: "list", list: "soon", group: null, before: null, date: later } }]);
			expect(day()).toBe("2026-11-04");
		});

		it("writes a line sent by Enter as a subtask of the old day's task, not of whatever stands there on the new day", async () => {
			const { controller, type, press, created, switchDay, holdWrites, releaseWrites, day } = setUp({ day: later, items });
			holdWrites();
			controller.openAtEnd("left");
			press("Tab");
			type("c");
			press("Enter");
			const switched = switchDay(TODAY);
			await Promise.resolve();
			expect(day()).toBe(later);
			releaseWrites();
			await switched;
			expect(created).toEqual([{ text: "c", priority: null, place: { kind: "subtask", parent: key("soon", 1), before: null } }]);
			expect(day()).toBe(TODAY);
		});

		it("keeps the field the bar's place moved when the wheel turns for it", () => {
			const { controller, root, field } = setUp();
			controller.openAtEnd("left");
			root.querySelector<HTMLElement>(".tc-bar-place")!.click();
			tile(root, "Inbox").click();
			expect(field()).not.toBeNull();
		});
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

	describe("on the timeline", () => {
		const slot = { date: TODAY, start: 1035, end: null } as const;
		const onTimeline = (text: string, index: number, subtasks: TaskItem[] = []): TaskItem => ({ ...item(text, key("now", index), null, subtasks), slot: { date: TODAY, start: 600, end: 660 } });
		const timelineField = (root: HTMLElement) => root.querySelector<HTMLElement>(".tc-items > .tc-quick-row");
		const bar = (root: HTMLElement) => root.querySelector<HTMLElement>(".tc-quick-bar")!;
		const shown = (root: HTMLElement, selector: string) => !root.querySelector<HTMLElement>(selector)!.hidden;

		it("opens the field in the slot a long tap showed, with the slot's time, and the bar with the flag only", () => {
			const { controller, root, field } = setUp();
			controller.openSlot(slot);
			expect(timelineField(root)!.contains(field())).toBe(true);
			expect(timelineField(root)!.querySelector(".tc-field-time")!.textContent).toBe("17:15");
			expect(document.activeElement).toBe(field());
			expect(shown(root, ".tc-bar-flag")).toBe(true);
			expect([".tc-bar-outdent", ".tc-bar-indent", ".tc-bar-place"].map((s) => shown(root, s))).toEqual([false, false, false]);
			expect(bar(root).hidden).toBe(false);
		});

		it("writes the task in the slot on Enter and closes: no next line on the calendar", async () => {
			const { controller, root, type, press, created, field } = setUp();
			controller.openSlot(slot);
			type("Call");
			press("Enter");
			expect(field()).toBeNull();
			expect(timelineField(root)).toBeNull();
			await vi.waitFor(() => expect(created).toEqual([{ text: "Call", priority: null, place: { kind: "slot", slot } }]));
		});

		it("creates nothing on a blank Enter, Escape, or a tap elsewhere with no text", async () => {
			const { controller, root, press, created, field } = setUp();
			controller.openSlot(slot);
			press("Enter");
			expect(timelineField(root)).toBeNull();
			controller.openSlot(slot);
			press("Escape");
			expect(field()).toBeNull();
			controller.openSlot(slot);
			document.dispatchEvent(new PointerEvent("pointerdown"));
			document.body.click();
			expect(field()).toBeNull();
			await Promise.resolve();
			expect(created).toEqual([]);
		});

		it("is not closed by the click that ends the long tap which opened it", () => {
			const { controller, field } = setUp();
			controller.openSlot(slot);
			document.body.click();
			expect(field()).not.toBeNull();
		});

		it("opens the field in the slot where the plus was let go on the timeline", () => {
			const { controller, root, plus, beginNew, field } = setUp();
			controller.dragFromPlus(new PointerEvent("pointermove"), plus);
			beginNew.mock.calls[0][3]({ kind: "slot", slot });
			expect(timelineField(root)!.contains(field())).toBe(true);
			expect(plus.classList.contains("is-hidden")).toBe(true);
		});

		it("renames a task only on the calendar in its own card, and Enter saves text and priority only, then closes", async () => {
			const task = onTimeline("Report", 0);
			const { controller, root, field, type, press, edits } = setUp({ slotted: [task] });
			controller.rename(task);
			const block = [...root.querySelectorAll<HTMLElement>(".tc-items > .tc-block:not(.tc-quick-row)")][0];
			expect(block.classList.contains("is-renaming")).toBe(true);
			expect(timelineField(root)!.contains(field())).toBe(true);
			expect(timelineField(root)!.querySelector(".tc-field-time")).toBeNull();
			expect(field()!.value).toBe("Report");
			expect([".tc-bar-indent", ".tc-bar-place"].map((s) => shown(root, s))).toEqual([false, false]);
			type("Report v2");
			press("Enter");
			expect(field()).toBeNull();
			await vi.waitFor(() => expect(edits).toEqual([{ key: task.key, draft: { text: "Report v2", placement: { kind: "now" }, priority: null } }]));
		});

		describe("Rename from the menu of a subtask in the calendar menu's stack", () => {
			const sub = { ...item("Gather", key("now", 0, [0])), status: "inProgress" as const };
			const openSubMenu = () => {
				const stackEl = document.body.appendChild(document.createElement("div"));
				stackEl.className = "tc-menu-subtasks";
				const source = stackEl.appendChild(document.createElement("div"));
				source.className = "tc-card";
				return TaskMenu.open({ item: sub, source, today: TODAY, day: TODAY, levels: [], actions: { setStatus: async () => {}, setDueDate: async () => {}, setPriority: async () => {}, rename: () => {}, openDescription: () => {}, addSubtask: () => {}, remove: async () => {}, openLink: () => {} } });
			};
			const menuField = () => document.querySelector<HTMLTextAreaElement>(".tc-menu-field textarea.tc-quick-field");

			it("turns the card into the field in its place, the text selected, the bar with the flag only", () => {
				const { controller } = setUp({ slotted: [onTimeline("Report", 0, [sub])] });
				controller.rename(sub, openSubMenu());
				expect(menuField()!.value).toBe("Gather");
				expect(document.activeElement).toBe(menuField());
				expect([menuField()!.selectionStart, menuField()!.selectionEnd]).toEqual([0, 6]);
				const quickBar = document.querySelector<HTMLElement>(".tc-quick-bar")!;
				expect(quickBar.parentElement).toBe(document.body);
				expect([".tc-bar-indent", ".tc-bar-place"].map((s) => quickBar.querySelector<HTMLElement>(s)!.hidden)).toEqual([true, true]);
				expect(quickBar.querySelector<HTMLElement>(".tc-bar-flag")!.hidden).toBe(false);
			});

			it("saves the text on Enter and closes the menu", async () => {
				const { controller, edits } = setUp({ slotted: [onTimeline("Report", 0, [sub])] });
				controller.rename(sub, openSubMenu());
				menuField()!.value = "Gather all";
				menuField()!.dispatchEvent(new Event("input", { bubbles: true }));
				menuField()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
				expect(document.querySelector(".tc-menu-field")!.classList.contains("is-closing")).toBe(true);
				expect(document.querySelector<HTMLElement>(".tc-quick-bar")!.hidden).toBe(true);
				expect(document.querySelector(".tc-panel.is-task")!.classList.contains("is-closing")).toBe(true);
				await vi.waitFor(() => expect(edits).toEqual([{ key: sub.key, draft: { text: "Gather all", placement: { kind: "now" }, priority: null } }]));
			});

			it("cancels on Escape", async () => {
				const { controller, edits } = setUp({ slotted: [onTimeline("Report", 0, [sub])] });
				controller.rename(sub, openSubMenu());
				menuField()!.value = "Gather all";
				menuField()!.dispatchEvent(new Event("input", { bubbles: true }));
				document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
				expect(document.querySelector(".tc-menu-field")!.classList.contains("is-closing")).toBe(true);
				expect(document.querySelector<HTMLElement>(".tc-quick-bar")!.hidden).toBe(true);
				await Promise.resolve();
				expect(edits).toEqual([]);
			});
		});

		it("renames a task that is also in a list in the list", () => {
			const task = onTimeline("Report", 0);
			const { controller, root, rowsOf } = setUp({ items: { left: [task] }, slotted: [task] });
			controller.rename(task);
			expect(rowsOf("left")).toEqual(["field", "Report"]);
			expect(timelineField(root)).toBeNull();
		});

		describe("Add subtask from the calendar menu", () => {
			const openMenu = (task: TaskItem, at = new DOMRect(0, 0, 0, 0)) => {
				const source = document.body.appendChild(document.createElement("div"));
				source.className = "tc-block";
				source.getBoundingClientRect = () => at;
				return TaskMenu.open({ item: task, source, today: TODAY, day: TODAY, levels: [], actions: { setStatus: async () => {}, setDueDate: async () => {}, setPriority: async () => {}, rename: () => {}, openDescription: () => {}, addSubtask: () => {}, remove: async () => {}, openLink: () => {} } });
			};
			const stack = () => [...document.querySelectorAll<HTMLElement>(".tc-menu-subtasks > *")].map((row) => (row.classList.contains("tc-quick-row") ? "field" : row.textContent));

			it("opens the field last in the stack, the panel hidden, the bar over the blur with the flag only", () => {
				const task = onTimeline("Report", 0, [item("A1", key("now", 0, [0]))]);
				const { controller } = setUp({ slotted: [task] });
				controller.addSubtask(task, openMenu(task));
				expect(document.querySelector<HTMLElement>(".tc-panel.is-task")!.hidden).toBe(true);
				expect(stack()).toEqual(["A1", "field"]);
				expect(document.activeElement).toBe(document.querySelector(".tc-menu-subtasks textarea.tc-quick-field"));
				const quickBar = document.querySelector<HTMLElement>(".tc-quick-bar")!;
				expect(quickBar.parentElement).toBe(document.body);
				expect([".tc-bar-indent", ".tc-bar-place"].map((s) => quickBar.querySelector<HTMLElement>(s)!.hidden)).toEqual([true, true]);
			});

			it("writes each line as the last subtask of the task and opens the next field in the stack", async () => {
				const task = onTimeline("Report", 0);
				const { controller, created } = setUp({ slotted: [task] });
				controller.addSubtask(task, openMenu(task));
				const field = () => document.querySelector<HTMLTextAreaElement>("textarea.tc-quick-field")!;
				field().value = "Gather numbers";
				field().dispatchEvent(new Event("input", { bubbles: true }));
				field().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
				expect(field().value).toBe("");
				await vi.waitFor(() => expect(created).toEqual([{ text: "Gather numbers", priority: null, place: { kind: "subtask", parent: task.key, before: null } }]));
				expect(stack()[stack().length - 1]).toBe("field");
			});

			it("draws the stack from the task as the screen shows it once the subtask is written", async () => {
				const task = onTimeline("Report", 0);
				const { controller, slotted, render } = setUp({ slotted: [task] });
				controller.addSubtask(task, openMenu(task));
				slotted[0] = { ...task, subtasks: [item("Gather numbers", key("now", 0, [0]))] };
				render();
				expect(stack()).toEqual(["Gather numbers", "field"]);
			});

			it("closes the menu on a blank Enter, and the bar goes back into the view", () => {
				const task = onTimeline("Report", 0);
				const { controller, root } = setUp({ slotted: [task] });
				const menu = openMenu(task);
				controller.addSubtask(task, menu);
				document.querySelector("textarea.tc-quick-field")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
				expect(document.querySelector(".tc-panel.is-task")!.classList.contains("is-closing")).toBe(true);
				expect(root.lastElementChild!.classList.contains("tc-quick-bar")).toBe(true);
			});

			it("keeps the text typed when the menu is closed by a tap on the blur", async () => {
				const task = onTimeline("Report", 0);
				const { controller, created } = setUp({ slotted: [task] });
				const menu = openMenu(task);
				controller.addSubtask(task, menu);
				const field = document.querySelector<HTMLTextAreaElement>("textarea.tc-quick-field")!;
				field.value = "Send";
				field.dispatchEvent(new Event("input", { bubbles: true }));
				menu.close();
				await vi.waitFor(() => expect(created.map((c) => c.text)).toEqual(["Send"]));
			});

			it("closes on Escape without writing the text typed", async () => {
				const task = onTimeline("Report", 0);
				const { controller, created } = setUp({ slotted: [task] });
				controller.addSubtask(task, openMenu(task));
				const field = document.querySelector<HTMLTextAreaElement>("textarea.tc-quick-field")!;
				field.value = "Send";
				field.dispatchEvent(new Event("input", { bubbles: true }));
				document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
				expect(document.querySelector(".tc-menu-subtasks")!.classList.contains("is-closing")).toBe(true);
				expect(document.querySelector<HTMLElement>(".tc-quick-bar")!.hidden).toBe(true);
				await Promise.resolve();
				await Promise.resolve();
				expect(created).toEqual([]);
			});

			it("keeps the field 16 px over the bar, raising the parts over the blur", () => {
				const task = onTimeline("Report", 0);
				const { controller, root } = setUp({ slotted: [task] });
				const menu = openMenu(task, new DOMRect(200, 430, 150, 35));
				root.getBoundingClientRect = () => new DOMRect(0, 0, 390, 500);
				const rowTop = () => parseFloat(document.querySelector<HTMLElement>(".tc-menu-subtasks")!.style.top) + 2;
				HTMLTextAreaElement.prototype.getBoundingClientRect = function () {
					return new DOMRect(0, rowTop(), 150, 35);
				};
				try {
					controller.addSubtask(task, menu);
					const limit = 500 - 44 - 16;
					expect(rowTop() + 35).toBe(limit);
					expect(menu.raised).toBeGreaterThan(0);
				} finally {
					delete (HTMLTextAreaElement.prototype as { getBoundingClientRect?: unknown }).getBoundingClientRect;
				}
			});

			it("a task also in a list gets its field in the list, and the menu closes", () => {
				const task = onTimeline("Report", 0);
				const { controller, rowsOf } = setUp({ items: { left: [task] }, slotted: [task] });
				const menu = openMenu(task);
				controller.addSubtask(task, menu);
				expect(rowsOf("left")).toEqual(["Report", "field"]);
				expect(document.querySelector(".tc-panel.is-task")!.classList.contains("is-closing")).toBe(true);
			});
		});
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
