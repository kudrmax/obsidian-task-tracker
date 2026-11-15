import { describe, expect, it } from "vitest";
import type { CreatedTask, TaskKey } from "../../core/application/contracts";
import type { DoorAnswer } from "../../core/application/PhoneCalls";
import { ChainTooLong, type Cmd, type Program, type StoreRuntime } from "../../obsidian/runtime/dispatch/Program";
import { Store } from "../../obsidian/runtime/dispatch/Store";
import type { Need, Views } from "../../obsidian/runtime/dispatch/ViewAnswers";
import type { RuntimeEvent } from "../../obsidian/runtime/events";
import { ActionLog } from "../../obsidian/runtime/lifecycle/ActionLog";
import type { CallOutcome } from "../../obsidian/runtime/replica/ReplicaCalls";
import { FILE, harness, itemOf, ok, PATH, settle } from "./harness";

type Msg = { kind: "tap"; n: number } | { kind: "answered"; n: number } | { kind: "views"; views: Views } | { kind: "loop" };
interface Model {
	readonly seen: readonly string[];
	readonly views: Views | null;
}

/** A runtime the loop runs on, with a door that answers each call with its own arguments. */
class FakeRuntime implements StoreRuntime {
	readonly log = new ActionLog(() => 0);
	readonly calls: string[] = [];
	private listeners = new Set<(e: RuntimeEvent | null) => void>();
	version = 0;
	viewReads = 0;
	private memo: { version: number; answer: DoorAnswer } | null = null;
	call(method: string, args: readonly unknown[]): CallOutcome {
		this.calls.push(method);
		return { answer: { ok: true, result: args[0] }, pending: null };
	}
	views(needs: readonly Need[]): Views {
		if (this.memo?.version !== this.version) {
			this.viewReads++;
			this.memo = { version: this.version, answer: { ok: true, result: this.version } };
		}
		return new Map(needs.map((n) => [n.key, this.memo!.answer]));
	}
	subscribe(listener: (e: RuntimeEvent | null) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	change(): void {
		this.version++;
		this.listeners.forEach((l) => l(null));
	}
}

const program: Program<Model, Msg> = {
	update(model, msg) {
		const seen = [...model.seen, msg.kind === "views" ? "views" : `${msg.kind}${"n" in msg ? msg.n : ""}`];
		if (msg.kind === "tap") return [{ ...model, seen }, [{ kind: "door", method: "tasks.x", args: [msg.n], reply: (o: CallOutcome) => ({ kind: "answered", n: (o.answer as { result: number }).result }) } as Cmd<Msg>]];
		if (msg.kind === "views") return [{ ...model, seen, views: msg.views }, []];
		if (msg.kind === "loop") return [{ ...model, seen }, [{ kind: "door", method: "tasks.loop", args: [0], reply: () => ({ kind: "loop" }) }]];
		return [{ ...model, seen }, []];
	},
	needs: () => [{ key: "screen", method: "tasks.screen", args: [] }],
	viewsChanged: (views) => ({ kind: "views", views }),
	fromRuntime: () => null,
};

const START: Model = { seen: [], views: null };

describe("the dispatch loop", () => {
	it("runs a door command right after update and feeds its answer back before the render; views come as data", () => {
		const runtime = new FakeRuntime();
		const drawn: (readonly string[])[] = [];
		const store = new Store(program, START, runtime, { render: (m) => drawn.push(m.seen) });
		store.dispatch({ kind: "tap", n: 1 });
		expect(drawn).toEqual([["tap1", "answered1", "views"]]);
		expect(store.model.views!.get("screen")).toEqual({ ok: true, result: 0 });
	});

	it("handles messages one at a time in the order they came, never nested: one dispatched while drawing waits its turn", () => {
		const runtime = new FakeRuntime();
		let store!: Store<Model, Msg>;
		let once = true;
		store = new Store(program, START, runtime, {
			render: () => {
				if (!once) return;
				once = false;
				store.dispatch({ kind: "tap", n: 2 });
				expect(store.model.seen).toEqual(["tap1", "answered1", "views"]);
			},
		});
		store.dispatch({ kind: "tap", n: 1 });
		expect(store.model.seen).toEqual(["tap1", "answered1", "views", "tap2", "answered2"]);
	});

	it("runs a message from elsewhere in the next microtask, with whatever else came meanwhile", async () => {
		const runtime = new FakeRuntime();
		let renders = 0;
		const store = new Store(program, START, runtime, { render: () => renders++ });
		store.post({ kind: "tap", n: 1 });
		store.post({ kind: "tap", n: 2 });
		expect(store.model.seen).toEqual([]);
		await Promise.resolve();
		expect(store.model.seen).toEqual(["tap1", "answered1", "tap2", "answered2", "views"]);
		expect(renders).toBe(1);
	});

	it("reads the views again on every change of the replica, and only then", async () => {
		const runtime = new FakeRuntime();
		const store = new Store(program, START, runtime);
		store.dispatch({ kind: "tap", n: 1 });
		store.dispatch({ kind: "tap", n: 2 });
		expect(runtime.viewReads).toBe(1);
		runtime.change();
		await Promise.resolve();
		expect(runtime.viewReads).toBe(2);
		expect(store.model.views!.get("screen")).toEqual({ ok: true, result: 1 });
	});

	it("fails a chain past its bound, with the action log", () => {
		const runtime = new FakeRuntime();
		const store = new Store(program, START, runtime, { chainBound: 5 });
		let error: unknown;
		try {
			store.dispatch({ kind: "loop" });
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(ChainTooLong);
		expect((error as ChainTooLong).dump).toContain("door tasks.loop");
	});
});

describe("the action log", () => {
	it("keeps the last 200 lines", () => {
		const log = new ActionLog(() => 0);
		for (let i = 0; i < 250; i++) log.record(`m${i}`);
		expect(log.entries).toHaveLength(200);
		expect(log.entries[0].text).toBe("m50");
	});
});

type CardMsg = { kind: "views"; views: Views } | { kind: "remap"; idMap: Readonly<Record<string, string>> } | { kind: "pin"; id: string };
interface CardModel {
	readonly pin: string | null;
	readonly card: TaskKey | null;
}

/** A screen with one open full card, its task pinned by id. */
const cardProgram: Program<CardModel, CardMsg> = {
	update(model, msg) {
		if (msg.kind === "pin") return [{ ...model, pin: msg.id }, []];
		if (msg.kind === "remap") return [{ ...model, pin: model.pin && (msg.idMap[model.pin] ?? model.pin) }, []];
		const answer = msg.views.get("card");
		return [{ ...model, card: answer?.ok ? (answer.result as TaskKey | null) : null }, []];
	},
	needs: (model) => (model.pin ? [{ key: "card", method: "tasks.keyOf", args: [model.pin] }] : []),
	viewsChanged: (views) => ({ kind: "views", views }),
	fromRuntime: (event) => (event.kind === "rebased" ? { kind: "remap", idMap: event.idMap } : null),
};

describe("a screen over the runtime", () => {
	it("follows Sync changing the task of an open full card in the same loop", async () => {
		const { runtime, vault } = await harness();
		const store = new Store(cardProgram, { pin: null, card: null }, runtime);
		store.dispatch({ kind: "pin", id: itemOf(runtime, "Idea").id });
		expect(store.model.card!.raw).toBe("- [ ] Idea");
		vault.outside(PATH, FILE.replace("- [ ] Idea", "- [ ] Idea, edited on the phone"));
		await settle(runtime);
		expect(store.model.card!.raw).toBe("- [ ] Idea, edited on the phone");
	});

	it("keeps a pin on a created task through a replay that gave it a new id", async () => {
		const { runtime, vault } = await harness();
		const store = new Store(cardProgram, { pin: null, card: null }, runtime);
		vault.between.push(() => vault.outside(PATH, FILE.replace("## Inbox\n\n", "## Inbox\n\n- [ ] From another device\n"), false));
		const created = ok(runtime.call("tasks.createWithId", ["Pinned", null, { kind: "list", list: "inbox", group: null, before: null }]).answer) as CreatedTask;
		store.dispatch({ kind: "pin", id: created.id });
		await settle(runtime);
		expect(store.model.pin).not.toBe(created.id);
		expect(store.model.pin).toBe(itemOf(runtime, "Pinned").id);
		expect(store.model.card!.raw).toBe("- [ ] Pinned");
	});
});
