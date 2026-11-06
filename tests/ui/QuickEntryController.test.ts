// @vitest-environment happy-dom
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { LabelLevel, NewTaskPlace, Placement, RepeatRule, TaskDraft, TaskItem, TaskKey } from "../../src/application/contracts";
import type { RightMode } from "../../src/ui/viewSettings";
import type { DragPayload, DropResult, DropTarget, ListColumn } from "../../src/ui/drag/DropTarget";
import { GestureArbiter } from "../../src/ui/gestures";
import { type ColumnDrop, QuickEntryController } from "../../src/ui/quick/QuickEntryController";
import { TaskMenu } from "../../src/ui/menu/TaskMenu";
import { dayColumn, dayOfPlacement, placementOfDay } from "../../src/domain/Days";
import { TaskList } from "../../src/ui/TaskList";
import { Timeline } from "../../src/ui/Timeline";
import { DayBoundary } from "../../src/application/contracts";
import { priorityTitles } from "../fakes/FakePriorityTitles";
import { FakeTitleField } from "../fakes/FakeTitleField";
import { onDay } from "../fakes/itemOnDay";
import { withShownSpan } from "../fakes/timelineDeps";
import { DEFAULT_SETTINGS } from "../../src/settings";

const TODAY = "2026-11-01";
const COLUMNS: readonly ListColumn[] = ["left", "soon", "inbox"];

const key = (section: TaskKey["section"], index: number, path: number[] = []): TaskKey => ({ section, index, path, raw: `${section}${index}${path.join("")}` });

const item = (text: string, k: TaskKey, group: string | null = null, subtasks: TaskItem[] = []): TaskItem => onDay({
	key: k,
	text,
	status: "todo",
	dueDate: null,
	slot: null,
	reminder: "notification",
	repeat: null,
	open: true,
	repeatable: true,
	priority: null,
	group,
	subtasks,
	progress: null,
	parentText: null,
	description: null,
	list: k.section,
	isSubtask: k.path.length > 0,
}, TODAY);

interface SetUp {
	mode?: RightMode;
	day?: string;
	items?: Partial<Record<ListColumn, TaskItem[]>>;
	/** The tasks on the timeline. */
	slotted?: TaskItem[];
	/** Obsidian on the desktop, its status bar's top this far down; the phone without. */
	desktop?: { readonly chromeTop: number };
	/** The columns show sections, so the field may write one. */
	sections?: boolean;
	/**
	 * The lists read the file after a write and draw it only when it changed, as the view's do: "grows" lands each write
	 * as a card at the end of the day column, "same" lands nothing.
	 */
	drawsOnFresh?: "grows" | "same";
	/** The labels the settings hold. */
	labels?: readonly LabelLevel[];
}

function setUp({ mode: startMode = "calendar", day: startDay = TODAY, items = {}, slotted = [], desktop, drawsOnFresh, sections = false, labels = [] }: SetUp = {}) {
	const root = document.createElement("div");
	document.body.appendChild(root);
	/** The animation frames asked for, run when the test says. */
	const frames = new Map<number, FrameRequestCallback>();
	let nextFrame = 1;
	vi.stubGlobal("requestAnimationFrame", (run: FrameRequestCallback) => {
		frames.set(nextFrame, run);
		return nextFrame++;
	});
	vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
	const runFrames = () => {
		const due = [...frames.values()];
		frames.clear();
		due.forEach((run) => run(0));
	};
	let mode = startMode;
	let day = startDay;
	const turned: RightMode[] = [];
	const created: { text: string; priority: string | null; place: NewTaskPlace; repeat?: RepeatRule }[] = [];
	const edits: { key: TaskKey; draft: TaskDraft }[] = [];
	const beginNew = vi.fn<(source: HTMLElement, e: PointerEvent, targets: readonly DropTarget[], onDrop: (result: DropResult | null) => void) => boolean>(() => true);
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
			grouped: () => column !== "left" || dayColumn(day, TODAY).sections,
			entry: () => controller?.entryIn(column) ?? null,
			renaming: () => controller?.renaming() ?? null,
		});
	}
	const timeline = new Timeline(root.appendChild(document.createElement("div")), withShownSpan({
		theme: () => "dark",
		date: () => day,
		today: () => TODAY,
		boundary: () => DayBoundary.MIDNIGHT,
		hourPx: () => 56,
		tasks: () => slotted,
		events: () => [],
		now: () => new Date(2026, 10, 1, 8, 0),
	}));
	let draws = 0;
	/** The day column's rows as each drawing left them. */
	const drawnLeft: string[][] = [];
	const render = () => {
		draws++;
		for (const column of COLUMNS) lists[column].render();
		timeline.render();
		controller?.rendered();
		drawnLeft.push(rowsOf("left"));
	};
	let shownLeft = (items.left ?? []).length;
	controller = new QuickEntryController({
		root,
		tasks: {
			labelLevels: () => labels,
			createInPlace: async (text, priority, place, repeat) => {
				created.push({ text, priority, place, ...(repeat ? { repeat } : {}) });
				if (drawsOnFresh !== "grows") return null;
				const added = item(text, key("now", (items.left ?? []).length));
				(items.left ??= []).push(added);
				return added.key;
			},
			createSection: async () => null,
			edit: async (k, draft) => {
				edits.push({ key: k, draft });
			},
			placementOf: (): Placement => ({ kind: "now" }),
			placementOfDay: (date) => placementOfDay(date, TODAY),
			listName: (list) => DEFAULT_SETTINGS.sections[list],
			dayOfPlacement: (placement) => dayOfPlacement(placement, TODAY),
			...priorityTitles([{ prefix: "p1", color: "red" }], labels),
		},
		arbiter: new GestureArbiter(),
		drag: { beginNew },
		titleField: (parent, opts) => {
			const made = new FakeTitleField(parent, opts);
			titleFields.push(made);
			return made;
		},
		list: (column) => lists[column],
		sectioned: () => sections,
		timeline: () => timeline,
		task: (k) => slotted.find((t) => t.key.raw === k.raw) ?? null,
		dropTargets: () => ({ lists: drops, timeline: null }),
		today: () => TODAY,
		desktop: () => desktop !== undefined,
		chromeTop: () => desktop?.chromeTop ?? Infinity,
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
		fresh: async (beforeShow) => {
			if (holdFresh) await new Promise<void>((resolve) => freshWaiting.push(resolve));
			beforeShow?.();
			const left = (items.left ?? []).length;
			if (drawsOnFresh && left !== shownLeft) render();
			shownLeft = left;
		},
		render,
		onError: vi.fn(),
	});
	render();
	const plus = root.querySelector<HTMLElement>(".tc-plus")!;
	const field = () => root.querySelector<HTMLTextAreaElement>("textarea.tc-quick-field");
	function rowsOf(column: ListColumn): string[] {
		return [...lists[column].el.children].map((row) => (row.classList.contains("tc-quick-row") ? "field" : row.textContent || row.className));
	}
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
	const releaseWrites = () => {
		holdFresh = false;
		freshWaiting.splice(0).forEach((resolve) => resolve());
	};
	return {
		controller,
		root,
		plus,
		field,
		titleFields,
		lists,
		timeline,
		slotted,
		render,
		rowsOf,
		type,
		press,
		created,
		edits,
		beginNew,
		drops,
		turned,
		setMode,
		switchDay,
		holdWrites,
		releaseWrites,
		day: () => day,
		runFrames,
		framesAsked: () => frames.size,
		draws: () => draws,
		drawnLeft,
		resetDraws: () => {
			draws = 0;
			drawnLeft.length = 0;
		},
	};
}

afterEach(() => {
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

describe("QuickEntryController", () => {
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

		it("tapped by a finger, stays open through the mouse events and the click the touch still sends to what was under the plus", async () => {
			const { root, plus, field, timeline, created, type } = setUp({ items });
			const touch = (type: string) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: "touch", isPrimary: true, button: 0 });
			plus.dispatchEvent(touch("pointerdown"));
			plus.dispatchEvent(touch("pointerup"));
			expect(field()).not.toBeNull();
			const under = timeline.el;
			const mousedown = new MouseEvent("mousedown", { bubbles: true, cancelable: true, detail: 1 });
			under.dispatchEvent(mousedown);
			expect(mousedown.defaultPrevented).toBe(true);
			under.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, detail: 1 }));
			under.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
			expect(field()).not.toBeNull();
			expect(root.classList.contains("is-entering")).toBe(true);
			type("Call");
			under.dispatchEvent(touch("pointerdown"));
			const next = new MouseEvent("mousedown", { bubbles: true, cancelable: true, detail: 1 });
			under.dispatchEvent(next);
			expect(next.defaultPrevented).toBe(false);
			under.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
			expect(field()).toBeNull();
			await vi.waitFor(() => expect(created.map((c) => c.text)).toEqual(["Call"]));
		});

		it("hides while a card is carried", () => {
			const { controller, plus } = setUp();
			controller.onDragging(true);
			expect(plus.classList.contains("is-hidden")).toBe(true);
			controller.onDragging(false);
			expect(plus.classList.contains("is-hidden")).toBe(false);
		});

		it("carried, starts the drag of a new task over its ring and the lists, hides, and comes back when let go off them", () => {
			const { controller, plus, beginNew, drops } = setUp({ items });
			drops.push(stubDrop("left", { kind: "list", column: "left", before: null }));
			controller.dragFromPlus(new PointerEvent("pointermove"), plus);
			expect(beginNew).toHaveBeenCalledOnce();
			expect(beginNew.mock.calls[0][2]).toHaveLength(2);
			expect(plus.classList.contains("is-hidden")).toBe(true);
			beginNew.mock.calls[0][3](null);
			expect(plus.classList.contains("is-hidden")).toBe(false);
		});

		it("stays put when the drag cannot start", () => {
			const { controller, plus, beginNew, root } = setUp({ items });
			beginNew.mockReturnValueOnce(false);
			controller.dragFromPlus(new PointerEvent("pointermove"), plus);
			expect(plus.classList.contains("is-hidden")).toBe(false);
			expect(root.querySelector(".tc-plus-ring")).toBeNull();
		});

		describe("its ring", () => {
			const RING = { left: 100, top: 200, width: 44, height: 44 };
			const carry = () => {
				const made = setUp({ items });
				made.controller.dragFromPlus(new PointerEvent("pointermove"), made.plus);
				const ring = made.root.querySelector<HTMLElement>(".tc-plus-ring")!;
				ring.getBoundingClientRect = () => new DOMRect(RING.left, RING.top, RING.width, RING.height);
				const [, , targets, onDrop] = made.beginNew.mock.calls[0];
				return { ...made, ring, target: targets[0], onDrop };
			};

			it("stands in the plus's place while it is carried and goes when it is let go", () => {
				const { ring, root, onDrop } = carry();
				expect(ring.isConnected).toBe(true);
				onDrop(null);
				expect(root.querySelector(".tc-plus-ring")).toBeNull();
			});

			it("is the first target, so it wins over a list under it", () => {
				const { target, ring } = carry();
				expect(target.landing()).toEqual(ring.getBoundingClientRect());
			});

			it("takes a finger closer to its centre than its radius plus 24 px", () => {
				const { target } = carry();
				const [cx, cy] = [RING.left + 22, RING.top + 22];
				expect(target.hitTest(cx, cy, { from: "new" } as DragPayload)).toBe(true);
				expect(target.hitTest(cx + 45, cy, { from: "new" } as DragPayload)).toBe(true);
				expect(target.hitTest(cx + 46, cy, { from: "new" } as DragPayload)).toBe(false);
				expect(target.hitTest(cx, cy - 46, { from: "new" } as DragPayload)).toBe(false);
			});

			it("lights up under the card and goes out when it leaves", () => {
				const { target, ring } = carry();
				target.preview(0, 0, { from: "new" } as DragPayload);
				expect(ring.classList.contains("is-hot")).toBe(true);
				target.clear();
				expect(ring.classList.contains("is-hot")).toBe(false);
			});

			it("let go on, cancels: nothing is created and the plus is shown again", () => {
				const { target, plus, created, onDrop } = carry();
				const result = target.drop(0, 0, { from: "new" } as DragPayload);
				expect(result).toBeNull();
				onDrop(result as null);
				expect(created).toEqual([]);
				expect(plus.classList.contains("is-hidden")).toBe(false);
			});
		});

		it("let go on a list, opens the field where the drop showed", () => {
			const { controller, plus, beginNew, drops, rowsOf } = setUp({ items: { left: [item("A", key("now", 0)), item("B", key("now", 1))] } });
			const result: DropResult = { kind: "list", column: "left", before: key("now", 1) };
			drops.push(stubDrop("left", result));
			controller.dragFromPlus(new PointerEvent("pointermove"), plus);
			const [, , targets, onDrop] = beginNew.mock.calls[0];
			const dropped = targets[1].drop(0, 0, { from: "new" } as DragPayload) as DropResult;
			onDrop(dropped);
			expect(rowsOf("left")).toEqual(["A", "field", "B"]);
		});

		it("let go over a card's middle, opens the field as its last subtask", () => {
			const parent = item("A", key("now", 0), null, [item("A1", key("now", 0, [0]))]);
			const { controller, plus, beginNew, drops, lists } = setUp({ items: { left: [parent, item("B", key("now", 1))] } });
			drops.push(stubDrop("left", { kind: "nest", parent: parent.key, before: null }));
			controller.dragFromPlus(new PointerEvent("pointermove"), plus);
			const [, , targets, onDrop] = beginNew.mock.calls[0];
			onDrop(targets[1].drop(0, 0, { from: "new" } as DragPayload) as DropResult);
			const rows = [...lists.left.el.children] as HTMLElement[];
			expect(rows[2].className).toBe("tc-quick-row");
			expect(rows[2].style.getPropertyValue("--tc-level")).toBe("1");
		});
	});

	it("writes the task typed at the place of the field on Enter, and opens the next field under it", async () => {
		const { controller, type, press, created, rowsOf } = setUp({ items: { left: [item("A", key("now", 0))] } });
		controller.openAtEnd("left");
		type("Buy milk");
		press("Enter");
		expect(rowsOf("left")).toEqual(["A", "Buy milk", "field"]);
		await vi.waitFor(() => expect(created).toEqual([{ text: "Buy milk", priority: null, place: { kind: "day", date: TODAY, group: null, before: null } }]));
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

	it("shows in the field and the bar the marks the task is written with: a typed priority over the labels chosen", () => {
		const { controller, root, type, field } = setUp({ labels: [{ name: "Важное", color: "blue" }] });
		controller.openAtEnd("inbox");
		root.querySelector<HTMLElement>(".tc-bar-flag")!.click();
		tile(document.body, "Важное").click();
		expect(root.querySelector<HTMLElement>(".tc-bar-flag")!.dataset.priority).toBe("blue");
		type("p1 Buy milk");
		expect(root.querySelector<HTMLElement>(".tc-bar-flag")!.dataset.priority).toBe("red");
		expect(field()!.dataset.priority).toBe("red");
		const label = tile(document.body, "Важное") as HTMLButtonElement;
		expect([label.classList.contains("is-on"), label.disabled]).toEqual([false, true]);
	});

	it("shows the bar while the field is open, and puts the switch away", () => {
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
		const { controller, root, type, field, lists, runFrames } = setUp();
		controller.openAtEnd("inbox");
		root.getBoundingClientRect = () => new DOMRect(0, 0, 390, 500);
		const list = lists.inbox.el;
		list.getBoundingClientRect = () => new DOMRect(0, 0, 175, 500);
		list.scrollTop = 0;
		let height = 35;
		field()!.getBoundingClientRect = () => new DOMRect(10, 405 - list.scrollTop, 175, height);
		height = 71;
		type("A text long enough to wrap onto three lines");
		runFrames();
		expect(field()!.getBoundingClientRect().bottom).toBe(500 - 44 - 16);
	});

	describe("as the phone keyboard slides in", () => {
		const GLIDE = { ms: 300, ease: (t: number) => t, rise: 300 };

		/** The field at the end of Inbox, 405 px down the list; the view 500 px tall, the bar standing on the keyboard's top once it slides. */
		function withKeyboard() {
			let keyboard: number | null = null;
			const set = setUp();
			vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout", "performance"] });
			set.controller.openAtEnd("inbox");
			set.root.getBoundingClientRect = () => new DOMRect(0, 0, 390, 500);
			const list = set.lists.inbox.el;
			list.getBoundingClientRect = () => new DOMRect(0, 0, 175, 500);
			list.scrollTop = 0;
			set.field()!.getBoundingClientRect = () => new DOMRect(10, 405 - list.scrollTop, 175, 35);
			const bar = set.root.querySelector<HTMLElement>(".tc-quick-bar")!;
			bar.getBoundingClientRect = () => new DOMRect(0, (keyboard ?? 500) - 44, 390, 44);
			set.render();
			return { ...set, list, slide: (top: number) => ((keyboard = top), set.controller.keyboardSlides(GLIDE)) };
		}

		afterEach(() => vi.useRealTimers());

		it("scrolls the field over the bar's new place along with the keyboard, not at once", () => {
			const { list, field, slide } = withKeyboard();
			const before = list.scrollTop;
			slide(200);
			expect(list.scrollTop).toBe(before);
			vi.advanceTimersByTime(150);
			expect(list.scrollTop).toBeGreaterThan(before);
			vi.advanceTimersByTime(300);
			expect(field()!.getBoundingClientRect().bottom).toBe(200 - 44 - 16);
		});

		it("stops riding the keyboard once a finger scrolls the list", () => {
			const { list, slide } = withKeyboard();
			slide(200);
			vi.advanceTimersByTime(100);
			list.scrollTop = 3;
			list.dispatchEvent(new Event("scroll"));
			vi.advanceTimersByTime(500);
			expect(list.scrollTop).toBe(3);
		});
	});

	describe("Enter", () => {
		const settled = () => new Promise((resolve) => setTimeout(resolve, 0));
		const twoCards = () => ({ left: [item("X", key("now", 0)), item("Y", key("now", 1))] });

		it("Enter draws the lists twice: the line moving up at once, and once with its card", async () => {
			const { controller, type, press, draws, resetDraws, rowsOf } = setUp({ items: twoCards(), drawsOnFresh: "grows" });
			controller.openAtEnd("left");
			type("A");
			resetDraws();
			press("Enter");
			await settled();
			expect(draws()).toBe(2);
			expect(rowsOf("left")).toEqual(["X", "Y", "A", "field"]);
		});

		it("no drawing shows the line twice or the field over its card", async () => {
			const { controller, type, press, drawnLeft, resetDraws } = setUp({ items: twoCards(), drawsOnFresh: "grows" });
			controller.openAtEnd("left");
			type("A");
			resetDraws();
			press("Enter");
			await settled();
			expect(drawnLeft.length).toBeGreaterThan(0);
			for (const rows of drawnLeft) {
				expect(rows.filter((row) => row === "A").length).toBeLessThanOrEqual(1);
				expect(rows[rows.length - 1]).toBe("field");
			}
		});

		it("Enter keeps the field's own element, focused, with no blur", async () => {
			const { controller, type, press, field } = setUp({ items: twoCards(), drawsOnFresh: "grows" });
			controller.openAtEnd("left");
			type("A");
			const before = field()!;
			let blurs = 0;
			let focuses = 0;
			before.addEventListener("blur", () => blurs++);
			before.addEventListener("focus", () => focuses++);
			press("Enter");
			await settled();
			expect(field()).toBe(before);
			expect(document.activeElement).toBe(before);
			expect(blurs).toBe(0);
			expect(focuses).toBe(0);
		});

		it("a write whose read draws nothing redraws the lists itself", async () => {
			const { controller, type, press, draws, resetDraws, rowsOf, created } = setUp({ items: twoCards(), drawsOnFresh: "same" });
			controller.openAtEnd("left");
			type("A");
			resetDraws();
			press("Enter");
			await settled();
			expect(created.map((c) => c.text)).toEqual(["A"]);
			expect(draws()).toBe(2);
			expect(rowsOf("left")).toEqual(["X", "Y", "field"]);
		});
	});

	describe("once a frame", () => {
		it("ten letters measure nothing until the frame, then once", () => {
			const { controller, type, runFrames, framesAsked } = setUp({ items: { inbox: [item("I", key("inbox", 0))] } });
			controller.openAtEnd("inbox");
			runFrames();
			const measured = vi.spyOn(Element.prototype, "getBoundingClientRect");
			onTestFinished(() => measured.mockRestore());
			type("a");
			expect(measured).not.toHaveBeenCalled();
			runFrames();
			const perPass = measured.mock.calls.length;
			expect(perPass).toBeGreaterThan(0);
			measured.mockClear();
			for (const text of ["ab", "abc", "abcd", "abcde", "abcdef", "abcdefg", "abcdefgh", "abcdefghi", "abcdefghij", "abcdefghijk"]) type(text);
			expect(measured).not.toHaveBeenCalled();
			expect(framesAsked()).toBe(1);
			runFrames();
			expect(measured.mock.calls.length).toBe(perPass);
		});

		it("a burst of transitionend moves the bar once", () => {
			const { controller, root, runFrames, framesAsked } = setUp();
			controller.openAtEnd("inbox");
			runFrames();
			for (let i = 0; i < 20; i++) root.firstElementChild!.dispatchEvent(new Event("transitionend", { bubbles: true }));
			expect(framesAsked()).toBe(1);
		});

		it("scrolls in one frame are one pass", () => {
			const { controller, lists, runFrames, framesAsked } = setUp();
			controller.openAtEnd("inbox");
			runFrames();
			for (let i = 0; i < 5; i++) lists.inbox.el.dispatchEvent(new Event("scroll"));
			expect(framesAsked()).toBe(1);
		});
	});

	describe("on the desktop", () => {
		/** The field at the end of Inbox, `fieldTop` px down the list's content; the view 500 px tall, the status bar from 476. */
		function onDesk(fieldTop = 300) {
			const set = setUp({ desktop: { chromeTop: 476 } });
			set.controller.openAtEnd("inbox");
			set.root.getBoundingClientRect = () => new DOMRect(0, 0, 390, 500);
			const list = set.lists.inbox.el;
			list.getBoundingClientRect = () => new DOMRect(0, 0, 175, 500);
			list.scrollTop = 0;
			set.field()!.getBoundingClientRect = () => new DOMRect(10, fieldTop - list.scrollTop, 175, 35);
			const bar = set.root.querySelector<HTMLElement>(".tc-quick-bar")!;
			bar.getBoundingClientRect = () => new DOMRect(parseFloat(bar.style.left) || 0, parseFloat(bar.style.top) || 0, 105, 32);
			set.render();
			return { ...set, list, bar };
		}

		it("stands the capsule right under the field, right edges together", () => {
			const { bar } = onDesk();
			expect(bar.classList.contains("is-desk")).toBe(true);
			expect([bar.style.left, bar.style.top]).toEqual([`${185 - 105}px`, `${335 + 8}px`]);
		});

		it("scrolls a field near the bottom up until the capsule fits under it, over the status bar", () => {
			const { bar, list } = onDesk(600);
			expect(list.scrollTop).toBe(600 + 35 - (476 - 32 - 2 * 8));
			expect(bar.style.top).toBe(`${476 - 8 - 32}px`);
		});

		it("follows the field as its list scrolls, and goes over it at the bottom of the column", () => {
			const { bar, list, field, runFrames } = onDesk();
			const scrollTo = (top: number) => {
				field()!.getBoundingClientRect = () => new DOMRect(10, top, 175, 35);
				list.dispatchEvent(new Event("scroll"));
				runFrames();
			};
			scrollTo(380);
			expect(bar.style.top).toBe(`${380 + 35 + 8}px`);
			scrollTo(450);
			expect(bar.style.top).toBe(`${450 - 8 - 32}px`);
		});

		it("follows the field once the columns have slid under it", () => {
			const { bar, field, root, runFrames } = onDesk();
			field()!.getBoundingClientRect = () => new DOMRect(-400, 300, 175, 35);
			root.dispatchEvent(new Event("scroll"));
			runFrames();
			field()!.getBoundingClientRect = () => new DOMRect(10, 250, 175, 35);
			root.firstElementChild!.dispatchEvent(new Event("transitionend", { bubbles: true }));
			runFrames();
			expect([bar.style.left, bar.style.top]).toEqual([`${185 - 105}px`, `${285 + 8}px`]);
		});
	});

	describe("a list the finger scrolled away from the field", () => {
		/** The field at the end of Inbox, its top `fieldTop` px down the list's content, the view 500 px tall. */
		function scrolledAway(fieldTop = 600) {
			const set = setUp();
			set.controller.openAtEnd("inbox");
			set.root.getBoundingClientRect = () => new DOMRect(0, 0, 390, 500);
			const list = set.lists.inbox.el;
			list.getBoundingClientRect = () => new DOMRect(0, 0, 175, 500);
			list.scrollTop = 0;
			set.field()!.getBoundingClientRect = () => new DOMRect(10, fieldTop - list.scrollTop, 175, 35);
			set.render();
			const followed = list.scrollTop;
			list.scrollTop = 20;
			list.dispatchEvent(new Event("scroll"));
			return { ...set, list, followed };
		}

		it("is followed to the field when it opens", () => {
			expect(scrolledAway().followed).toBe(600 + 35 - (500 - 44 - 16));
		});

		it("stays where the finger left it on a redraw", () => {
			const { render, list } = scrolledAway();
			render();
			expect(list.scrollTop).toBe(20);
		});

		it("stays where the finger left it as the view resizes, the keyboard coming or going", () => {
			const { controller, list } = scrolledAway();
			controller.reveal();
			expect(list.scrollTop).toBe(20);
		});

		it("goes back to the field once the text changes", () => {
			const { type, list, followed, runFrames } = scrolledAway();
			type("Call");
			runFrames();
			expect(list.scrollTop).toBe(followed);
		});

		it("goes back to the field once Enter moves it", async () => {
			const { press, type, list, field } = scrolledAway();
			type("Call");
			list.scrollTop = 20;
			list.dispatchEvent(new Event("scroll"));
			field()!.getBoundingClientRect = () => new DOMRect(10, 640 - list.scrollTop, 175, 35);
			press("Enter");
			await vi.waitFor(() => expect(list.scrollTop).toBe(640 + 35 - (500 - 44 - 16)));
		});
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
			expect(created).toEqual([{ text: "Call", priority: null, place: { kind: "day", date: later, group: null, before: null } }]);
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

	it("keeps the dot of a task in progress on the field that renames it, and none on the field of a new task", () => {
		const a: TaskItem = { ...item("A", key("now", 0)), status: "inProgress" };
		const { controller, lists } = setUp({ items: { left: [a, item("B", key("now", 1))] } });
		controller.rename(a);
		const row = () => lists.left.el.querySelector(".tc-quick-row")!;
		expect(row().querySelector(":scope > .tc-progress-dot")).not.toBeNull();
		lists.left.render();
		expect(row().querySelectorAll(":scope > .tc-progress-dot")).toHaveLength(1);
	});

	describe("the bar's repeat", () => {
		const WEEKLY_THU: RepeatRule = { kind: "schedule", every: 1, unit: "week", days: [3], dayOfMonth: null, from: null };
		const repeatButton = (root: HTMLElement) => root.querySelector<HTMLElement>(".tc-bar-repeat")!;
		const weekday = (label: string) => [...document.querySelectorAll<HTMLElement>(".tc-repeat-day")].find((b) => b.textContent === label)!;
		/** Weekly on Thursday from a field whose day is today, a Sunday: Thursday on, Sunday off. */
		const chooseThursday = (root: HTMLElement) => {
			repeatButton(root).click();
			weekday("Thu").click();
			weekday("Sun").click();
		};

		it("writes the task typed with the rule chosen, lights the button, and the next field starts without one", async () => {
			const { controller, root, type, press, created } = setUp();
			controller.openAtEnd("left");
			type("Gym");
			chooseThursday(root);
			expect(repeatButton(root).classList.contains("is-set")).toBe(true);
			press("Enter");
			await vi.waitFor(() => expect(created).toEqual([{ text: "Gym", priority: null, place: { kind: "day", date: TODAY, group: null, before: null }, repeat: WEEKLY_THU }]));
			expect(repeatButton(root).classList.contains("is-set")).toBe(false);
		});

		it("Remove repeat takes the chosen rule off before the task is written", async () => {
			const { controller, root, type, press, created } = setUp();
			controller.openAtEnd("left");
			type("Gym");
			chooseThursday(root);
			document.querySelector<HTMLElement>(".tc-repeat-remove")!.click();
			expect(repeatButton(root).classList.contains("is-set")).toBe(false);
			press("Enter");
			await vi.waitFor(() => expect(created).toEqual([{ text: "Gym", priority: null, place: { kind: "day", date: TODAY, group: null, before: null } }]));
		});

		it("is on a subtask's field too: the rule goes with the subtask's write", async () => {
			const parent = item("A", key("now", 0));
			const { controller, root, type, press, created } = setUp({ items: { left: [parent] } });
			controller.openAtEnd("left");
			chooseThursday(root);
			press("Tab");
			expect(repeatButton(root).hidden).toBe(false);
			expect(repeatButton(root).classList.contains("is-set")).toBe(true);
			type("Sub");
			press("Enter");
			await vi.waitFor(() => expect(created).toHaveLength(1));
			expect(created[0].place.kind).toBe("subtask");
			expect(created[0].repeat).toEqual(WEEKLY_THU);
		});

		it("is not on a field on the calendar", () => {
			const { controller, root } = setUp();
			controller.openSlot({ date: TODAY, start: 600, end: null });
			expect(repeatButton(root).hidden).toBe(true);
		});

		it("a rename of a task that repeats opens with its rule and leaves it as it is when it is not touched", async () => {
			const a: TaskItem = { ...item("A", key("now", 0)), repeat: WEEKLY_THU };
			const { controller, root, type, press, edits } = setUp({ items: { left: [a] } });
			controller.rename(a);
			expect(repeatButton(root).classList.contains("is-set")).toBe(true);
			type("A2");
			press("Enter");
			await vi.waitFor(() => expect(edits).toHaveLength(1));
			expect(edits[0].draft).toEqual({ text: "A2", placement: { kind: "now" }, priority: null });
			expect("repeat" in edits[0].draft && edits[0].draft.repeat !== undefined).toBe(false);
		});

		it("a rename saves the rule changed in the bar through the edit", async () => {
			const a: TaskItem = { ...item("A", key("now", 0)), repeat: WEEKLY_THU };
			const { controller, root, press, edits } = setUp({ items: { left: [a] } });
			controller.rename(a);
			repeatButton(root).click();
			weekday("Mon").click();
			press("Enter");
			await vi.waitFor(() => expect(edits).toEqual([{ key: a.key, draft: { text: "A", placement: { kind: "now" }, priority: null, repeat: { ...WEEKLY_THU, days: [0, 3] } } }]));
		});

		it("a rename saves Remove repeat as the rule taken off", async () => {
			const a: TaskItem = { ...item("A", key("now", 0)), repeat: WEEKLY_THU };
			const { controller, root, press, edits } = setUp({ items: { left: [a] } });
			controller.rename(a);
			repeatButton(root).click();
			document.querySelector<HTMLElement>(".tc-repeat-remove")!.click();
			press("Enter");
			await vi.waitFor(() => expect(edits).toEqual([{ key: a.key, draft: { text: "A", placement: { kind: "now" }, priority: null, repeat: null } }]));
		});
	});

	describe("a rename the bar's place moves to another column", () => {
		const a = item("A", key("now", 0));
		const movedToSoon = () => {
			const s = setUp({ mode: "soon", items: { left: [a, item("B", key("now", 1))], soon: [item("S", key("soon", 0))] } });
			s.controller.rename(a);
			s.root.querySelector<HTMLElement>(".tc-bar-place")!.click();
			tile(s.root, "Soon").click();
			return s;
		};
		const hiddenIn = (list: TaskList) => [...list.el.querySelectorAll(".is-renaming")].map((card) => card.textContent);

		it("keeps the card hidden at its old place while the field stands at the end of the other column", () => {
			const { rowsOf, lists, field } = movedToSoon();
			expect(rowsOf("soon")).toEqual(["S", "field"]);
			expect(field()!.value).toBe("A");
			expect(hiddenIn(lists.left)).toEqual(["A"]);
			expect(hiddenIn(lists.soon)).toEqual([]);
		});

		it("saves the task to the place chosen on Enter", async () => {
			const { press, edits } = movedToSoon();
			press("Enter");
			await vi.waitFor(() => expect(edits).toEqual([{ key: a.key, draft: { text: "A", placement: { kind: "soon" }, priority: null } }]));
		});

		it("saves the task to the place chosen on a tap elsewhere, and the field closes", async () => {
			const { edits, field, lists } = movedToSoon();
			document.body.click();
			expect(field()).toBeNull();
			expect(hiddenIn(lists.left)).toEqual([]);
			await vi.waitFor(() => expect(edits).toEqual([{ key: a.key, draft: { text: "A", placement: { kind: "soon" }, priority: null } }]));
		});
	});

	describe("the day column of a past day, its tasks in sections it does not show", () => {
		const PAST = "2026-10-28";
		const work = () => [item("A", key("now", 0), "Work"), item("B", key("now", 1), "Work")];

		it("Tab at the end of the list makes the field a subtask of the last card", () => {
			const { controller, lists, press, root } = setUp({ day: PAST, items: { left: work() } });
			controller.openAtEnd("left");
			expect(root.querySelector<HTMLButtonElement>(".tc-bar-indent")!.disabled).toBe(false);
			press("Tab");
			const row = lists.left.el.querySelector<HTMLElement>(".tc-quick-row")!;
			expect(row.style.getPropertyValue("--tc-level")).toBe("1");
		});

		it("the plus let go at the end of the list opens the field there, and Enter writes the task at the end of Now", async () => {
			const { controller, plus, beginNew, drops, rowsOf, type, press, created } = setUp({ day: PAST, items: { left: work() } });
			drops.push(stubDrop("left", { kind: "list", column: "left", before: null }));
			controller.dragFromPlus(new PointerEvent("pointermove"), plus);
			const [, , targets, onDrop] = beginNew.mock.calls[0];
			onDrop(targets[1].drop(0, 0, { from: "new" } as DragPayload) as DropResult);
			expect(rowsOf("left")).toEqual(["A", "B", "field"]);
			type("C");
			press("Enter");
			await vi.waitFor(() => expect(created).toEqual([{ text: "C", priority: null, place: { kind: "day", date: PAST, group: null, before: null } }]));
		});
	});

	it("reads what the field may do from the cards without measuring them as the text is typed", () => {
		const { controller, lists, type } = setUp({ items: { left: [item("A", key("now", 0)), item("B", key("now", 1))] } });
		controller.openAtEnd("left");
		const measured = lists.left.cards.map(({ card }) => vi.spyOn(card, "getBoundingClientRect"));
		type("C");
		type("Ca");
		for (const spy of measured) expect(spy).not.toHaveBeenCalled();
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
				return TaskMenu.open({ item: sub, source, today: TODAY, day: TODAY, levels: [], actions: { setRepeat: async () => {}, stop: async () => {}, setStatus: async () => {}, postpone: async () => {}, removeDue: async () => {}, toSection: async () => {}, newSection: () => {}, setPriority: async () => {}, setLabels: async () => null, setReminder: async () => {}, rename: () => {}, openDescription: () => {}, addSubtask: () => {}, remove: async () => {}, openInObsidian: () => {}, openLink: () => {} } });
			};
			const menuField = () => document.querySelector<HTMLTextAreaElement>(".tc-menu-field textarea.tc-quick-field");

			it("turns the card into the field in its place, the caret at the end of the text, the bar with the flag only", () => {
				const { controller } = setUp({ slotted: [onTimeline("Report", 0, [sub])] });
				controller.rename(sub, openSubMenu());
				expect(menuField()!.value).toBe("Gather");
				expect(document.activeElement).toBe(menuField());
				expect([menuField()!.selectionStart, menuField()!.selectionEnd]).toEqual([6, 6]);
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
				return TaskMenu.open({ item: task, source, today: TODAY, day: TODAY, levels: [], actions: { setRepeat: async () => {}, stop: async () => {}, setStatus: async () => {}, postpone: async () => {}, removeDue: async () => {}, toSection: async () => {}, newSection: () => {}, setPriority: async () => {}, setLabels: async () => null, setReminder: async () => {}, rename: () => {}, openDescription: () => {}, addSubtask: () => {}, remove: async () => {}, openInObsidian: () => {}, openLink: () => {} } });
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
	return { column, hitTest: () => true, preview: () => {}, landing: () => null, leave: () => {}, clear: () => {}, drop: () => result };
}

describe("QuickEntryController: the field switched to a section", () => {
	const altTab = (field: HTMLElement) => field.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", altKey: true, bubbles: true, cancelable: true }));
	const sectionButton = (root: HTMLElement) => root.querySelector<HTMLButtonElement>(".tc-bar-section")!;

	it("Option+Tab switches it and back, the section button pressed with it", () => {
		const { controller, root, field } = setUp({ sections: true });
		controller.openAtEnd("left");
		altTab(field()!);
		expect(sectionButton(root).getAttribute("aria-pressed")).toBe("true");
		altTab(field()!);
		expect(sectionButton(root).getAttribute("aria-pressed")).toBe("false");
	});

	it("on the desktop the section button stands in its own capsule, apart from the task's", () => {
		const { controller, root } = setUp({ sections: true, desktop: { chromeTop: 476 } });
		controller.openAtEnd("left");
		expect(sectionButton(root).closest(".tc-quick-mode")).not.toBeNull();
		expect(root.querySelector<HTMLElement>(".tc-quick-mode")!.hidden).toBe(false);
	});

	it("a click on the desktop's section capsule switches the field and keeps it open", () => {
		const { controller, root, field } = setUp({ sections: true, desktop: { chromeTop: 476 } });
		controller.openAtEnd("left");
		sectionButton(root).click();
		expect(field()).not.toBeNull();
		expect(sectionButton(root).getAttribute("aria-pressed")).toBe("true");
	});

	it("on the phone it stays first in the bar over the keyboard", () => {
		const { controller, root } = setUp({ sections: true });
		controller.openAtEnd("left");
		expect(sectionButton(root).parentElement?.classList.contains("tc-quick-bar")).toBe(true);
		expect(root.querySelector<HTMLElement>(".tc-quick-mode")!.hidden).toBe(true);
	});
});
