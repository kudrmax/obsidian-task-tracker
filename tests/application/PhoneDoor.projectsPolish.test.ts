import { describe, expect, it } from "vitest";
import { callDoor, type DoorAnswer, type DoorContext, type EntryAnswer } from "../../core/application/PhoneCalls";
import type { FullTree, ProjectNote, ScreenView } from "../../core/application/contracts";

/** Projects polish through the door: what the iPhone app asks for the quick entry, New Task, New project… and the full screen. */
const T = "2026-11-10";
const NOW = new Date(2026, 10, 10, 9, 0).getTime();
const NOTES: readonly ProjectNote[] = [
	{ name: "Дружба", path: "Дружба.md", link: "Дружба" },
	{ name: "Английский", path: "Английский.md", link: "Английский" },
];
const FILE = ["## Inbox", "", "## Now", "", "## Soon", "", "- [ ] S 🗂️ [[Дружба]]", "\t- [ ] Sub", "", "## Backlog", "", "## Done", ""].join("\n");

const context = (extra: Partial<DoorContext> = {}): DoorContext => ({ tasks: FILE, nowMs: NOW, projects: NOTES, ...extra });

function ok(answer: DoorAnswer): Extract<DoorAnswer, { ok: true }> {
	if (!answer.ok) throw new Error(`${answer.error.code}: ${answer.error.message}`);
	return answer;
}

const call = (method: string, args: unknown[], extra: Partial<DoorContext> = {}) => ok(callDoor(method, JSON.parse(JSON.stringify(args)), context(extra)));

describe("the quick entry's Project through the door", () => {
	const look = { cards: { soon: [] }, sections: {}, sectioned: { soon: true }, day: T, shown: ["soon"] };

	it("entry.setProject chooses the field's project; the state carries the ready page", () => {
		const opened = call("entry.openAtEnd", [null, look, "soon"]).result as EntryAnswer;
		expect(opened.state?.project?.lit).toBe(false);
		const chosen = call("entry.setProject", [opened.session, look, "Дружба"]).result as EntryAnswer;
		expect(chosen.state?.project).toMatchObject({ lit: true, page: { value: "Дружба", newLabel: "New project…" } });
		const typed = call("entry.type", [chosen.session, look, "Meet"]).result as EntryAnswer;
		const entered = call("entry.enter", [typed.session, look]).result as EntryAnswer;
		const job = call("entry.call", [entered.session, look, entered.jobs[0].id]).result as EntryAnswer;
		const written = call("tasks.createWithId", (job.value as { args: unknown[] }).args);
		expect(written.tasks).toContain("- [ ] Meet 🗂️ [[Дружба]]\n");
	});
});

describe("New Task with a project (point 3)", () => {
	it("capture.project gives the sheet's Project page for the project chosen, the view's at the start", () => {
		const page = call("capture.project", ["Дружба"]).result as { lit: boolean; page: { current: { name: string } | null } };
		expect(page).toMatchObject({ lit: true, page: { current: { name: "Дружба" } } });
		expect(call("capture.project", [null]).result).toMatchObject({ lit: false, page: { none: true } });
	});

	it("capture.add writes the task with the project chosen, last in its list", () => {
		const answer = call("capture.add", ["inbox", "Call Anna", null, "", "Дружба"]);
		expect(answer.tasks).toContain("## Inbox\n\n- [ ] Call Anna 🗂️ [[Дружба]]\n");
		expect(call("capture.add", ["inbox", "Plain", null, ""]).tasks).toContain("- [ ] Plain\n");
	});
});

describe("New project… through the door (point 6)", () => {
	it("notes.newProject names the note to write; notes.projectText gives its text with the settings' tag", () => {
		expect(call("notes.newProject", ["Свой дом", [{ path: "Дружба.md" }]]).result).toEqual({ name: "Свой дом", path: "Свой дом.md", link: "Свой дом", exists: false });
		expect(call("notes.newProject", ["", []]).result).toBeNull();
		expect(call("notes.newProject", ["TODOs Tasks", [{ path: "TODOs Tasks.md" }]]).result).toBeNull();
		expect(call("notes.newProject", ["Tasks", [{ path: "Tasks.md" }]], { settings: JSON.stringify({ tasksFile: "Inbox/Tasks.md" }) }).result).toBeNull();
		expect(call("notes.projectText", [null]).result).toBe("---\ntags:\n  - project\n---\n");
		expect(call("notes.projectText", ["Body\n"], { settings: JSON.stringify({ projectTag: "#goal" }) }).result).toBe("---\ntags:\n  - goal\n---\nBody\n");
	});
});

describe("the full screen's project line through the door (point 7)", () => {
	it("tasks.fullTree carries the project, a subtask's its parent's", () => {
		const screen = call("tasks.screen", [T]).result as ScreenView;
		const s = screen.soon[0];
		expect((call("tasks.fullTree", [s]).result as FullTree).project?.name).toBe("Дружба");
		expect((call("tasks.fullTree", [s.allSubtasks[0]]).result as FullTree).project?.name).toBe("Дружба");
	});
});
