import { describe, expect, it } from "vitest";
import { type NewTaskPlace, StaleTaskError, type TaskDraft, type TaskItem, type TaskKey } from "../../src/application/contracts";
import type { PlacedCard } from "../../src/ui/drag/listPlace";
import { type EntrySpot, type EntryState, QuickEntry } from "../../src/ui/quick/QuickEntry";
import { WriteQueue } from "../../src/ui/quick/WriteQueue";

const key = (name: string): TaskKey => ({ section: "now", index: 0, path: [], raw: name });
const card = (name: string, level = 0): PlacedCard => ({ key: key(name), level, top: 0, height: 0, group: null });
const at = (index: number, level = 0): EntrySpot => ({ kind: "list", column: "left", place: { kind: "gap", index, level, group: null } });
const SLOT = { date: "2026-11-01", start: 600, end: null };

function item(name: string, subtasks: TaskItem[] = []): TaskItem {
	return {
		key: key(name),
		text: name,
		status: "todo",
		dueDate: null,
		slot: null,
		priority: { prefix: "!", color: "red" },
		group: null,
		subtasks,
		progress: null,
		parentText: null,
		description: null,
	} as TaskItem;
}

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
	cards: PlacedCard[];
	readonly created: { text: string; priority: string | null; place: NewTaskPlace }[] = [];
	readonly edits: { key: TaskKey; draft: TaskDraft }[] = [];
	readonly changes: (EntryState | null)[] = [];
	readonly errors: unknown[] = [];
	gate: Promise<void> = Promise.resolve();
	failing = new Set<string>();

	constructor(names: readonly (string | [string, number])[]) {
		this.cards = names.map((n) => (typeof n === "string" ? card(n) : card(...n)));
	}

	entry(): QuickEntry {
		return new QuickEntry({
			cards: () => this.cards,
			placeOf: (_column, result) =>
				result.kind === "task"
					? { kind: "list", list: "now", group: result.group, before: result.before }
					: { kind: "subtask", parent: result.parent, before: result.before },
			fresh: () => this.gate,
			createInPlace: async (text, priority, place) => {
				if (this.failing.has(text)) throw new Error(`no ${text}`);
				this.created.push({ text, priority, place });
				this.land(text, place);
			},
			edit: async (k, draft) => {
				if (!this.cards.some((c) => c.key === k)) throw new StaleTaskError();
				this.edits.push({ key: k, draft });
			},
			placement: () => ({ kind: "now" }),
			levels: () => [
				{ prefix: "!!", color: "red" },
				{ prefix: "p1", color: "orange" },
			],
			onChange: (state) => this.changes.push(state),
			onError: (e) => this.errors.push(e),
		});
	}

	get names(): string[] {
		return this.cards.map((c) => `${c.key.raw}:${c.level}`);
	}

	private land(text: string, place: NewTaskPlace): void {
		const indexOf = (k: TaskKey) => this.cards.findIndex((c) => c.key.raw === k.raw);
		if (place.kind === "slot") return;
		let level = 0;
		let index = this.cards.length;
		if (place.kind === "subtask") {
			const parent = indexOf(place.parent);
			level = this.cards[parent].level + 1;
			index = parent + 1;
			while (index < this.cards.length && this.cards[index].level >= level) index++;
		}
		if (place.before) index = indexOf(place.before);
		// A write makes every key read before it stale: the lists hand out new ones.
		this.cards = [...this.cards.slice(0, index), card(text, level), ...this.cards.slice(index)].map((c) => ({ ...c, key: { ...c.key } }));
	}
}

describe("QuickEntry", () => {
	it("enter creates at the place and moves the field down", async () => {
		const tasks = new FakeTasks(["A", "B"]);
		const entry = tasks.entry();
		entry.open(at(1));
		entry.type("New");
		entry.setPriority("!");
		entry.enter();
		expect(entry.state).toMatchObject({ text: "", priority: null, pending: [{ text: "New", level: 0 }], spot: at(1) });
		await entry.idle();
		expect(tasks.created).toEqual([{ text: "New", priority: "!", place: { kind: "list", list: "now", group: null, before: key("B") } }]);
		expect(tasks.names).toEqual(["A:0", "New:0", "B:0"]);
		expect(entry.state).toMatchObject({ text: "", pending: [], spot: at(2) });
		expect(tasks.changes[tasks.changes.length - 1]).toEqual(entry.state);
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
		expect(tasks.created.map((c) => c.place)).toEqual(Array(5).fill({ kind: "list", list: "now", group: null, before: key("B") }));
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

	it("moveTo keeps text and priority", () => {
		const tasks = new FakeTasks(["A"]);
		const entry = tasks.entry();
		entry.open(at(1));
		entry.type("Call");
		entry.setPriority("!");
		const soonEnd: EntrySpot = { kind: "list", column: "soon", place: { kind: "gap", index: 0, level: 0, group: "Work" } };
		entry.moveTo(soonEnd);
		expect(entry.state).toMatchObject({ spot: soonEnd, text: "Call", priority: "!", pending: [] });
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
		entry.moveTo(at(0));
		expect(entry.state).toMatchObject({ pending: [], spot: at(0) });
		gate.resolve();
		await entry.idle();
		expect(tasks.names).toEqual(["A:0", "one:0", "two:0", "B:0"]);
		expect(entry.state).toMatchObject({ spot: at(0) });
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

	it("rename enter on a parent opens the first subtask", () => {
		const tasks = new FakeTasks(["A", ["A0", 1], "B"]);
		const entry = tasks.entry();
		entry.open(at(0), item("A", [item("A0")]));
		entry.enter();
		expect(entry.state).toMatchObject({ spot: at(1, 1), renaming: null });
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
	const typeLines = (entry: QuickEntry, lines: readonly string[]) => {
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
			{ kind: "list", list: "now", group: null, before: null },
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
});

describe("WriteQueue", () => {
	it("runs one job at a time, in order, past a failing one", async () => {
		const errors: unknown[] = [];
		const queue = new WriteQueue((e) => errors.push(e));
		const log: string[] = [];
		const first = deferred();
		queue.push(async () => {
			log.push("1 start");
			await first.promise;
			log.push("1 end");
		});
		queue.push(async () => {
			throw new Error("2");
		});
		queue.push(async () => {
			log.push("3");
		});
		await Promise.resolve();
		expect(log).toEqual(["1 start"]);
		first.resolve();
		await queue.idle();
		expect(log).toEqual(["1 start", "1 end", "3"]);
		expect(errors).toHaveLength(1);
	});

	it("goes on when the error handler itself throws", async () => {
		const queue = new WriteQueue(() => {
			throw new Error("handler");
		});
		const log: string[] = [];
		queue.push(async () => {
			throw new Error("job");
		});
		queue.push(async () => {
			log.push("next");
		});
		await queue.idle();
		expect(log).toEqual(["next"]);
	});
});
