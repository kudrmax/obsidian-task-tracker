import { describe, expect, it } from "vitest";
import type { CreatedTask, ProjectsScreenState } from "../../core/application/contracts";
import type { RuntimeEvent } from "../../obsidian/runtime/events";
import { NOTICE_WORDS } from "../../obsidian/ui/failureText";
import { sectionRef } from "../../obsidian/runtime/replica/refs";
import { DAY, FILE, harness, itemOf, ManualClock, ok, PATH, screenOf, settle } from "./harness";

const NEW = (title: string) => [title, null, { kind: "list", list: "inbox", group: null, before: null }];
const SYNC_LINE = "- [ ] From another device";
/** Sync brings a line to the top of Inbox: every task below moves. */
const withSyncLine = (text: string) => text.replace("## Inbox\n\n", `## Inbox\n\n${SYNC_LINE}\n`);
const rebased = (events: readonly RuntimeEvent[]) => events.filter((e): e is Extract<RuntimeEvent, { kind: "rebased" }> => e.kind === "rebased");
const idNumber = (id: string) => Number(id.slice(1));

describe("Sync while calls are pending", () => {
	it("replays three pending calls over the new text; the one whose task went is dropped with a notice and a reverse transition", async () => {
		const { runtime, vault, notices, events } = await harness();
		vault.between.push(() => vault.outside(PATH, withSyncLine(FILE).replace("- [ ] Shop\n", ""), false));
		ok(runtime.call("tasks.setStatus", [itemOf(runtime, "Idea").key, "done"]).answer);
		const stale = runtime.call("tasks.setStatus", [itemOf(runtime, "Shop").key, "done"]).pending!;
		ok(runtime.call("tasks.createWithId", NEW("New one")).answer);
		await settle(runtime);
		const file = vault.text(PATH)!;
		expect(file).toContain(SYNC_LINE);
		expect(file).toContain("- [x] Idea");
		expect(file).toContain("- [ ] New one");
		expect(file).not.toContain("Shop");
		expect(notices).toEqual([NOTICE_WORDS.stale]);
		expect(rebased(events)).toEqual([{ kind: "rebased", idMap: expect.any(Object), dropped: [expect.objectContaining({ seq: stale.seq, method: "tasks.setStatus" })] }]);
		expect(runtime.replica.state.tasks).toBe(file);
	});

	it("maps a dependent call through a create the replay gave a new id: the call after it still finds its task", async () => {
		const { runtime, vault, events } = await harness();
		vault.between.push(() => vault.outside(PATH, withSyncLine(FILE), false));
		const created = ok(runtime.call("tasks.createWithId", NEW("Fresh")).answer) as CreatedTask;
		ok(runtime.call("tasks.rename", [created.key, "Fresh, renamed"]).answer);
		await settle(runtime);
		const [{ idMap, dropped }] = rebased(events);
		expect(dropped).toEqual([]);
		const replayedId = idMap[created.id];
		expect(replayedId).toBeDefined();
		expect(replayedId).not.toBe(created.id);
		const fresh = itemOf(runtime, "Fresh, renamed");
		expect(fresh.id).toBe(replayedId);
		expect(vault.text(PATH)).toContain("- [ ] Fresh, renamed");
	});

	it("never gives an id twice: the line Sync added takes no id a pin still holds, and replayed ids go on from the counter", async () => {
		const { runtime, vault, events } = await harness();
		const seen = new Set(runtime.replica.state.ids!.lines.map((l) => l.id));
		vault.between.push(() => vault.outside(PATH, withSyncLine(FILE), false));
		const created = ok(runtime.call("tasks.createWithId", NEW("Pinned")).answer) as CreatedTask;
		seen.add(created.id);
		await settle(runtime);
		const synced = itemOf(runtime, "From another device");
		const replayed = rebased(events)[0].idMap[created.id];
		expect(seen.has(synced.id)).toBe(false);
		expect(seen.has(replayed)).toBe(false);
		expect(Math.min(idNumber(synced.id), idNumber(replayed))).toBeGreaterThan(Math.max(...[...seen].map(idNumber)));
	});

	it("names a section by its id: one renamed on another device while a call is pending is found by its new name", async () => {
		const { runtime, vault, notices } = await harness();
		const errands = screenOf(runtime).sections.now.find((s) => s.name === "Errands")!;
		vault.between.push(() => vault.outside(PATH, FILE.replace("### Errands", "### Shopping"), false));
		ok(runtime.call("tasks.renameGroup", ["now", sectionRef(errands.id), "Chores"]).answer);
		expect(runtime.replica.state.tasks).toContain("### Chores");
		await settle(runtime);
		expect(vault.text(PATH)).toContain("### Chores");
		expect(vault.text(PATH)).not.toContain("### Shopping");
		expect(notices).toEqual([]);
	});

	it("replays calls from before the day boundary over a base tidied for the new day", async () => {
		const clock = new ManualClock(new Date(2026, 10, 16, 4, 59, 30).getTime());
		const slotted = FILE.replace("- [ ] Parent", `- [ ] Parent ⏰ ${DAY} 10:00-11:00`);
		const { runtime, vault, timers } = await harness({ clock, file: slotted });
		expect(runtime.replica.state.tasks).toContain(`⏰ ${DAY} 10:00-11:00`);
		vault.hold();
		ok(runtime.call("tasks.setStatus", [itemOf(runtime, "Idea", DAY).key, "done"]).answer);
		clock.ms = new Date(2026, 10, 16, 5, 0, 0).getTime();
		timers.fire();
		expect(runtime.replica.state.tasks).not.toContain("⏰");
		vault.outside(PATH, withSyncLine(slotted), false);
		vault.release();
		await settle(runtime);
		const file = vault.text(PATH)!;
		expect(file).toContain(SYNC_LINE);
		expect(file).toContain("- [x] Idea");
		expect(file).not.toContain("⏰");
	});
});

describe("the kept parts after a replay", () => {
	it("Sync during a carry with a write pending: the carry and the chosen node stay, and a drop on a tree row lands via reconcile", async () => {
		const { runtime, vault, screens } = await harness();
		ok(runtime.call("tasks.pickProjectNode", ["project:Дружба", true]).answer);
		vault.hold();
		const created = ok(runtime.call("tasks.createWithId", NEW("Lifted")).answer) as CreatedTask;
		ok(runtime.call("tasks.startCarry", [{ keys: [created.key] }, true]).answer);
		vault.outside(PATH, withSyncLine(FILE), true);
		vault.release();
		await settle(runtime);
		const state = runtime.replica.state.projectsScreen;
		expect(state.selected).toBe("project:Дружба");
		expect(state.carry!.keys[0].id).toBe(itemOf(runtime, "Lifted").id);
		expect(state.carry!.keys[0].id).not.toBe(created.id);
		expect(screens.get()).toBe(state);
		ok(runtime.call("tasks.carryOnNode", ["project:Small talk"]).answer);
		await settle(runtime);
		expect(vault.text(PATH)).toContain("- [ ] Lifted 🗂️ Small talk");
		expect(vault.text(PATH)).toContain(SYNC_LINE);
	});

	it("takes back a dropped call's change of the screen: past two replays the file is taken as it is, the rename dropped, the node its old name", async () => {
		const { runtime, vault, notices, events } = await harness();
		ok(runtime.call("tasks.pickProjectNode", ["project:Small talk", true]).answer);
		const changes = [1, 2, 3].map((n) => () => vault.outside(PATH, FILE.replace("- [ ] Idea", `- [ ] Idea ${n}`), false));
		vault.between.push(...changes);
		ok(runtime.call("tasks.renameProject", ["Small talk", "Разговоры"]).answer);
		expect(runtime.replica.state.projectsScreen.selected).toBe("project:Разговоры");
		await settle(runtime);
		expect(notices).toEqual([NOTICE_WORDS.busy]);
		expect(vault.text(PATH)).toBe(FILE.replace("- [ ] Idea", "- [ ] Idea 3"));
		expect((runtime.replica.state.projectsScreen as ProjectsScreenState).selected).toBe("project:Small talk");
		expect(rebased(events)[rebased(events).length - 1].dropped).toEqual([expect.objectContaining({ method: "tasks.renameProject" })]);
	});
});
