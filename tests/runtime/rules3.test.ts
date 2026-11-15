import { describe, expect, it } from "vitest";
import type { TFile } from "obsidian";
import type { Program } from "../../obsidian/runtime/dispatch/Program";
import type { CalendarFeed } from "../../obsidian/runtime/network/CalendarLane";
import { pairCreated } from "../../obsidian/runtime/persistence/Replay";
import { FILE, harness, itemOf, ok, PATH, settle } from "./harness";

const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("what depends on the replica starts when it is first built, whichever read builds it", () => {
	it("a first read that fails rejects ready(); a later change of the file builds the replica, starts the clock, and ready() then resolves", async () => {
		const { runtime, vault, timers } = await harness({ ready: false });
		const read = vault.read.bind(vault);
		let fail = true;
		vault.read = async (file: TFile) => {
			if (fail) throw new Error("EBUSY");
			return read(file);
		};
		runtime.hostReady("layout");
		runtime.hostReady("metadata");
		await expect(runtime.ready()).rejects.toThrow("EBUSY");
		expect(timers.pending.size).toBe(0);
		fail = false;
		vault.outside(PATH, FILE.replace("- [ ] Idea", "- [ ] Idea 2"));
		await settle(runtime);
		await expect(runtime.ready()).resolves.toBeUndefined();
		expect(runtime.replica.state.tasks).toContain("- [ ] Idea 2");
		expect(timers.pending.size).toBe(1);
	});
});

describe("a replay pairs the ids a call gave", () => {
	it("in order, only when the replay gave as many: never one id of another kind", () => {
		expect(pairCreated(["t5", "t6"], ["t9", "t10"])).toEqual([
			["t5", "t9"],
			["t6", "t10"],
		]);
		expect(pairCreated(["t5"], ["t5"])).toEqual([]);
		expect(pairCreated(["t5"], ["t9", "t10"])).toEqual([]);
		expect(pairCreated(["t5", "t6"], ["t9"])).toEqual([]);
	});
});

describe("persisted() waits for what the writer started itself", () => {
	it("a re-read the writer started after a change event is waited for", async () => {
		const { runtime, vault } = await harness();
		vault.hold();
		ok(runtime.call("tasks.rename", [itemOf(runtime, "Idea").key, "Idea, mine"]).answer);
		await macrotask();
		vault.outside(PATH, vault.text(PATH)!.replace("- [ ] Shop", "- [ ] Shop, synced"));
		let open!: () => void;
		vault.readGate = new Promise((resolve) => (open = resolve));
		vault.release();
		let done = false;
		const persisted = runtime.persisted().then(() => (done = true));
		for (let i = 0; i < 5; i++) await macrotask();
		expect(done).toBe(false);
		vault.readGate = null;
		open();
		await persisted;
		await settle(runtime);
		expect(runtime.replica.state.tasks).toContain("- [ ] Shop, synced");
		expect(runtime.replica.state.tasks).toContain("- [ ] Idea, mine");
	});
});

describe("a host's teardown", () => {
	it("disposes the stores it made: a pass already scheduled renders nothing into the gone host", async () => {
		const { runtime } = await harness();
		const session = runtime.openHost();
		const drawn: number[] = [];
		const program: Program<number, number> = { update: (_m, msg) => [msg, []], needs: () => [], viewsChanged: () => 0, fromRuntime: () => null };
		const store = session.store(program, 0, { render: (m) => drawn.push(m) });
		store.post(7);
		session.teardown();
		await macrotask();
		expect(drawn).toEqual([]);
	});
});

describe("the network lane", () => {
	it("runs one feed once at a time: an ask while it runs joins it", async () => {
		const runs: (() => void)[] = [];
		const feed: CalendarFeed = { name: "google", refresh: () => new Promise<void>((resolve) => runs.push(resolve)) };
		const { runtime } = await harness({ feeds: [feed] });
		const first = runtime.refreshCalendars("refresh");
		const second = runtime.refreshCalendars("refresh");
		await macrotask();
		expect(runs).toHaveLength(1);
		runs[0]();
		await Promise.all([first, second]);
	});
});
