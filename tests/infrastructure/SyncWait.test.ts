import { describe, expect, it } from "vitest";
import { SYNC_QUIET_MS, SYNC_REASONS, SYNC_RETRY_MS, SYNC_TIMEOUT_MS, SyncWait, type SyncOutcome } from "../../obsidian/infrastructure/SyncWait";
import { FakeSync } from "../fakes/FakeSync";
import { FakeTimers } from "../fakes/FakeTimers";

/** Obsidian on screen until `leave` hides it. */
class FakeScreen {
	private readonly listeners = new Set<() => void>();
	get listening(): number {
		return this.listeners.size;
	}
	onLeave(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
	leave(): void {
		for (const listener of [...this.listeners]) listener();
	}
}

function waiting(sync: FakeSync) {
	const timers = new FakeTimers();
	const screen = new FakeScreen();
	let outcome: SyncOutcome | null = null;
	const wait = new SyncWait(sync, timers, screen).run();
	void wait.outcome.then((o) => (outcome = o));
	return {
		timers,
		cancel: () => wait.cancel(),
		screen,
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

const SYNCED = { kind: "synced" };
const LEFT = { kind: "left" };
const failed = (reason: string) => ({ kind: "failed", reason });

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
		expect(w.timers.delays).toEqual([SYNC_TIMEOUT_MS, SYNC_RETRY_MS]);
		sync.startRun();
		sync.finish("synced", { ready: true });
		w.pass(SYNC_QUIET_MS);
		expect(await w.outcome()).toEqual(SYNCED);
	});

	it("pings a socket not heard from since the link, and counts the run after its answer", async () => {
		const sync = new FakeSync();
		const w = waiting(sync);
		sync.finish("synced", { heard: false });
		expect([sync.probes, w.timers.delays]).toEqual([1, [SYNC_TIMEOUT_MS, SYNC_RETRY_MS]]);
		sync.pong();
		w.pass(SYNC_RETRY_MS);
		expect(sync.requests).toBe(2);
		sync.finish("synced", { heard: false });
		w.pass(SYNC_QUIET_MS);
		expect(await w.outcome()).toEqual(SYNCED);
		expect(sync.probes).toBe(1);
	});

	it("never counts a dead socket left from before the phone slept: no answer, no hand-back as synced", async () => {
		const sync = new FakeSync();
		const w = waiting(sync);
		for (let run = 0; run < 3; run++) {
			sync.finish("synced", { heard: false });
			w.pass(SYNC_RETRY_MS);
		}
		expect(sync.probes).toBe(1);
		w.pass(SYNC_TIMEOUT_MS);
		expect(await w.outcome()).toEqual(failed(SYNC_REASONS.timeout));
	});

	it("asks again when the run ended with the socket closed, and counts the reconnected run", async () => {
		const sync = new FakeSync();
		const w = waiting(sync);
		sync.finish("synced", { connected: false, heard: false });
		expect(sync.probes).toBe(0);
		w.pass(SYNC_RETRY_MS);
		sync.finish("synced", { connected: true });
		w.pass(SYNC_QUIET_MS);
		expect(await w.outcome()).toEqual(SYNCED);
	});

	it("waits for Sync still loading after a cold start: it runs by itself once loaded", async () => {
		const sync = new FakeSync("loading");
		const w = waiting(sync);
		expect([sync.requests, await w.outcome(), w.timers.delays]).toEqual([1, null, [SYNC_TIMEOUT_MS]]);
		sync.startRun();
		sync.finish("synced");
		w.pass(SYNC_QUIET_MS);
		expect(await w.outcome()).toEqual(SYNCED);
	});

	it("says Sync is off when it loads without a remote vault", async () => {
		const sync = new FakeSync("loading");
		const w = waiting(sync);
		sync.set("off");
		expect(await w.outcome()).toEqual(failed(SYNC_REASONS.off));
	});

	it("says Sync is paused when the run going at the link ends paused", async () => {
		const sync = new FakeSync("synced", { running: true });
		const w = waiting(sync);
		sync.finish("paused");
		expect([await w.outcome(), sync.requests]).toEqual([failed(SYNC_REASONS.paused), 1]);
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

	it("reports an error, not the clock, when files Sync keeps retrying hold it past 45 seconds", async () => {
		const sync = new FakeSync();
		const w = waiting(sync);
		sync.set("error");
		w.pass(SYNC_TIMEOUT_MS);
		expect(await w.outcome()).toEqual(failed(SYNC_REASONS.error));
	});

	it("ends as left when cancelled, the plugin unloading", async () => {
		const sync = new FakeSync();
		const w = waiting(sync);
		sync.finish("synced", { heard: false });
		w.cancel();
		expect(await w.outcome()).toEqual(LEFT);
		expect([w.timers.delays, sync.listening, w.screen.listening]).toEqual([[], 0, 0]);
	});

	it("ends at once when Max leaves Obsidian, and stays ended when Sync finishes later", async () => {
		const sync = new FakeSync();
		const w = waiting(sync);
		w.screen.leave();
		expect(await w.outcome()).toEqual(LEFT);
		expect([w.timers.delays, sync.listening, w.screen.listening]).toEqual([[], 0, 0]);
		sync.finish("synced");
		expect(w.timers.delays).toEqual([]);
		expect(await w.outcome()).toEqual(LEFT);
	});

	it("ends when Max leaves in the quiet time", async () => {
		const sync = new FakeSync();
		const w = waiting(sync);
		sync.finish("synced");
		w.screen.leave();
		expect(await w.outcome()).toEqual(LEFT);
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
