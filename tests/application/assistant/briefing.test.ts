import { describe, expect, it } from "vitest";
import { ASSISTANT_ACTIONS } from "../../../core/application/assistant/actions";
import { briefingOf } from "../../../core/application/assistant/briefing";
import { SCOPE_NEEDS, targetOfPlace, tasksIn, type TaskScope } from "../../../core/application/assistant/scope";
import { rig, TODAY } from "./assistantFakes";

async function listed() {
	return rig().tasks.listed();
}

const titles = (items: readonly { title: string }[]) => items.map((i) => i.title);

describe("the briefing", () => {
	it("names each candidate by a ref in the order sent, in words: an unfolded task's open subtask, never the task itself", async () => {
		const tasks = await listed();
		const briefing = briefingOf(tasks.today, tasksIn({ kind: "lists", lists: ["now", "soon"] }, { place: "more" }, tasks));
		const input = JSON.parse(briefing.input);
		expect(input.today).toBe(TODAY);
		const offer = { title: "Write the offer", description: null, priority: "p1", due: null, time: "14:00", projects: ["Offers"], labels: [] };
		const bank = { title: "Call the bank", description: null, priority: null, due: "2026-11-20", time: null, projects: [], labels: [] };
		expect(input.candidates).toEqual([
			{ ref: "t1", title: "Find the template", list: "today", inProgress: false, priority: null, due: null, time: null, projects: ["Offers"], labels: [], description: null, goals: [offer], after: [] },
			{ ref: "t2", title: "Pay rent", list: "today", inProgress: false, priority: null, due: null, time: null, projects: ["Home"], labels: [], description: null, goals: [], after: [] },
			{ ref: "t3", title: "Find the contract", list: "soon", inProgress: false, priority: null, due: null, time: null, projects: [], labels: [], description: null, goals: [bank], after: [] },
			{ ref: "t4", title: "Read a book", list: "soon", inProgress: false, priority: null, due: null, time: null, projects: [], labels: ["Good fun"], description: null, goals: [], after: [] },
			{ ref: "t5", title: "Dentist", list: "soon", inProgress: false, priority: null, due: null, time: "2026-11-03T10:00", projects: [], labels: [], description: null, goals: [], after: [] },
		]);
	});

	it("maps each ref to the candidate's id", async () => {
		const tasks = await listed();
		const sent = tasksIn({ kind: "lists", lists: ["now"] }, { place: "more" }, tasks);
		const briefing = briefingOf(tasks.today, sent);
		expect(briefing.refs).toEqual({ t1: sent[0].subtasks[0].id, t2: sent[1].id });
	});

	it("survives JSON both ways: plain data", async () => {
		const tasks = await listed();
		const briefing = briefingOf(tasks.today, tasksIn({ kind: "all" }, { place: "more" }, tasks));
		expect(JSON.parse(JSON.stringify(briefing))).toEqual(briefing);
	});
});

describe("the scopes", () => {
	it("lists: the open tasks of the lists named, in their order; «soon» dated ones too", async () => {
		const tasks = await listed();
		expect(titles(tasksIn({ kind: "lists", lists: ["soon", "now"] }, { place: "more" }, tasks))).toEqual(["Call the bank", "Read a book", "Dentist", "Write the offer", "Pay rent"]);
	});

	it("all: every open task of Today, Soon, Inbox and Backlog", async () => {
		const tasks = await listed();
		expect(titles(tasksIn({ kind: "all" }, { place: "more" }, tasks))).toEqual(["Write the offer", "Pay rent", "Call the bank", "Read a book", "Dentist", "Sort the mail", "Learn Go"]);
	});

	it("project: the project's tasks with its subprojects'", async () => {
		const tasks = await listed();
		expect(titles(tasksIn({ kind: "project" }, { place: "project", projectId: "Job" }, tasks))).toEqual(["Write the offer", "Learn Go"]);
		expect(titles(tasksIn({ kind: "project" }, { place: "project", projectId: "Offers" }, tasks))).toEqual(["Write the offer"]);
	});

	it("target: the tasks pressed on, at any depth, with their open subtasks, closed ones left out", async () => {
		const tasks = await listed();
		const [offer] = tasks.lists.now;
		const closed = tasks.lists.done.find((item) => item.title === "Closed today")!;
		const step = offer.subtasks[0];
		const sent = tasksIn({ kind: "target" }, { place: "selection", taskIds: [step.id, closed.id, offer.id] }, tasks);
		expect(titles(sent)).toEqual(["Write the offer"]);
		const briefing = JSON.parse(briefingOf(tasks.today, sent).input);
		expect(titles(briefing.candidates)).toEqual(["Find the template"]);
		expect(titles(tasksIn({ kind: "target" }, { place: "task", taskIds: [step.id] }, tasks))).toEqual(["Find the template"]);
	});

	it("every button's places give what its scope reads", () => {
		for (const action of ASSISTANT_ACTIONS) for (const place of action.places) expect(SCOPE_NEEDS[action.scope.kind](targetOfPlace(place)), `${action.id} in ${place}`).toBe(true);
	});

	it("the check itself: a project scope pressed from «⋯» gets nothing it reads", () => {
		const scope: TaskScope = { kind: "project" };
		expect(SCOPE_NEEDS[scope.kind](targetOfPlace("more"))).toBe(false);
		expect(SCOPE_NEEDS.target(targetOfPlace("more"))).toBe(false);
		expect(SCOPE_NEEDS.target(targetOfPlace("task"))).toBe(true);
	});
});
