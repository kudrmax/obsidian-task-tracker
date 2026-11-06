import { describe, expect, it } from "vitest";
import { type DropColumn, type EntrySpot, type EntryState, type ListCard, type NewTaskPlace, QuickEntrySession, type RepeatRule, StaleTaskError, type TaskDraft, type TaskItem, type TaskKey, type WriteLine } from "../../src/application/contracts";
import { priorityTitles } from "../fakes/FakePriorityTitles";
import { SHOWN_LISTS as SHOWN } from "../../src/ui/screens";
import { onDay } from "../fakes/itemOnDay";

const key = (name: string): TaskKey => ({ section: "now", index: 0, path: [], raw: name });
const card = (name: string, level = 0): ListCard => ({ key: key(name), level, group: null });
const at = (index: number, level = 0): EntrySpot => ({ kind: "list", column: "day", place: { kind: "gap", index, level, group: null } });
const inSoon = (index: number): EntrySpot => ({ kind: "list", column: "soon", place: { kind: "gap", index, level: 0, group: null } });
const WEEKLY: RepeatRule = { kind: "schedule", every: 1, unit: "week", days: [0], dayOfMonth: null, from: null };
const AFTER_DONE: RepeatRule = { kind: "afterDone", every: 1, unit: "week", days: [], dayOfMonth: null, from: null };
const SLOT = { date: "2026-11-01", start: 600, end: null };

function item(name: string, subtasks: TaskItem[] = []): TaskItem {
	return onDay({
		key: key(name),
		text: name,
		status: "todo",
		dueDate: null,
		slot: null,
		reminder: "notification",
		repeat: null,
		open: true,
		repeatable: true,
		priority: { prefix: "!", color: "red" },
		group: null,
		subtasks,
		progress: null,
		parentText: null,
		description: null,
		list: "now",
		isSubtask: false,
	}, SLOT.date);
}

/** The writes one at a time, as the frontend's queue runs them; a failing one is noted and the next one runs. */
class SerialWrites implements WriteLine {
	private tail: Promise<void> = Promise.resolve();

	constructor(private readonly onError: (error: unknown) => void) {}

	push(job: () => Promise<void>): void {
		this.tail = this.tail.then(job).catch((error: unknown) => this.onError(error));
	}

	async idle(): Promise<void> {
		let tail: Promise<void>;
		do {
			tail = this.tail;
			await tail;
		} while (tail !== this.tail);
	}
}

/** The day the day column shows in these tests. */
const DAY = SLOT.date;

function deferred(): { promise: Promise<void>; resolve(): void } {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => (resolve = r));
	return { promise, resolve };
}

/**
 * The file as the lists show it: a create lands where its place says, as the service would put it. An edit takes only a
 * key the lists hand out now.
 */
class FakeTasks {
	cards: ListCard[];
	readonly created: { text: string; priority: string | null; place: NewTaskPlace }[] = [];
	readonly edits: { key: TaskKey; draft: TaskDraft }[] = [];
	readonly changes: (EntryState | null)[] = [];
	/** Per change: whether the lists were about to draw it anyway. */
	readonly drawnNext: boolean[] = [];
	/** The reads, counted from 1, that fail. */
	failingReads = new Set<number>();
	private reads = 0;
	private lastState: EntryState | null = null;
	readonly errors: unknown[] = [];
	gate: Promise<void> = Promise.resolve();
	failing = new Set<string>();
	/** The column holds only tasks without a date: Soon shows only those, and normalize moves a dated Inbox or Backlog task out. */
	undated = false;
	/** The file puts every new task elsewhere than its column, whatever it is: the entry can only learn it. */
	elsewhere = false;
	/** The file puts a new task at the end of the column, wherever it was typed. */
	atEnd = false;
	/** The column shows sections, so the field may write one. */
	sectioned = true;
	readonly sectionsMade: { name: string; place: NewTaskPlace }[] = [];
	/** The lists show a write only once they read the file afresh, as Obsidian's do. */
	lagging = false;
	private written: ListCard[] | null = null;
	/** At each change: the card names the lists show, then the texts waiting under them. */
	readonly seen: string[][] = [];

	constructor(names: readonly (string | [string, number])[]) {
		this.cards = names.map((n) => (typeof n === "string" ? card(n) : card(...n)));
	}

	/** The sections the lists draw, the last one where a field at the end of a column stands. */
	sections: string[] = [];
	mode: "calendar" | "soon" | "inbox" = "calendar";
	/** The day the day column shows. */
	day = DAY;
	/** Columns that show other cards than `cards`. */
	columns: Partial<Record<DropColumn, ListCard[]>> = {};
	/** Labels the settings hold. */
	labels: { name: string; color: "red" | "orange" }[] = [];
	/** What an edit answers with: the task as the file then has it. */
	editAnswer: TaskItem | null = null;
	/** The renames the view was told of: the text the task had, the text it has now. */
	readonly renamed: [string, string][] = [];

	entry(): QuickEntrySession {
		const titles = priorityTitles(
			[
				{ prefix: "!!", color: "red" },
				{ prefix: "p1", color: "orange" },
			],
			this.labels,
		);
		return new QuickEntrySession(
			{
				...titles,
				createInPlace: async (text, priority, place, repeat) => {
					if (this.failing.has(text)) throw new Error(`no ${text}`);
					this.created.push({ text, priority, place });
					// A schedule gives the task its first day: it leaves a column of tasks without one.
					if (this.elsewhere || (this.undated && repeat?.kind === "schedule")) return { section: "soon", index: 0, path: [], raw: text };
					return this.land(text, place);
				},
				createSection: async (name, place) => {
					this.sectionsMade.push({ name, place });
					return null;
				},
				edit: async (k, draft) => {
					if (!this.cards.some((c) => c.key === k)) throw new StaleTaskError();
					this.edits.push({ key: k, draft });
					return this.editAnswer;
				},
				placementOf: () => ({ kind: "now" }),
				placementOfDay: (date) => (date === DAY ? { kind: "now" } : { kind: "date", date }),
				newSlot: (date, start) => ({ date, start, end: null }),
				dayOfPlacement: (placement) => (placement.kind === "now" ? DAY : placement.kind === "date" ? placement.date : null),
			},
			{
				cards: (column) => this.columns[column] ?? this.cards,
				sections: () => this.sections,
				sectioned: () => this.sectioned,
				day: () => this.day,
				today: () => DAY,
				shown: () => SHOWN[this.mode],
				fresh: async (beforeShow) => {
					await this.gate;
					if (this.failingReads.has(++this.reads)) throw new Error("no read");
					const coming = this.written ?? this.cards;
					beforeShow?.(() => coming);
					this.cards = coming;
					this.written = null;
					if (beforeShow) this.see(this.lastState);
				},
				onChange: (state, drawnNext) => {
					this.changes.push(state);
					this.drawnNext.push(drawnNext === true);
					this.lastState = state;
					if (drawnNext !== true) this.see(state);
				},
				renamed: (was, now) => this.renamed.push([was.text, now.text]),
			},
			new SerialWrites((e) => this.errors.push(e)),
		);
	}

	private see(state: EntryState | null): void {
		this.seen.push([...this.cards.map((c) => c.key.raw), ...(state?.pending.map((line) => line.text) ?? [])]);
	}

	get names(): string[] {
		return this.cards.map((c) => `${c.key.raw}:${c.level}`);
	}

	/** The card the lists show for a new task, and its key; none for a slot, which is off the lists. */
	private land(text: string, place: NewTaskPlace): TaskKey | null {
		const indexOf = (k: TaskKey) => this.cards.findIndex((c) => c.key.raw === k.raw);
		if (place.kind === "slot") return null;
		let level = 0;
		let index = this.cards.length;
		if (place.kind === "subtask") {
			const parent = indexOf(place.parent);
			level = this.cards[parent].level + 1;
			index = parent + 1;
			while (index < this.cards.length && this.cards[index].level >= level) index++;
		}
		if (place.before) index = indexOf(place.before);
		if (this.atEnd) index = this.cards.length;
		// A write makes every key read before it stale: the lists hand out new ones.
		const cards = [...this.cards.slice(0, index), card(text, level), ...this.cards.slice(index)].map((c) => ({ ...c, key: { ...c.key } }));
		if (this.lagging) this.written = cards;
		else this.cards = cards;
		return cards[index].key;
	}
}

describe("QuickEntrySession", () => {
	it("enter creates at the place and moves the field down", async () => {
		const tasks = new FakeTasks(["A", "B"]);
		const entry = tasks.entry();
		entry.open(at(1));
		entry.type("New");
		entry.setPriority("!");
		entry.enter();
		expect(entry.state).toMatchObject({ text: "", priority: null, pending: [{ text: "New", level: 0 }], spot: at(1) });
		await entry.idle();
		expect(tasks.created).toEqual([{ text: "New", priority: "!", place: { kind: "day", date: DAY, group: null, before: key("B") } }]);
		expect(tasks.names).toEqual(["A:0", "New:0", "B:0"]);
		expect(entry.state).toMatchObject({ text: "", pending: [], spot: at(2) });
		expect(tasks.changes[tasks.changes.length - 1]).toEqual(entry.state);
	});

	it("a text entered waits under the cards until the lists show it written: it never leaves the screen for a moment", async () => {
		const tasks = new FakeTasks(["A", "B"]);
		tasks.lagging = true;
		const entry = tasks.entry();
		entry.open(at(2));
		for (const text of ["1", "2"]) {
			entry.type(text);
			entry.enter();
		}
		await entry.idle();
		expect(tasks.names).toEqual(["A:0", "B:0", "1:0", "2:0"]);
		expect(entry.state).toMatchObject({ pending: [], spot: at(4) });
		const both = (seen: string[]) => seen.filter((name) => name === "1" || name === "2");
		const entered = tasks.seen.findIndex((seen) => both(seen).length === 2);
		for (const seen of tasks.seen.slice(entered)) expect(both(seen)).toEqual(["1", "2"]);
	});

	it("a written line leaves the queue in the change that comes with its card, not after it", async () => {
		const tasks = new FakeTasks(["A", "B"]);
		const entry = tasks.entry();
		entry.open(at(2));
		entry.type("1");
		entry.enter();
		const after = tasks.changes.length;
		await entry.idle();
		const drawn = tasks.drawnNext.slice(after);
		expect(drawn).toEqual([true]);
		expect(tasks.changes[after]).toMatchObject({ pending: [], spot: at(3) });
	});

	it("a write that fails takes its line off the queue with a redraw", async () => {
		const tasks = new FakeTasks(["A", "B"]);
		tasks.failing = new Set(["1"]);
		const entry = tasks.entry();
		entry.open(at(2));
		entry.type("1");
		entry.enter();
		await entry.idle();
		expect(tasks.drawnNext[tasks.drawnNext.length - 1]).toBe(false);
		expect(tasks.changes[tasks.changes.length - 1]).toMatchObject({ pending: [] });
	});

	it("a read that fails after the write takes its line off the queue with a redraw", async () => {
		const tasks = new FakeTasks(["A", "B"]);
		tasks.failingReads = new Set([2]);
		const entry = tasks.entry();
		entry.open(at(2));
		entry.type("1");
		entry.enter();
		await entry.idle();
		expect(tasks.drawnNext[tasks.drawnNext.length - 1]).toBe(false);
		expect(tasks.changes[tasks.changes.length - 1]).toMatchObject({ pending: [], spot: at(2) });
	});

	it("a line written for a field that has moved changes nothing shown", async () => {
		const tasks = new FakeTasks(["A", "B"]);
		const gate = deferred();
		tasks.gate = gate.promise;
		const entry = tasks.entry();
		entry.open(at(2));
		entry.type("1");
		entry.enter();
		entry.moveToEnd("soon");
		const after = tasks.changes.length;
		gate.resolve();
		await entry.idle();
		expect(tasks.created.map((c) => c.text)).toEqual(["1"]);
		expect(tasks.drawnNext.slice(after)).not.toContain(true);
	});

	it("typing does not read the cards again", () => {
		const tasks = new FakeTasks(["A", ["A0", 1], "B"]);
		let walks = 0;
		const slice = tasks.cards.slice.bind(tasks.cards);
		Object.assign(tasks.cards, {
			slice: (...args: [number?, number?]) => {
				walks++;
				return slice(...args);
			},
		});
		const entry = tasks.entry();
		entry.open(at(2, 1));
		walks = 0;
		for (const text of ["a", "ab", "abc", "abcd", "abcde", "p1 abcde", "x", "xy", "xyz", "xyzw"]) entry.type(text);
		entry.setPriority("!!");
		expect(entry.state).toMatchObject({ canIndent: true, canOutdent: true });
		expect(walks).toBe(0);
		entry.indent(-1);
		expect(walks).toBeGreaterThan(0);
	});

	it("what the field may do follows cards drawn anew", () => {
		const tasks = new FakeTasks(["A", ["A0", 1]]);
		const entry = tasks.entry();
		entry.open(at(2, 1));
		entry.type("x");
		expect(entry.state).toMatchObject({ canOutdent: true });
		tasks.cards = [card("A"), card("A0", 1), card("A1", 1)];
		expect(entry.state).toMatchObject({ canOutdent: false });
	});

	it("queues rapid enters in order", async () => {
		const tasks = new FakeTasks(["A", "B", "C"]);
		const gate = deferred();
		tasks.gate = gate.promise;
		const entry = tasks.entry();
		entry.open(at(1));
		for (const text of ["1", "2", "3", "4", "5"]) {
			entry.type(text);
			entry.enter();
		}
		await Promise.resolve();
		expect(tasks.created).toEqual([]);
		expect(entry.state).toMatchObject({ pending: ["1", "2", "3", "4", "5"].map((text) => ({ text, level: 0 })), spot: at(1) });
		gate.resolve();
		await entry.idle();
		expect(tasks.created.map((c) => c.text)).toEqual(["1", "2", "3", "4", "5"]);
		expect(tasks.created.map((c) => c.place)).toEqual(Array(5).fill({ kind: "day", date: DAY, group: null, before: key("B") }));
		expect(tasks.names).toEqual(["A:0", "1:0", "2:0", "3:0", "4:0", "5:0", "B:0", "C:0"]);
		expect(entry.state).toMatchObject({ pending: [], spot: at(6) });
	});

	it("empty enter on a subtask outdents", () => {
		const tasks = new FakeTasks(["A", ["A0", 1]]);
		const entry = tasks.entry();
		entry.open(at(2, 1));
		expect(entry.state).toMatchObject({ canIndent: true, canOutdent: true });
		entry.enter();
		expect(entry.state).toMatchObject({ spot: at(2, 0), canIndent: true, canOutdent: false });
		expect(tasks.created).toEqual([]);
	});

	it("empty enter on a subtask the card below holds in place closes", () => {
		const tasks = new FakeTasks(["A", ["A0", 1], ["A1", 1]]);
		const entry = tasks.entry();
		entry.open(at(2, 1));
		expect(entry.state).toMatchObject({ canOutdent: false });
		entry.enter();
		expect(entry.state).toBeNull();
	});

	it("empty enter at level 0 closes", async () => {
		const tasks = new FakeTasks(["A"]);
		const entry = tasks.entry();
		entry.open(at(1));
		entry.type("   ");
		entry.enter();
		expect(entry.state).toBeNull();
		expect(tasks.changes[tasks.changes.length - 1]).toBeNull();
		await entry.idle();
		expect(tasks.created).toEqual([]);
	});

	it("a text that is only a priority's prefix is blank: Enter, a tap elsewhere and a rename write nothing", async () => {
		const tasks = new FakeTasks(["A", ["A0", 1]]);
		const entry = tasks.entry();
		entry.open(at(2, 1));
		entry.type("!! ");
		entry.enter();
		expect(entry.state).toMatchObject({ spot: at(2, 0), pending: [] });
		entry.type("p1  ");
		entry.enter();
		expect(entry.state).toBeNull();
		entry.open(at(2));
		entry.type("!! ");
		entry.blur();
		entry.open(at(0), item("A"));
		entry.type("p1 ");
		entry.enter();
		expect(entry.state).toBeNull();
		await entry.idle();
		expect(tasks.created).toEqual([]);
		expect(tasks.edits).toEqual([]);
	});

	it("a text after a prefix is not blank", async () => {
		const tasks = new FakeTasks(["A"]);
		const entry = tasks.entry();
		entry.open(at(1));
		entry.type("!! Call");
		entry.enter();
		await entry.idle();
		expect(tasks.created.map((c) => c.text)).toEqual(["!! Call"]);
	});

	it("blur flushes the queue", async () => {
		const tasks = new FakeTasks(["A"]);
		const entry = tasks.entry();
		entry.open(at(1));
		entry.type("first");
		entry.enter();
		entry.type("second");
		entry.blur();
		expect(entry.state).toBeNull();
		await entry.idle();
		expect(tasks.names).toEqual(["A:0", "first:0", "second:0"]);
	});

	it("blur without text creates nothing", async () => {
		const tasks = new FakeTasks(["A"]);
		const entry = tasks.entry();
		entry.open(at(1));
		entry.blur();
		await entry.idle();
		expect(entry.state).toBeNull();
		expect(tasks.created).toEqual([]);
	});

	it("escape keeps created tasks", async () => {
		const tasks = new FakeTasks([]);
		const gate = deferred();
		tasks.gate = gate.promise;
		const entry = tasks.entry();
		entry.open(at(0));
		entry.type("kept");
		entry.enter();
		entry.type("dropped");
		entry.escape();
		expect(entry.state).toBeNull();
		gate.resolve();
		await entry.idle();
		expect(tasks.names).toEqual(["kept:0"]);
	});

	it("a place chosen keeps the text and priority, and stands the field at the end of that place's column, in its last section", () => {
		const tasks = new FakeTasks(["A"]);
		tasks.sections = ["Home", "Work"];
		const entry = tasks.entry();
		entry.open(at(1));
		entry.type("Call");
		entry.setPriority("!");
		expect(entry.choosePlace({ kind: "soon" })).toEqual({ column: "soon", day: null });
		const soonEnd: EntrySpot = { kind: "list", column: "soon", place: { kind: "gap", index: 1, level: 0, group: "Work" } };
		expect(entry.state).toMatchObject({ spot: soonEnd, text: "Call", priority: "!", pending: [], place: { kind: "soon" } });
	});

	it("moveTo leaves the writes queued at the old place there", async () => {
		const tasks = new FakeTasks(["A", "B"]);
		const gate = deferred();
		tasks.gate = gate.promise;
		const entry = tasks.entry();
		entry.open(at(1));
		entry.type("one");
		entry.enter();
		entry.type("two");
		entry.enter();
		entry.moveToEnd("soon");
		expect(entry.state).toMatchObject({ pending: [], spot: inSoon(2) });
		gate.resolve();
		await entry.idle();
		expect(tasks.names).toEqual(["A:0", "one:0", "two:0", "B:0"]);
		expect(entry.state).toMatchObject({ spot: inSoon(2) });
	});

	it("indent at the range edge does nothing and canIndent is false", () => {
		const tasks = new FakeTasks(["A"]);
		const entry = tasks.entry();
		entry.open(at(1));
		entry.indent(1);
		expect(entry.state).toMatchObject({ spot: at(1, 1), canIndent: false, canOutdent: true });
		const changes = tasks.changes.length;
		entry.indent(1);
		expect(entry.state).toMatchObject({ spot: at(1, 1) });
		expect(tasks.changes.length).toBe(changes);
		entry.indent(-1);
		expect(entry.state).toMatchObject({ spot: at(1, 0), canIndent: true, canOutdent: false });
	});

	it("enter under an indented field creates a subtask", async () => {
		const tasks = new FakeTasks(["A", "B"]);
		const entry = tasks.entry();
		entry.open(at(1));
		entry.indent(1);
		entry.type("sub");
		entry.enter();
		await entry.idle();
		expect(tasks.created[0].place).toEqual({ kind: "subtask", parent: key("A"), before: null });
		expect(tasks.names).toEqual(["A:0", "sub:1", "B:0"]);
		expect(entry.state).toMatchObject({ spot: at(2, 1) });
	});

	it("rename enter edits then opens an entry under it", async () => {
		const tasks = new FakeTasks(["A", "B"]);
		const entry = tasks.entry();
		entry.open(at(0), item("A"));
		expect(entry.state).toMatchObject({ text: "A", priority: "!", canIndent: false, canOutdent: false });
		entry.type("A2");
		entry.enter();
		expect(entry.state).toMatchObject({ spot: at(1), text: "", priority: null, renaming: null });
		await entry.idle();
		expect(tasks.edits).toEqual([{ key: key("A"), draft: { text: "A2", placement: { kind: "now" }, priority: "!" } }]);
		expect(tasks.created).toEqual([]);
	});

	it("a rename sends no rule when the bar's rule is the task's own: anchored or not, weekdays in any order", async () => {
		const tasks = new FakeTasks(["A"]);
		const entry = tasks.entry();
		entry.open(at(0), { ...item("A"), repeat: { ...WEEKLY, days: [0, 3], from: "2026-10-26" } });
		entry.setRepeat({ ...WEEKLY, days: [3, 0] });
		entry.type("A2");
		entry.blur();
		await entry.idle();
		expect(tasks.edits.map((e) => "repeat" in e.draft)).toEqual([false]);
	});

	it("a rename sends the bar's rule when it differs from the task's", async () => {
		const tasks = new FakeTasks(["A"]);
		const entry = tasks.entry();
		entry.open(at(0), { ...item("A"), repeat: WEEKLY });
		entry.setRepeat(AFTER_DONE);
		entry.blur();
		await entry.idle();
		expect(tasks.edits.map((e) => e.draft.repeat)).toEqual([AFTER_DONE]);
	});

	it("rename enter on a parent opens the first subtask", () => {
		const tasks = new FakeTasks(["A", ["A0", 1], "B"]);
		const entry = tasks.entry();
		entry.open(at(0), item("A", [item("A0")]));
		entry.enter();
		expect(entry.state).toMatchObject({ spot: at(1, 1), renaming: null });
	});

	it("rename enter on a collapsed parent opens a task after it, its subtasks folded away", () => {
		const tasks = new FakeTasks(["A", "B"]);
		const entry = tasks.entry();
		entry.open(at(0), { ...item("A", [item("A0")]), collapsed: true });
		entry.enter();
		expect(entry.state).toMatchObject({ spot: at(1), renaming: null });
	});

	it("rename does not move the field by indent", () => {
		const tasks = new FakeTasks(["A", "B"]);
		const entry = tasks.entry();
		entry.open(at(1), item("B"));
		entry.indent(1);
		expect(entry.state).toMatchObject({ spot: at(1) });
	});

	it("rename blur edits only; blank text and escape cancel", async () => {
		const tasks = new FakeTasks(["A"]);
		const entry = tasks.entry();
		entry.open(at(0), item("A"));
		entry.type("A2");
		entry.blur();
		expect(entry.state).toBeNull();
		entry.open(at(0), item("A"));
		entry.type(" ");
		entry.enter();
		expect(entry.state).toBeNull();
		entry.open(at(0), item("A"));
		entry.type("A3");
		entry.escape();
		expect(entry.state).toBeNull();
		await entry.idle();
		expect(tasks.edits.map((e) => e.draft.text)).toEqual(["A2"]);
		expect(tasks.created).toEqual([]);
	});

	it("slot enter creates and closes", async () => {
		const tasks = new FakeTasks([]);
		const entry = tasks.entry();
		const slot: EntrySpot = { kind: "slot", slot: SLOT };
		entry.open(slot);
		expect(entry.state).toMatchObject({ canIndent: false, canOutdent: false });
		entry.indent(1);
		expect(entry.state).toMatchObject({ spot: slot });
		entry.type("Meet");
		entry.enter();
		expect(entry.state).toBeNull();
		await entry.idle();
		expect(tasks.created).toEqual([{ text: "Meet", priority: null, place: { kind: "slot", slot: SLOT } }]);
	});

	it("slot blank enter, blur without text and escape create nothing", async () => {
		const tasks = new FakeTasks([]);
		const entry = tasks.entry();
		const slot: EntrySpot = { kind: "slot", slot: SLOT };
		entry.open(slot);
		entry.enter();
		expect(entry.state).toBeNull();
		entry.open(slot);
		entry.blur();
		entry.open(slot);
		entry.type("gone");
		entry.escape();
		await entry.idle();
		expect(tasks.created).toEqual([]);
	});

	it("stack enter creates a subtask and keeps an empty field for the next", async () => {
		const tasks = new FakeTasks(["P"]);
		const entry = tasks.entry();
		const stack: EntrySpot = { kind: "stack", parent: key("P") };
		entry.open(stack);
		entry.type("s1");
		entry.enter();
		expect(entry.state).toMatchObject({ spot: stack, text: "", pending: [{ text: "s1", level: 0 }] });
		entry.type("s2");
		entry.enter();
		entry.enter();
		expect(entry.state).toBeNull();
		await entry.idle();
		expect(tasks.created.map((c) => [c.text, c.place])).toEqual([
			["s1", { kind: "subtask", parent: key("P"), before: null }],
			["s2", { kind: "subtask", parent: key("P"), before: null }],
		]);
		expect(tasks.names).toEqual(["P:0", "s1:1", "s2:1"]);
	});

	it("a rename in a stack writes on Enter and closes; the view is told the task as the file now has it", async () => {
		const tasks = new FakeTasks(["P"]);
		tasks.editAnswer = item("P2");
		const entry = tasks.entry();
		entry.open({ kind: "stack", parent: key("P") }, { ...item("P"), key: tasks.cards[0].key });
		entry.type("P2");
		entry.enter();
		expect(entry.state).toBeNull();
		await entry.idle();
		expect(tasks.edits.map((e) => e.draft.text)).toEqual(["P2"]);
		expect(tasks.renamed).toEqual([["P", "P2"]]);
		expect(tasks.created).toEqual([]);
	});

	it("a rename the service writes nothing for tells the view of none", async () => {
		const tasks = new FakeTasks(["P"]);
		const entry = tasks.entry();
		entry.open({ kind: "stack", parent: key("P") }, { ...item("P"), key: tasks.cards[0].key });
		entry.blur();
		await entry.idle();
		expect(tasks.edits).toHaveLength(1);
		expect(tasks.renamed).toEqual([]);
	});

	it("opening another place finishes the open field as a tap elsewhere", async () => {
		const tasks = new FakeTasks(["A"]);
		const entry = tasks.entry();
		entry.open(at(1));
		entry.type("first");
		entry.open(at(0));
		expect(entry.state).toMatchObject({ spot: at(0), text: "" });
		await entry.idle();
		expect(tasks.names).toEqual(["A:0", "first:0"]);
	});

	it("a failed write is reported and the writes after it go on", async () => {
		const tasks = new FakeTasks([]);
		tasks.failing.add("bad");
		const entry = tasks.entry();
		entry.open(at(0));
		for (const text of ["bad", "good"]) {
			entry.type(text);
			entry.enter();
		}
		await entry.idle();
		expect(tasks.errors).toHaveLength(1);
		expect(tasks.names).toEqual(["good:0"]);
		expect(entry.state).toMatchObject({ pending: [], spot: at(1) });
	});

	/** Types each text and Enter; "tab" and "shiftTab" move the field instead. */
	const typeLines = (entry: QuickEntrySession, lines: readonly string[]) => {
		for (const line of lines) {
			if (line === "tab") entry.indent(1);
			else if (line === "shiftTab") entry.indent(-1);
			else {
				entry.type(line);
				entry.enter();
			}
		}
	};

	it("texts typed before an indent keep their level", async () => {
		const tasks = new FakeTasks(["A"]);
		const gate = deferred();
		tasks.gate = gate.promise;
		const entry = tasks.entry();
		entry.open(at(1));
		typeLines(entry, ["P", "tab", "c1", "c2"]);
		expect(entry.state?.pending).toEqual([
			{ text: "P", level: 0 },
			{ text: "c1", level: 1 },
			{ text: "c2", level: 1 },
		]);
		gate.resolve();
		await entry.idle();
		expect(tasks.names).toEqual(["A:0", "P:0", "c1:1", "c2:1"]);
		expect(tasks.created.map((c) => c.place)).toEqual([
			{ kind: "day", date: DAY, group: null, before: null },
			{ kind: "subtask", parent: key("P"), before: null },
			{ kind: "subtask", parent: key("P"), before: null },
		]);
		expect(entry.state).toMatchObject({ spot: at(4, 1) });
	});

	it("indents under a text not yet written", async () => {
		const tasks = new FakeTasks([]);
		const gate = deferred();
		tasks.gate = gate.promise;
		const entry = tasks.entry();
		entry.open(at(0));
		entry.type("P");
		entry.enter();
		expect(entry.state).toMatchObject({ canIndent: true, canOutdent: false });
		typeLines(entry, ["tab", "c1"]);
		expect(entry.state).toMatchObject({ spot: at(0, 1), canIndent: true, canOutdent: true });
		gate.resolve();
		await entry.idle();
		expect(tasks.names).toEqual(["P:0", "c1:1"]);
	});

	it("indents under a deeper text not yet written", async () => {
		const tasks = new FakeTasks(["R", ["A", 1]]);
		const gate = deferred();
		tasks.gate = gate.promise;
		const entry = tasks.entry();
		entry.open(at(2, 1));
		typeLines(entry, ["P", "tab", "c"]);
		gate.resolve();
		await entry.idle();
		expect(tasks.names).toEqual(["R:0", "A:1", "P:1", "c:2"]);
	});

	it("a text under one that failed goes at the level its neighbours allow", async () => {
		const tasks = new FakeTasks([]);
		tasks.failing.add("P");
		const entry = tasks.entry();
		const gate = deferred();
		tasks.gate = gate.promise;
		entry.open(at(0));
		typeLines(entry, ["P", "tab", "c"]);
		gate.resolve();
		await entry.idle();
		expect(tasks.errors).toHaveLength(1);
		expect(tasks.names).toEqual(["c:0"]);
	});

	it("a field reopened at the column end stays under a task still being written", async () => {
		const tasks = new FakeTasks(["A"]);
		const gate = deferred();
		tasks.gate = gate.promise;
		const entry = tasks.entry();
		entry.open(at(1));
		entry.type("X");
		entry.blur();
		entry.open(at(1));
		typeLines(entry, ["Y"]);
		gate.resolve();
		await entry.idle();
		expect(tasks.names).toEqual(["A:0", "X:0", "Y:0"]);
		expect(entry.state).toMatchObject({ spot: at(3) });
	});

	it("a field reopened at the column end is told it moved in the drawing that shows the task written above it", async () => {
		const tasks = new FakeTasks(["A"]);
		const gate = deferred();
		tasks.gate = gate.promise;
		const entry = tasks.entry();
		entry.open(at(1));
		entry.type("X");
		entry.blur();
		entry.open(at(1));
		gate.resolve();
		await entry.idle();
		expect(tasks.changes[tasks.changes.length - 1]).toMatchObject({ spot: at(2) });
		expect(tasks.drawnNext[tasks.drawnNext.length - 1]).toBe(true);
	});

	it("a field stays where it is when the task written above it takes a day and leaves its column", async () => {
		const tasks = new FakeTasks(["A"]);
		tasks.undated = true;
		const gate = deferred();
		tasks.gate = gate.promise;
		const entry = tasks.entry();
		entry.open(inSoon(1));
		entry.type("X");
		entry.setRepeat(WEEKLY);
		entry.blur();
		entry.open(inSoon(1));
		gate.resolve();
		await entry.idle();
		expect(tasks.names).toEqual(["A:0"]);
		expect(entry.state).toMatchObject({ spot: inSoon(1) });
	});

	for (const column of ["inbox", "backlog"] as const) {
		it(`a field in ${column} stays where it is when the task written above it takes a day and goes to Soon or Now`, async () => {
			const tasks = new FakeTasks(["A"]);
			tasks.undated = true;
			const gate = deferred();
			tasks.gate = gate.promise;
			const entry = tasks.entry();
			const spot = (index: number): EntrySpot => ({ kind: "list", column, place: { kind: "gap", index, level: 0, group: null } });
			entry.open(spot(1));
			entry.type("X");
			entry.setRepeat(WEEKLY);
			entry.blur();
			entry.open(spot(1));
			gate.resolve();
			await entry.idle();
			expect(tasks.names).toEqual(["A:0"]);
			expect(entry.state).toMatchObject({ spot: spot(1) });
		});
	}

	it("a field moves down under a task written above it with a repeat that keeps it in its column", async () => {
		const tasks = new FakeTasks(["A"]);
		tasks.undated = true;
		const gate = deferred();
		tasks.gate = gate.promise;
		const entry = tasks.entry();
		entry.open(inSoon(1));
		entry.type("X");
		entry.setRepeat(AFTER_DONE);
		entry.blur();
		entry.open(inSoon(1));
		gate.resolve();
		await entry.idle();
		expect(tasks.names).toEqual(["A:0", "X:0"]);
		expect(entry.state).toMatchObject({ spot: inSoon(2) });
	});

	for (const column of ["inbox", "backlog"] as const) {
		it(`a field in ${column} moves down under a plain task written above it, which stays in the column`, async () => {
			const tasks = new FakeTasks(["A"]);
			tasks.undated = true;
			const entry = tasks.entry();
			const spot = (index: number): EntrySpot => ({ kind: "list", column, place: { kind: "gap", index, level: 0, group: null } });
			entry.open(spot(1));
			typeLines(entry, ["X"]);
			await entry.idle();
			expect(tasks.names).toEqual(["A:0", "X:0"]);
			expect(entry.state).toMatchObject({ spot: spot(2) });
		});
	}

	it("a field follows where the file put the task, not where the field guessed: a task put elsewhere leaves it in place", async () => {
		const tasks = new FakeTasks(["A", "B"]);
		tasks.elsewhere = true;
		const entry = tasks.entry();
		entry.open(at(1));
		typeLines(entry, ["X"]);
		await entry.idle();
		expect([tasks.names, entry.state?.spot]).toEqual([["A:0", "B:0"], at(1)]);
	});

	it("a field moves only when the task landed at or above it: one the file put further down leaves it in place", async () => {
		const tasks = new FakeTasks(["A", "B"]);
		tasks.atEnd = true;
		const entry = tasks.entry();
		entry.open(at(1));
		typeLines(entry, ["X"]);
		await entry.idle();
		expect([tasks.names, entry.state?.spot]).toEqual([["A:0", "B:0", "X:0"], at(1)]);
	});

	it("a field opened above a task still being written stays where it is", async () => {
		const tasks = new FakeTasks(["A", "B"]);
		const gate = deferred();
		tasks.gate = gate.promise;
		const entry = tasks.entry();
		entry.open(at(2));
		entry.type("X");
		entry.blur();
		entry.open(at(1));
		typeLines(entry, ["Y"]);
		gate.resolve();
		await entry.idle();
		expect(tasks.names).toEqual(["A:0", "Y:0", "B:0", "X:0"]);
	});

	it("a rename waits for the writes above it and edits the task as the lists then show it", async () => {
		const tasks = new FakeTasks(["A", "B"]);
		const gate = deferred();
		tasks.gate = gate.promise;
		const entry = tasks.entry();
		entry.open(at(0));
		entry.type("X");
		entry.blur();
		entry.open(at(1), { ...item("B"), key: tasks.cards[1].key });
		entry.type("B2");
		entry.blur();
		gate.resolve();
		await entry.idle();
		expect(tasks.errors).toEqual([]);
		expect(tasks.names).toEqual(["X:0", "A:0", "B:0"]);
		expect(tasks.edits).toEqual([{ key: tasks.cards[2].key, draft: { text: "B2", placement: { kind: "now" }, priority: "!" } }]);
	});
	it("the field switched to a section writes `### name` where it stands and closes", async () => {
		const tasks = new FakeTasks(["A", "B"]);
		const entry = tasks.entry();
		entry.open(at(1));
		expect(entry.state?.section).toBe(false);
		entry.toggleSection();
		entry.type("  Evening ");
		expect(entry.state).toMatchObject({ section: true, canIndent: false, canOutdent: false });
		entry.enter();
		expect(entry.state).toBeNull();
		await entry.idle();
		expect(tasks.sectionsMade).toEqual([{ name: "Evening", place: { kind: "day", date: DAY, group: null, before: key("B") } }]);
		expect(tasks.created).toEqual([]);
	});

	it("a field writing a section's name offers no shift, no marks, no repeat and no place; back to a task, it offers them again", () => {
		const tasks = new FakeTasks(["A", "B"]);
		tasks.labels = [{ name: "Важное", color: "red" }];
		const entry = tasks.entry();
		entry.open(at(1));
		const task = { indents: true, markable: true, repeatable: true, place: { kind: "now" } };
		expect(entry.state).toMatchObject(task);
		entry.toggleSection();
		expect(entry.state).toMatchObject({ section: true, indents: false, markable: false, repeatable: false, place: null });
		entry.toggleSection();
		expect(entry.state).toMatchObject(task);
	});

	it("a section's name has no tint, though its text starts with a level's prefix; back to a task, the tint comes back", () => {
		const tasks = new FakeTasks(["A", "B"]);
		const entry = tasks.entry();
		entry.open(at(1));
		entry.type("p1 Errands");
		const tint = entry.state?.marks.tint;
		expect(tint).not.toBeNull();
		entry.toggleSection();
		expect(entry.state?.marks.tint).toBeNull();
		entry.toggleSection();
		expect(entry.state?.marks.tint).toBe(tint);
	});

	it("a section's field among subtasks goes past them, to the top level", () => {
		const tasks = new FakeTasks(["A", ["A1", 1], ["A2", 1], "B"]);
		const entry = tasks.entry();
		entry.open(at(2, 1));
		entry.toggleSection();
		expect(entry.state?.spot).toEqual(at(3));
		entry.toggleSection();
		expect(entry.state?.section).toBe(false);
	});

	it("a blank section name writes nothing; a column without sections offers none", async () => {
		const tasks = new FakeTasks(["A"]);
		const entry = tasks.entry();
		entry.open(at(1));
		entry.toggleSection();
		entry.enter();
		await entry.idle();
		expect(tasks.sectionsMade).toEqual([]);
		tasks.sectioned = false;
		entry.open(at(1));
		expect(entry.state?.section).toBeNull();
		entry.toggleSection();
		expect(entry.state?.section).toBeNull();
	});

	it("a tap elsewhere keeps the section's name as Enter does", async () => {
		const tasks = new FakeTasks(["A"]);
		const entry = tasks.entry();
		entry.open(at(1));
		entry.toggleSection();
		entry.type("Later");
		entry.blur();
		await entry.idle();
		expect(tasks.sectionsMade.map((s) => s.name)).toEqual(["Later"]);
	});

	describe("where a task written in a column goes", () => {
		const task = { kind: "task", group: "Work", before: key("B") } as const;

		it("the day column: the day it shows, today, a later or a past one; the service gives its list and due date", () => {
			for (const day of [DAY, "2026-11-05", "2026-10-28"]) {
				const tasks = new FakeTasks([]);
				tasks.day = day;
				expect(tasks.entry().placeOf("day", task)).toEqual({ kind: "day", date: day, group: "Work", before: key("B") });
			}
		});

		it("Soon, Inbox and Backlog: their own lists", () => {
			const entry = new FakeTasks([]).entry();
			for (const list of ["soon", "inbox", "backlog"] as const) expect(entry.placeOf(list, task)).toEqual({ kind: "list", list, group: "Work", before: key("B") });
		});

		it("a subtask: under its task, wherever the column", () => {
			expect(new FakeTasks([]).entry().placeOf("inbox", { kind: "subtask", parent: key("A"), before: null })).toEqual({ kind: "subtask", parent: key("A"), before: null });
		});
	});

	describe("what the bar shows and what its taps write", () => {
		it("a level tapped is chosen, tapped again taken off; a prefix typed gives way to the level chosen", () => {
			const entry = new FakeTasks([]).entry();
			entry.open(at(0));
			entry.type("p1 Call");
			expect(entry.state?.marks.priority?.prefix).toBe("p1");
			entry.togglePriority("!!");
			expect(entry.state).toMatchObject({ text: "Call", priority: "!!" });
			entry.togglePriority("!!");
			expect(entry.state).toMatchObject({ text: "Call", priority: null });
			entry.type("p1 Call");
			entry.togglePriority("p1");
			expect(entry.state).toMatchObject({ text: "Call", priority: null, marks: { priority: null } });
		});

		it("a label tapped goes on, tapped again comes off, the others kept", () => {
			const tasks = new FakeTasks([]);
			tasks.labels = [
				{ name: "home", color: "red" },
				{ name: "work", color: "orange" },
			];
			const entry = tasks.entry();
			entry.open(at(0));
			entry.toggleLabel("work");
			entry.toggleLabel("home");
			expect(entry.state?.labels).toEqual(["work", "home"]);
			entry.toggleLabel("work");
			expect(entry.state?.labels).toEqual(["home"]);
		});

		it("the place: the column's for a task at the top level; none for a subtask, a slot or a stack", () => {
			const entry = new FakeTasks(["A"]).entry();
			entry.open(at(1));
			expect(entry.state).toMatchObject({ place: { kind: "now" }, places: [{ kind: "inbox", on: false }, { kind: "backlog", on: false }, { kind: "soon", on: false }, { kind: "now", on: true }, { kind: "date", on: false, date: null }] });
			entry.open(inSoon(0));
			expect(entry.state?.place).toEqual({ kind: "soon" });
			entry.open(at(1, 1));
			expect(entry.state?.place).toBeNull();
			entry.open({ kind: "slot", slot: SLOT });
			expect(entry.state?.place).toBeNull();
			entry.open({ kind: "stack", parent: key("A") });
			expect(entry.state?.place).toBeNull();
		});

		it("a renamed task shows where it is until a place is chosen; a renamed subtask shows none", () => {
			const tasks = new FakeTasks(["A"]);
			const entry = tasks.entry();
			entry.open(inSoon(0), item("A"));
			expect(entry.state?.place).toEqual({ kind: "now" });
			entry.choosePlace({ kind: "inbox" });
			expect(entry.state?.place).toEqual({ kind: "inbox" });
			entry.open(at(0), { ...item("A"), isSubtask: true });
			expect(entry.state?.place).toBeNull();
		});

		it("the place the field already has changes nothing; another day asks the day column to open it", () => {
			const entry = new FakeTasks(["A"]).entry();
			entry.open(at(1));
			const changes = entry.state;
			expect(entry.choosePlace({ kind: "now" })).toBeNull();
			expect(entry.state).toEqual(changes);
			expect(entry.choosePlace({ kind: "date", date: "2026-11-05" })).toEqual({ column: "day", day: "2026-11-05" });
			expect(entry.choosePlace({ kind: "backlog" })).toEqual({ column: "backlog", day: null });
		});

		it("a new rule starts from the field's day, else today; a slot takes none; only a list's field shifts", () => {
			const tasks = new FakeTasks(["A"]);
			tasks.day = "2026-11-05";
			const entry = tasks.entry();
			entry.open(at(1));
			expect(entry.state).toMatchObject({ repeatDay: "2026-11-05", repeatable: true, indents: true });
			entry.open(inSoon(0));
			expect(entry.state).toMatchObject({ repeatDay: DAY });
			entry.open({ kind: "slot", slot: SLOT });
			expect(entry.state).toMatchObject({ repeatable: false, indents: false });
			entry.open({ kind: "stack", parent: key("A") });
			expect(entry.state).toMatchObject({ repeatable: true, indents: false });
		});
	});

	describe("where the field opens", () => {
		/** A card whose key tells it apart from the others by its place, as the file's keys do. */
		const placed = (name: string, index: number, level = 0): ListCard => ({ key: { section: "now", index, path: [], raw: name }, level, group: null });

		it("the plus: the end of the day column, of Inbox while the window shows Inbox; in the last section, at the top level", () => {
			const tasks = new FakeTasks(["A", ["A1", 1]]);
			tasks.sections = ["Home", "Work"];
			const entry = tasks.entry();
			entry.openFromPlus();
			expect(entry.state?.spot).toEqual({ kind: "list", column: "day", place: { kind: "gap", index: 2, level: 0, group: "Work" } });
			tasks.mode = "inbox";
			entry.openFromPlus();
			expect(entry.state?.spot).toMatchObject({ kind: "list", column: "inbox" });
		});

		it("an empty section's plate: the gap of that section", () => {
			const tasks = new FakeTasks([]);
			tasks.cards = [{ key: key("A"), level: 0, group: "Home" }];
			const entry = tasks.entry();
			entry.openIn("soon", "Work");
			expect(entry.state?.spot).toEqual({ kind: "list", column: "soon", place: { kind: "gap", index: 1, level: 0, group: "Work" } });
		});

		it("the plus let go: where the drop showed, in a list or a slot; nowhere else", () => {
			const tasks = new FakeTasks([]);
			tasks.cards = [placed("A", 0), placed("B", 1)];
			const entry = tasks.entry();
			expect(entry.openAtDrop("soon", { kind: "list", column: "soon", before: tasks.cards[1].key })).toBe(true);
			expect(entry.state?.spot).toEqual(inSoon(1));
			expect(entry.openAtDrop("day", { kind: "nest", parent: tasks.cards[0].key, before: null })).toBe(true);
			expect(entry.state?.spot).toEqual(at(1, 1));
			expect(entry.openAtDrop(null, { kind: "time", start: SLOT.start })).toBe(true);
			expect(entry.state?.spot).toEqual({ kind: "slot", slot: SLOT });
			entry.escape();
			expect(entry.openAtDrop(null, null)).toBe(false);
			expect(entry.openAtDrop(null, { kind: "clearSlot" })).toBe(false);
			expect(entry.state).toBeNull();
		});

		it("a task is looked for in the columns the window shows first", () => {
			const tasks = new FakeTasks([]);
			const found = placed("A", 1);
			tasks.columns = { day: [placed("Y", 0), found], soon: [placed("X", 0), found], inbox: [], backlog: [] };
			const entry = tasks.entry();
			expect(entry.subtaskSpot(found.key)).toMatchObject({ kind: "list", column: "day" });
			tasks.mode = "soon";
			expect(entry.subtaskSpot(found.key)).toEqual({ kind: "list", column: "soon", place: { kind: "gap", index: 2, level: 1, group: null } });
		});

		it("a subtask of a task no list shows: in its menu's stack", () => {
			const entry = new FakeTasks([]).entry();
			expect(entry.subtaskSpot(key("A"))).toEqual({ kind: "stack", parent: key("A") });
		});

		it("a rename: before its card in a list; else in the menu's stack it was opened from; else over its card on the timeline; else nowhere", () => {
			const tasks = new FakeTasks([]);
			tasks.cards = [placed("X", 0), placed("A", 1, 1)];
			const entry = tasks.entry();
			const renamed = { ...item("A"), key: tasks.cards[1].key };
			expect(entry.renameSpot(renamed, true)).toEqual(at(1, 1));
			tasks.cards = [];
			expect(entry.renameSpot(renamed, true)).toEqual({ kind: "stack", parent: renamed.key });
			expect(entry.renameSpot({ ...item("A"), slot: SLOT }, false)).toEqual({ kind: "slot", slot: SLOT });
			expect(entry.renameSpot(item("A"), false)).toBeNull();
		});
	});
});
