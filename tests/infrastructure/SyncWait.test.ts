import { describe, expect, it } from "vitest";
import { SYNC_QUIET_MS, SYNC_REASONS, SYNC_TIMEOUT_MS, SyncWait, type SyncOutcome } from "../../obsidian/infrastructure/SyncWait";
import { FakeSync } from "../fakes/FakeSync";
import { FakeTimers } from "../fakes/FakeTimers";

function waiting(sync: FakeSync) {
	const timers = new FakeTimers();
	let outcome: SyncOutcome | null = null;
	void new SyncWait(sync, timers).run().then((o) => (outcome = o));
	return {
		timers,
		outcome: async () => {
			await Promise.resolve();
			return outcome;
		},
		/** Fires the pending timer of this length. */
		pass(ms: number) {
			const entry = [...timers.pending].find(([, t]) => t.ms === ms);
			if (!entry) throw new Error(`no ${ms} ms timer pending: ${timers.delays.join(", ")}`);
			timers.pending.delete(entry[0]);
			entry[1].fn();
		},
	};
}

const SYNCED = { synced: true };
const failed = (reason: string) => ({ synced: false, reason });

describe("SyncWait", () => {
	it("is done when its run ends synced and Sync stays still for the quiet time", async () => {
		const sync = new FakeSync();
		const w = waiting(sync);
		expect(sync.requests).toBe(1);
		sync.step();
		sync.finish("synced");
		expect(w.timers.delays.sort()).toEqual([SYNC_QUIET_MS, SYNC_TIMEOUT_MS].sort());
		expect(await w.outcome()).toBeNull();
		w.pass(SYNC_QUIET_MS);
		expect(await w.outcome()).toEqual(SYNCED);
		expect(w.timers.delays).toEqual([]);
		expect(sync.listening).toBe(0);
	});

	it("waits for one more run that starts in the quiet time", async () => {
		const sync = new FakeSync();
		const w = waiting(sync);
		sync.finish("synced");
		sync.startRun();
		expect(w.timers.delays).toEqual([SYNC_TIMEOUT_MS]);
		sync.finish("synced");
		w.pass(SYNC_QUIET_MS);
		expect(await w.outcome()).toEqual(SYNCED);
	});

	it("lets a run going when the link came finish, then asks for a fresh one", async () => {
		const sync = new FakeSync("synced", { running: true });
		const w = waiting(sync);
		expect(sync.requests).toBe(0);
		sync.finish("synced");
		expect(sync.requests).toBe(1);
		expect(w.timers.delays).toEqual([SYNC_TIMEOUT_MS]);
		sync.finish("synced");
		w.pass(SYNC_QUIET_MS);
		expect(await w.outcome()).toEqual(SYNCED);
	});

	it("doesn't count a run that ended before the server answered", async () => {
		const sync = new FakeSync("synced", { ready: false });
		const w = waiting(sync);
		sync.finish("synced", { ready: false });
		expect(w.timers.delays).toEqual([SYNC_TIMEOUT_MS]);
		sync.startRun();
		sync.finish("synced", { ready: true });
		w.pass(SYNC_QUIET_MS);
		expect(await w.outcome()).toEqual(SYNCED);
	});

	it("says Sync is off in a vault without it", async () => {
		const sync = new FakeSync("off");
		const w = waiting(sync);
		expect(await w.outcome()).toEqual(failed(SYNC_REASONS.off));
		expect(sync.requests).toBe(0);
		expect(w.timers.delays).toEqual([]);
	});

	it("says Sync is paused", async () => {
		const w = waiting(new FakeSync("paused"));
		expect(await w.outcome()).toEqual(failed(SYNC_REASONS.paused));
	});

	it("says Sync is paused when it is paused while waiting", async () => {
		const sync = new FakeSync();
		const w = waiting(sync);
		sync.finish("paused");
		expect(await w.outcome()).toEqual(failed(SYNC_REASONS.paused));
	});

	it("reports an error the run ended with", async () => {
		const sync = new FakeSync();
		const w = waiting(sync);
		sync.finish("error", { ready: false });
		expect(await w.outcome()).toEqual(failed(SYNC_REASONS.error));
		expect(sync.listening).toBe(0);
	});

	it("ignores an error left from before the link: the run it asks for clears it", async () => {
		const sync = new FakeSync("error");
		const w = waiting(sync);
		expect(sync.requests).toBe(1);
		sync.finish("synced");
		w.pass(SYNC_QUIET_MS);
		expect(await w.outcome()).toEqual(SYNCED);
	});

	it("ignores an error shown in the middle of a run", async () => {
		const sync = new FakeSync();
		const w = waiting(sync);
		sync.set("error");
		sync.set("syncing");
		expect(await w.outcome()).toBeNull();
		sync.finish("synced");
		w.pass(SYNC_QUIET_MS);
		expect(await w.outcome()).toEqual(SYNCED);
	});

	it("says Sync is off when it is switched off while waiting", async () => {
		const sync = new FakeSync();
		const w = waiting(sync);
		sync.finish("off");
		expect(await w.outcome()).toEqual(failed(SYNC_REASONS.off));
	});

	it("gives up after 45 seconds", async () => {
		const sync = new FakeSync();
		const w = waiting(sync);
		w.pass(SYNC_TIMEOUT_MS);
		expect(await w.outcome()).toEqual(failed(SYNC_REASONS.timeout));
		expect(sync.listening).toBe(0);
		sync.finish("synced");
		expect(w.timers.delays).toEqual([]);
	});

	it("answers once", async () => {
		const sync = new FakeSync();
		const w = waiting(sync);
		sync.finish("synced");
		w.pass(SYNC_QUIET_MS);
		expect(w.timers.delays).toEqual([]);
		sync.startRun();
		sync.finish("error");
		expect(await w.outcome()).toEqual(SYNCED);
	});
});
