import { describe, expect, it } from "vitest";
import type { TFile } from "obsidian";
import { NOTICE_WORDS } from "../../obsidian/runtime/events";
import { FILE, harness, itemOf, ok, PATH, settle } from "./harness";

const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("a write that fails", () => {
	it("is told once and waits for the next call: no retry loop, persisted() resolves, the queue says what it is stuck on", async () => {
		const { runtime, vault, notices } = await harness();
		const real = vault.process.bind(vault);
		let tries = 0;
		let failing = true;
		vault.process = async (file: TFile, fn: (data: string) => string) => {
			tries++;
			if (failing) throw new Error("EACCES");
			return real(file, fn);
		};
		ok(runtime.call("tasks.rename", [itemOf(runtime, "Idea").key, "Idea, renamed"]).answer);
		await macrotask();
		await runtime.persisted();
		expect(tries).toBe(1);
		expect(notices).toEqual(["EACCES"]);
		expect((runtime.stuck as Error).message).toBe("EACCES");
		ok(runtime.call("tasks.rename", [itemOf(runtime, "Call the bank").key, "Bank"]).answer);
		await settle(runtime);
		expect(tries).toBe(2);
		expect(notices).toEqual(["EACCES"]);
		failing = false;
		ok(runtime.call("tasks.rename", [itemOf(runtime, "Shop").key, "Shopping"]).answer);
		await settle(runtime);
		expect(runtime.stuck).toBeNull();
		expect(vault.text(PATH)).toContain("- [ ] Idea, renamed");
		expect(vault.text(PATH)).toContain("- [ ] Bank");
		expect(vault.text(PATH)).toContain("- [ ] Shopping");
	});

	it("a create that fails (no folder) is tried once, told once, and tried again on the next call", async () => {
		const { runtime, vault, notices } = await harness({ file: null });
		const real = vault.create.bind(vault);
		let tries = 0;
		vault.create = async (path: string, data: string) => {
			tries++;
			if (tries === 1) throw new Error("Folder does not exist");
			return real(path, data);
		};
		ok(runtime.call("tasks.createFile", []).answer);
		for (let i = 0; i < 20; i++) await macrotask();
		expect(tries).toBe(1);
		expect(notices).toEqual(["Folder does not exist"]);
		ok(runtime.call("tasks.createWithId", ["First", null, { kind: "list", list: "inbox", group: null, before: null }]).answer);
		await settle(runtime);
		expect(tries).toBe(2);
		expect(vault.text(PATH)).toContain("- [ ] First");
	});

	it("a write whose file the settings no longer name waits for the settings to land, without spinning", async () => {
		const { runtime, vault, settings, host } = await harness();
		vault.outside("Other.md", FILE, false);
		const real = vault.process.bind(vault);
		let calls = 0;
		vault.process = async (file: TFile, fn: (data: string) => string) => {
			calls++;
			return real(file, fn);
		};
		let land!: () => void;
		const saving = new Promise<void>((resolve) => (land = resolve));
		const save = host.saveData.bind(host);
		host.saveData = async (data: unknown) => {
			await saving;
			return save(data);
		};
		vault.hold();
		ok(runtime.call("tasks.rename", [itemOf(runtime, "Idea").key, "I"]).answer);
		const updated = settings.update({ tasksFile: "Other.md" });
		vault.release();
		for (let i = 0; i < 5; i++) await macrotask();
		expect(calls).toBe(1);
		land();
		await updated;
		await settle(runtime);
		expect(vault.text(PATH)).toBe(FILE);
		expect(vault.text("Other.md")).toBe(FILE);
	});
});

describe("the pending log", () => {
	it("retires calls whose net effect gives back the text written: none is left to replay, and a later Sync tells nothing", async () => {
		const { runtime, vault, notices, events } = await harness();
		let once = true;
		vault.on("modify", () => {
			if (!once) return;
			once = false;
			ok(runtime.call("tasks.rename", [itemOf(runtime, "Idea").key, "Idea two"]).answer);
			ok(runtime.call("tasks.rename", [itemOf(runtime, "Idea two").key, "Idea"]).answer);
		});
		ok(runtime.call("tasks.rename", [itemOf(runtime, "Call the bank").key, "Bank"]).answer);
		await settle(runtime);
		vault.outside(PATH, vault.text(PATH)!.replace("- [ ] Idea\n", ""));
		await settle(runtime);
		expect(notices).toEqual([]);
		expect(events.filter((e) => e.kind === "rebased")).toEqual([]);
		expect(runtime.replica.state.tasks).not.toContain("Idea");
	});

	it("takes calls made while a write waits on the vault: each lands, in order", async () => {
		const { runtime, vault } = await harness();
		vault.hold();
		ok(runtime.call("tasks.rename", [itemOf(runtime, "Idea").key, "One"]).answer);
		await macrotask();
		ok(runtime.call("tasks.rename", [itemOf(runtime, "One").key, "Two"]).answer);
		ok(runtime.call("tasks.rename", [itemOf(runtime, "Call the bank").key, "Bank"]).answer);
		vault.release();
		await settle(runtime);
		expect(vault.text(PATH)).toContain("- [ ] Two\n- [ ] Bank");
		expect(vault.text(PATH)).toBe(runtime.replica.state.tasks);
	});

	it("never lets a read overtaken by a write roll the replica back", async () => {
		const { runtime, vault } = await harness();
		let open!: () => void;
		vault.readGate = new Promise((resolve) => (open = resolve));
		vault.outside(PATH, FILE.replace("- [ ] Shop", "- [ ] Shop on the way"));
		ok(runtime.call("tasks.rename", [itemOf(runtime, "Idea").key, "Idea, mine"]).answer);
		vault.readGate = null;
		for (let i = 0; i < 10; i++) await macrotask();
		expect(vault.text(PATH)).toContain("- [ ] Idea, mine");
		open();
		await settle(runtime);
		expect(runtime.replica.state.tasks).toContain("- [ ] Idea, mine");
		expect(runtime.replica.state.tasks).toContain("- [ ] Shop on the way");
		expect(vault.text(PATH)).toBe(runtime.replica.state.tasks);
	});

	it("leaves the file untouched when a write is refused: Obsidian writes nothing and tells no change", async () => {
		const { runtime, vault } = await harness();
		vault.between.push(() => vault.outside(PATH, FILE.replace("- [ ] Shop", "- [ ] Shop, synced"), false));
		ok(runtime.call("tasks.rename", [itemOf(runtime, "Idea").key, "Idea, mine"]).answer);
		await settle(runtime);
		expect(vault.written).toHaveLength(1);
		expect(vault.told).toEqual(["modify"]);
		expect(vault.text(PATH)).toContain("- [ ] Shop, synced");
	});
});

describe("a file that goes, and the undo history", () => {
	it("forgets the old file's undo steps when tasksFile changes: nothing to undo on the new file", async () => {
		const { runtime, vault, settings, notices } = await harness();
		ok(runtime.call("tasks.setStatus", [itemOf(runtime, "Idea").key, "done"]).answer);
		await settle(runtime);
		expect(ok(runtime.read("history.canUndo", []))).toBe(true);
		vault.outside("Other.md", FILE, false);
		await settings.update({ tasksFile: "Other.md" });
		await settle(runtime);
		expect(ok(runtime.read("history.canUndo", []))).toBe(false);
		expect(notices).not.toContain(NOTICE_WORDS.gone(PATH));
	});
});
