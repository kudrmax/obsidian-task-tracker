import { describe, expect, it } from "vitest";
import { ObsidianSync } from "../../obsidian/infrastructure/ObsidianSync";

/** Sync's core plugin shaped as Obsidian 1.x builds it. */
function obsidianSync(fields: Record<string, unknown> = {}, enabled = true) {
	const listeners = new Map<unknown, () => void>();
	let requests = 0;
	const instance = {
		status: "synced",
		syncing: false,
		ready: true,
		getStatus(this: { status: string }) {
			return this.status;
		},
		requestSync: async () => void requests++,
		on: (_name: string, cb: () => void) => {
			const ref = {};
			listeners.set(ref, cb);
			return ref;
		},
		offref: (ref: unknown) => listeners.delete(ref),
		...fields,
	};
	const app = { internalPlugins: { getPluginById: (id: string) => (id === "sync" ? { enabled, instance } : null) } };
	return { app, instance, listeners, requests: () => requests };
}

describe("ObsidianSync", () => {
	it("reads the status, the run and the server's answer", () => {
		const o = obsidianSync({ status: "syncing", syncing: true, ready: false });
		expect(new ObsidianSync(o.app).snapshot()).toEqual({ status: "syncing", running: true, ready: false, connected: true, heardAt: null });
	});

	it("keeps the run apart from the status: an error shown mid-run is still a run", () => {
		const o = obsidianSync({ status: "error", syncing: true });
		expect(new ObsidianSync(o.app).snapshot()).toMatchObject({ status: "error", running: true });
	});

	it("reads uninitialized as still loading, not off: Sync hasn't read its data yet after a cold start", () => {
		expect(new ObsidianSync(obsidianSync({ status: "uninitialized" }).app).snapshot().status).toBe("loading");
	});

	it.each(["disconnected", "something new"])("counts %s as off", (status) => {
		expect(new ObsidianSync(obsidianSync({ status }).app).snapshot().status).toBe("off");
	});

	it("is off when the core plugin is disabled, missing or reshaped", () => {
		expect(new ObsidianSync(obsidianSync({}, false).app).snapshot().status).toBe("off");
		expect(new ObsidianSync({}).snapshot().status).toBe("off");
		expect(new ObsidianSync(null).snapshot().status).toBe("off");
		expect(new ObsidianSync(obsidianSync({ requestSync: undefined }).app).snapshot().status).toBe("off");
		expect(new ObsidianSync(obsidianSync({ getStatus: () => { throw new Error("gone"); } }).app).snapshot().status).toBe("off");
	});

	it("falls back on the status when the run and the answer flags are gone", () => {
		const o = obsidianSync({ status: "syncing", syncing: undefined, ready: undefined });
		expect(new ObsidianSync(o.app).snapshot()).toEqual({ status: "syncing", running: true, ready: true, connected: true, heardAt: null });
	});

	it("reads the server's socket and its last word", () => {
		const open = { isConnected: () => true, lastMessageTs: 1234 };
		expect(new ObsidianSync(obsidianSync({ server: open }).app).snapshot()).toMatchObject({ connected: true, heardAt: 1234 });
		const closed = { isConnected: () => null, lastMessageTs: 1234 };
		expect(new ObsidianSync(obsidianSync({ server: closed }).app).snapshot()).toMatchObject({ connected: false, heardAt: 1234 });
		expect(new ObsidianSync(obsidianSync({ server: null }).app).snapshot()).toMatchObject({ connected: false, heardAt: 0 });
		expect(new ObsidianSync(obsidianSync({ server: {} }).app).snapshot()).toMatchObject({ connected: true, heardAt: null });
	});

	it("pings an open socket only", () => {
		const sent: unknown[] = [];
		let connected = true;
		const server = { isConnected: () => connected, send: (message: unknown) => sent.push(message), lastMessageTs: 0 };
		const sync = new ObsidianSync(obsidianSync({ server }).app);
		sync.probe();
		connected = false;
		sync.probe();
		expect(sent).toEqual([{ op: "ping" }]);
		expect(() => new ObsidianSync(obsidianSync({ server: { isConnected: () => true, send: () => { throw new Error("closed"); } } }).app).probe()).not.toThrow();
		expect(() => new ObsidianSync({}).probe()).not.toThrow();
	});

	it("asks for a run and swallows its failure", async () => {
		const o = obsidianSync();
		new ObsidianSync(o.app).request();
		expect(o.requests()).toBe(1);
		const failing = obsidianSync({ requestSync: () => Promise.reject(new Error("offline")) });
		expect(() => new ObsidianSync(failing.app).request()).not.toThrow();
		await Promise.resolve();
	});

	it("listens to status-change until unsubscribed", () => {
		const o = obsidianSync();
		let calls = 0;
		const off = new ObsidianSync(o.app).onChange(() => calls++);
		for (const cb of o.listeners.values()) cb();
		off();
		expect([calls, o.listeners.size]).toEqual([1, 0]);
	});

	it("does nothing without Sync", () => {
		const sync = new ObsidianSync({});
		expect(() => sync.request()).not.toThrow();
		expect(() => sync.onChange(() => undefined)()).not.toThrow();
	});
});
