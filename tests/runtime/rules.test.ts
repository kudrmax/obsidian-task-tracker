import { describe, expect, it } from "vitest";
import type { TFile } from "obsidian";
import type { DoorAnswer, DoorContext } from "../../core/application/PhoneCalls";
import type { CalendarFeed } from "../../obsidian/runtime/network/CalendarLane";
import { type Door, InProcessDoor } from "../../obsidian/runtime/replica/Door";
import { FILE, harness, itemOf, ok, PATH, settle } from "./harness";

const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The real door, with one method's answer changed by the test. */
class AlteredDoor implements Door {
	private readonly real = new InProcessDoor();
	constructor(private readonly alter: (method: string, answer: DoorAnswer, context: DoorContext) => DoorAnswer) {}
	call(method: string, args: readonly unknown[], context: DoorContext): DoorAnswer {
		return this.alter(method, this.real.call(method, args, context), context);
	}
}

/** A write whose text is taken at once but whose landing on the disk waits for `open`. */
function slowLanding(vault: { process: (file: TFile, fn: (data: string) => string) => Promise<string> }): () => void {
	const real = vault.process.bind(vault);
	let open!: () => void;
	const landing = new Promise<void>((resolve) => (open = resolve));
	vault.process = async (file, fn) => {
		const out = await real(file, fn);
		await landing;
		return out;
	};
	return open;
}

describe("A. an async outcome is thrown away when what it depended on moved", () => {
	it("a write landing after tasksFile changed gives the new file nothing of the old one: not its text, not its undo steps", async () => {
		const { runtime, vault, settings } = await harness();
		vault.outside("Other.md", FILE.replace("- [ ] Idea", "- [ ] Other idea"), false);
		const open = slowLanding(vault);
		ok(runtime.call("tasks.setStatus", [itemOf(runtime, "Idea").key, "done"]).answer);
		await macrotask();
		await settings.update({ tasksFile: "Other.md" });
		for (let i = 0; i < 5; i++) await macrotask();
		open();
		await settle(runtime);
		expect(runtime.replica.state.tasks).toContain("- [ ] Other idea");
		expect(ok(runtime.read("history.canUndo", []))).toBe(false);
	});

	it("a new file whose text is what the old one was just written as is still read: the screen does not say the file is missing", async () => {
		const { runtime, vault, settings, events } = await harness();
		const open = slowLanding(vault);
		ok(runtime.call("tasks.setStatus", [itemOf(runtime, "Idea").key, "done"]).answer);
		await macrotask();
		vault.outside("Other.md", vault.text(PATH)!, false);
		await settings.update({ tasksFile: "Other.md" });
		for (let i = 0; i < 5; i++) await macrotask();
		open();
		await settle(runtime);
		expect(runtime.replica.state.tasks).toBe(vault.text("Other.md"));
		expect(events.filter((e) => e.kind === "fileGone").map((e) => (e as { path: string }).path)).toEqual([PATH]);
		expect(ok(runtime.read("history.canUndo", []))).toBe(false);
	});

	it("follows a tasksFile changed while the first read is under way", async () => {
		const { runtime, vault, settings } = await harness({ ready: false });
		vault.outside("Other.md", FILE.replace("- [ ] Idea", "- [ ] Other idea"), false);
		let open!: () => void;
		vault.readGate = new Promise((resolve) => (open = resolve));
		runtime.hostReady("layout");
		runtime.hostReady("metadata");
		await macrotask();
		await settings.update({ tasksFile: "Other.md" });
		open();
		vault.readGate = null;
		await runtime.ready();
		await settle(runtime);
		expect(runtime.replica.state.tasks).toContain("- [ ] Other idea");
	});
});

describe("B. the log's base is the whole replica but the pending text calls", () => {
	it("an undo that ends in conflict clears the steps, and the next Sync does not bring them back", async () => {
		const { runtime, vault } = await harness();
		ok(runtime.call("tasks.rename", [itemOf(runtime, "Idea").key, "Idea mine"]).answer);
		await settle(runtime);
		vault.outside(PATH, vault.text(PATH)!.replace("- [ ] Idea mine", "- [ ] Idea theirs"));
		await settle(runtime);
		expect(ok(runtime.call("history.undo", []).answer)).toBe("conflict");
		expect(ok(runtime.read("history.canUndo", []))).toBe(false);
		vault.outside(PATH, vault.text(PATH)!.replace("- [ ] Shop", "- [ ] Shop synced"));
		await settle(runtime);
		expect(ok(runtime.read("history.canUndo", []))).toBe(false);
	});
});

describe("C. a read's answer is taken like a call's, only not logged", () => {
	it("settings a read answers (the phone carrying the calendars' choice over) reach the replica and data.json", async () => {
		const door = new AlteredDoor((method, answer, context) => {
			if (method !== "calendars.known" || !answer.ok) return answer;
			return { ...answer, settings: JSON.stringify({ ...JSON.parse(context.settings!), calendarsMigrated: true }) };
		});
		const { runtime, host } = await harness({ door, isIosApp: true });
		ok(runtime.read("calendars.known", []));
		expect(JSON.parse(runtime.replica.state.settings).calendarsMigrated).toBe(true);
		await settle(runtime);
		expect(host.file.calendarsMigrated).toBe(true);
	});
});

describe("D. a failure is kept by its kind", () => {
	it("a read that fails does not mark the writes stuck, and a later write failure shows", async () => {
		const { runtime, vault } = await harness();
		const read = vault.read.bind(vault);
		vault.read = async () => {
			throw new Error("read failed");
		};
		vault.outside(PATH, FILE.replace("- [ ] Shop", "- [ ] Shop, synced"));
		await settle(runtime);
		expect(runtime.stuck).toBeNull();
		vault.read = read;
		vault.process = async () => {
			throw new Error("write failed");
		};
		ok(runtime.call("tasks.rename", [itemOf(runtime, "Idea").key, "I"]).answer);
		await settle(runtime);
		expect((runtime.stuck as Error).message).toBe("write failed");
	});

	it("a read that fails at the start rejects ready()", async () => {
		const { runtime, vault } = await harness({ ready: false });
		vault.read = async () => {
			throw new Error("disk gone");
		};
		runtime.hostReady("layout");
		runtime.hostReady("metadata");
		await expect(runtime.ready()).rejects.toThrow("disk gone");
	});
});

describe("E. nothing outlives unload, nothing rejects unheard", () => {
	it("the lane's silence timer and a read landing late are gone with the runtime", async () => {
		const feed: CalendarFeed = { name: "google", refresh: () => new Promise(() => undefined) };
		const { runtime, timers } = await harness({ feeds: [feed] });
		const fetching = runtime.refreshCalendars("refresh");
		await macrotask();
		expect(timers.delays).toContain(15_000);
		await runtime.unload();
		expect(timers.pending.size).toBe(0);
		void fetching;
	});

	it("the minute's clock keeps ticking when a tick fails", async () => {
		let fail = false;
		const door = new AlteredDoor((method, answer) => (fail && method === "days.today" ? { ok: false, error: { code: "failed", message: "boom" } } : answer));
		const { timers } = await harness({ door });
		fail = true;
		expect(() => timers.fire()).not.toThrow();
		expect(timers.pending.size).toBe(1);
	});

	it("a host's teardown ends only the carry that host started", async () => {
		const { runtime, screens } = await harness();
		const leaf = runtime.openHost();
		const block = runtime.openHost();
		ok(leaf.call("tasks.startCarry", [{ keys: [itemOf(runtime, "Idea").key] }, true]).answer);
		block.teardown();
		expect(screens.get().carry).toBeDefined();
		leaf.teardown();
		expect(screens.get().carry).toBeUndefined();
	});
});
