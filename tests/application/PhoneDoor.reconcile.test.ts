import { describe, expect, it } from "vitest";
import type { CreatedTask, ProjectsScreenState, ScreenView } from "../../core/application/contracts";
import { callDoor, type DoorAnswer, type DoorContext } from "../../core/application/PhoneCalls";

/**
 * `tasks.reconcile(idMap, dropped)`: after a host replayed its pending calls over a file changed elsewhere, the device's
 * Projects screen follows: the carry's tasks by their new ids, and the screen changes of the calls the replay dropped
 * taken back.
 */

const nowMs = new Date(2026, 10, 15, 12, 0).getTime();
const DAY = "2026-11-15";
const FILE = ["## Inbox", "", "- [ ] Voice 🗂️ Small talk", "", "## Projects", "", "- Дружба", "\t- Small talk", "", "## Now", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n");
type Ok = Extract<DoorAnswer, { ok: true }>;

/** A replica as the plugin's runtime keeps it: each answer's parts kept and handed in again. */
class Replica {
	constructor(public context: DoorContext) {}

	call(method: string, args: unknown[]): DoorAnswer {
		const answer = callDoor(method, args, this.context);
		if (answer.ok) this.keep(answer);
		return answer;
	}

	ok(method: string, args: unknown[]): Ok {
		const answer = this.call(method, args);
		if (!answer.ok) throw new Error(`${method}: ${answer.error.code}`);
		return answer;
	}

	private keep(answer: Ok): void {
		this.context = {
			...this.context,
			...(answer.tasks !== undefined && { tasks: answer.tasks }),
			...(answer.history !== undefined && { history: answer.history }),
			...(answer.projectsScreen !== undefined && { projectsScreen: answer.projectsScreen }),
			...(answer.ids !== undefined && { ids: answer.ids }),
		};
	}
}

const NEW_TASK = ["New one", null, { kind: "list", list: "inbox", group: null, before: null }];

/** A task created and lifted, then Sync brought a line above it: the base the runtime replays the create over. */
function liftedThenSynced(): { replica: Replica; created: CreatedTask; replayed: CreatedTask } {
	const replica = new Replica({ tasks: FILE, nowMs });
	replica.ok("tasks.normalize", []);
	const base = replica.context.tasks!;
	const created = replica.ok("tasks.createWithId", NEW_TASK).result as CreatedTask;
	const screen = replica.ok("tasks.screen", [DAY]).result as ScreenView;
	const lifted = screen.inbox.find((i) => i.id === created.id)!;
	replica.ok("tasks.startCarry", [{ keys: [lifted.key] }, true]);
	replica.context = { ...replica.context, tasks: base.replace("## Inbox\n\n", "## Inbox\n\n- [ ] From another device\n") };
	const replayed = replica.ok("tasks.createWithId", NEW_TASK).result as CreatedTask;
	return { replica, created, replayed };
}

describe("tasks.reconcile", () => {
	it("carries a lifted task to its replayed id: let go on a row, it lands", () => {
		const { replica, created, replayed } = liftedThenSynced();
		expect(replayed.id).not.toBe(created.id);
		const reconciled = replica.ok("tasks.reconcile", [{ [created.id]: replayed.id }, []]);
		expect(reconciled.tasks).toBeUndefined();
		expect((reconciled.result as ProjectsScreenState).carry!.keys[0]).toMatchObject({ id: replayed.id, raw: "- [ ] New one", index: 2 });
		replica.ok("tasks.carryOnNode", ["project:Дружба"]);
		expect(replica.context.tasks).toContain("- [ ] New one 🗂️ Дружба\n");
	});

	it("is what a drop needs: without it the lifted task is stale", () => {
		const { replica } = liftedThenSynced();
		expect(replica.call("tasks.carryOnNode", ["project:Дружба"])).toMatchObject({ ok: false, error: { code: "staleTask" } });
	});

	it("takes back a dropped rename's screen change: the filter goes back to the project's name", () => {
		const replica = new Replica({ tasks: FILE, nowMs, projectsScreen: { selected: "project:Small talk", folded: ["project:Small talk"] } });
		replica.ok("tasks.renameProject", ["Small talk", "Разговоры"]);
		expect(replica.context.projectsScreen).toMatchObject({ selected: "project:Разговоры", folded: ["project:Разговоры"] });
		replica.context = { ...replica.context, tasks: FILE };
		const reconciled = replica.ok("tasks.reconcile", [{}, [{ method: "tasks.renameProject", args: ["Small talk", "Разговоры"] }]]);
		expect(reconciled.result).toEqual({ selected: "project:Small talk", folded: ["project:Small talk"] });
		expect(reconciled.projectsScreen).toEqual(reconciled.result);
	});

	it("takes back a dropped new project's choice: the node chosen before it, as the call recorded it", () => {
		const before: ProjectsScreenState = { selected: "project:Дружба" };
		const replica = new Replica({ tasks: FILE, nowMs, projectsScreen: before });
		replica.ok("tasks.createProject", ["Старые друзья", { parent: "Дружба", before: null }]);
		expect(replica.context.projectsScreen).toMatchObject({ selected: "project:Старые друзья" });
		replica.context = { ...replica.context, tasks: FILE };
		const dropped = [{ method: "tasks.createProject", args: ["Старые друзья", { parent: "Дружба", before: null }], projectsScreen: before }];
		expect(replica.ok("tasks.reconcile", [{}, dropped]).result).toEqual({ selected: "project:Дружба", folded: [] });
	});

	it("takes back only the folds a dropped new project opened: a branch folded since stays folded", () => {
		const file = FILE.replace("\t- Small talk", "\t- Small talk\n- Other\n\t- Inner\n- Third\n\t- Deep");
		const before: ProjectsScreenState = { selected: "project:Дружба", folded: ["project:Дружба", "project:Other"] };
		const replica = new Replica({ tasks: file, nowMs, projectsScreen: before });
		replica.ok("tasks.createProject", ["Старые друзья", { parent: "Дружба", before: null }]);
		expect(replica.context.projectsScreen).toEqual({ selected: "project:Старые друзья", folded: ["project:Other"] });
		replica.context = { ...replica.context, projectsScreen: { ...replica.context.projectsScreen, folded: ["project:Other", "project:Third"] } };
		replica.context = { ...replica.context, tasks: file };
		const dropped = [{ method: "tasks.createProject", args: ["Старые друзья", { parent: "Дружба", before: null }], projectsScreen: before }];
		expect(replica.ok("tasks.reconcile", [{}, dropped]).result).toEqual({ selected: "project:Дружба", folded: ["project:Дружба", "project:Other", "project:Third"] });
	});

	it("leaves the node chosen since a dropped new project as it is", () => {
		const before: ProjectsScreenState = { selected: "project:Дружба" };
		const replica = new Replica({ tasks: FILE, nowMs, projectsScreen: before });
		replica.ok("tasks.createProject", ["Старые друзья", { parent: "Дружба", before: null }]);
		replica.context = { ...replica.context, tasks: FILE, projectsScreen: { ...replica.context.projectsScreen, selected: "project:Small talk" } };
		const dropped = [{ method: "tasks.createProject", args: ["Старые друзья", { parent: "Дружба", before: null }], projectsScreen: before }];
		expect(replica.ok("tasks.reconcile", [{}, dropped]).result).toEqual({ selected: "project:Small talk", folded: [] });
	});

	it("leaves a screen nothing touched as it is", () => {
		const replica = new Replica({ tasks: FILE, nowMs, projectsScreen: { selected: "project:Дружба" } });
		expect(replica.ok("tasks.reconcile", [{}, []]).result).toEqual({ selected: "project:Дружба" });
	});
});
