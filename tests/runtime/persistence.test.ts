import { describe, expect, it } from "vitest";
import type { CreatedTask } from "../../core/application/contracts";
import { NOTICE_WORDS } from "../../obsidian/runtime/events";
import { FILE, harness, itemOf, ok, PATH, screenOf, settle } from "./harness";

const NEW = (title: string) => [title, null, { kind: "list", list: "inbox", group: null, before: null }];

describe("the runtime's door calls", () => {
	it("run in the order asked, each visible at once in the replica, and are written in that order", async () => {
		const { runtime, vault } = await harness();
		const a = ok(runtime.call("tasks.createWithId", NEW("A")).answer) as CreatedTask;
		expect(runtime.replica.state.tasks).toContain("- [ ] A");
		ok(runtime.call("tasks.createWithId", NEW("B")).answer);
		const done = runtime.call("tasks.setStatus", [a.key, "done"]);
		expect(done.pending?.seq).toBe(3);
		expect(itemOf(runtime, "A").open).toBe(false);
		await settle(runtime);
		expect(vault.text(PATH)).toBe(runtime.replica.state.tasks);
		expect(vault.text(PATH)).toMatch(/- \[ \] B[\s\S]*- \[x\] A/);
	});

	it("finds a task by its id when its line changed elsewhere in place: a pin commits on the current key", async () => {
		const { runtime, vault } = await harness();
		const idea = itemOf(runtime, "Idea");
		vault.outside(PATH, vault.text(PATH)!.replace("- [ ] Idea", "- [ ] Idea, edited"));
		await settle(runtime);
		ok(runtime.call("tasks.setStatus", [idea.key, "done"]).answer);
		expect(runtime.replica.state.tasks).toContain("- [x] Idea, edited");
	});
});

describe("persistence of the tasks text", () => {
	it("writes over the base only: an outside write landing between the base and the write is replayed over, never lost", async () => {
		const { runtime, vault, notices } = await harness();
		const idea = itemOf(runtime, "Idea");
		vault.between.push(() => vault.outside(PATH, vault.text(PATH)!.replace("## Inbox\n\n", "## Inbox\n\n- [ ] From the phone\n"), false));
		ok(runtime.call("tasks.setStatus", [idea.key, "done"]).answer);
		await settle(runtime);
		expect(vault.text(PATH)).toContain("- [ ] From the phone");
		expect(vault.text(PATH)).toContain("- [x] Idea");
		expect(runtime.replica.state.tasks).toBe(vault.text(PATH));
		expect(notices).toEqual([]);
	});

	it("finds its own echo: our write's change event changes nothing", async () => {
		const { runtime, vault, events } = await harness();
		ok(runtime.call("tasks.setStatus", [itemOf(runtime, "Idea").key, "done"]).answer);
		const after = runtime.replica.state;
		await settle(runtime);
		expect(vault.written).toHaveLength(1);
		expect(runtime.replica.state).toBe(after);
		expect(events).toEqual([]);
	});

	it("persists the tidy of a file read: a closed task goes to Done, with no step of undo and nothing pending", async () => {
		const untidy = FILE.replace("- [ ] Shop", "- [ ] Shop\n- [x] Bought bread");
		const { runtime, vault } = await harness({ file: untidy });
		expect(vault.text(PATH)).not.toBe(untidy);
		expect(vault.text(PATH)).toBe(runtime.replica.state.tasks);
		expect(vault.text(PATH)!.indexOf("Bought bread")).toBeGreaterThan(vault.text(PATH)!.indexOf("## Done"));
		expect(ok(runtime.read("history.canUndo", []))).toBe(false);
	});

	it("takes a file Sync changed while nothing is pending as the new base", async () => {
		const { runtime, vault } = await harness();
		vault.outside(PATH, FILE.replace("- [ ] Idea", "- [ ] Idea from the Mac"));
		await settle(runtime);
		expect(itemOf(runtime, "Idea from the Mac")).toBeDefined();
		expect(vault.written).toEqual([]);
	});

	it("answers what needs no tasks file while it is missing: the day, the calendars, the minute's tick", async () => {
		const { runtime, timers } = await harness({ file: null });
		expect(ok(runtime.read("days.today", []))).toBe("2026-11-15");
		expect(ok(runtime.read("calendars.sources", []))).toEqual(expect.arrayContaining([expect.objectContaining({ source: "google" })]));
		expect(runtime.read("calendars.events", ["2026-11-15"]).ok).toBe(true);
		expect(() => timers.fire()).not.toThrow();
	});

	it("creates a missing file through the door's createFile", async () => {
		const { runtime, vault, events } = await harness({ file: null });
		expect(events).toContainEqual({ kind: "fileGone", path: PATH });
		expect(screenOf(runtime).missing).toBe(true);
		ok(runtime.call("tasks.createFile", []).answer);
		await settle(runtime);
		expect(vault.text(PATH)).toBe(runtime.replica.state.tasks);
		expect(vault.text(PATH)).toContain("## Inbox");
		ok(runtime.call("tasks.createWithId", NEW("First")).answer);
		await settle(runtime);
		expect(vault.text(PATH)).toContain("- [ ] First");
	});
});

describe("a file that goes", () => {
	it("renamed mid-write: the write is not made in the renamed file, the pending calls drop with a notice, the screen offers a new file", async () => {
		const { runtime, vault, notices, events } = await harness();
		vault.between.push(() => vault.rename(PATH, "Archive/Old tasks.md"));
		ok(runtime.call("tasks.setStatus", [itemOf(runtime, "Idea").key, "done"]).answer);
		await settle(runtime);
		expect(vault.text("Archive/Old tasks.md")).toBe(FILE);
		expect(notices).toEqual([NOTICE_WORDS.gone(PATH)]);
		expect(runtime.replica.state.tasks).toBeNull();
		expect(events.map((e) => e.kind)).toEqual(["rebased", "fileGone"]);
		expect(events[0]).toMatchObject({ dropped: [{ method: "tasks.setStatus" }] });
	});

	it("tasksFile changed by another device's settings: like a file gone, then the new file is read", async () => {
		const { runtime, vault, settings, notices } = await harness();
		vault.outside("Other.md", FILE.replace("- [ ] Idea", "- [ ] Other idea"), false);
		vault.hold();
		ok(runtime.call("tasks.setStatus", [itemOf(runtime, "Idea").key, "done"]).answer);
		await settings.update({ tasksFile: "Other.md" });
		vault.release();
		await settle(runtime);
		expect(vault.text(PATH)).toBe(FILE);
		expect(vault.text("Other.md")).toContain("- [ ] Other idea");
		expect(itemOf(runtime, "Other idea")).toBeDefined();
		expect(notices).toEqual([NOTICE_WORDS.gone(PATH)]);
	});
});

describe("unload", () => {
	it("leaves the persistence queue running until it is empty, and watches nothing more", async () => {
		const { runtime, vault } = await harness();
		vault.hold();
		ok(runtime.call("tasks.setStatus", [itemOf(runtime, "Idea").key, "done"]).answer);
		let drained = false;
		const unloaded = runtime.unload().then(() => (drained = true));
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(drained).toBe(false);
		expect(vault.listenerCount).toBe(0);
		vault.release();
		await unloaded;
		expect(vault.text(PATH)).toContain("- [x] Idea");
	});
});
