import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bestTask } from "../../../core/application/assistant/actions/bestTask";
import { briefingOf, candidatesOf } from "../../../core/application/assistant/briefing";
import { tasksIn } from "../../../core/application/assistant/scope";
import { TaskLookup } from "../../../core/application/assistant/tasks";
import type { TaskItem } from "../../../core/application/contracts";
import type { TaskServiceImpl } from "../../../core/application/TaskServiceImpl";
import { rig, settle } from "./assistantFakes";

/** A plan like Max's: a folded goal whose first step has steps of its own, an unfolded goal with a folded step, a plain task. */
const PLAN = [
	"## Inbox",
	"",
	"## Projects",
	"",
	"- Life",
	"",
	"## Now",
	"",
	"- [ ] Pay rent",
	"",
	"## Soon",
	"",
	"- [ ] p1 Move to Belgrade 🗂️ Life 📁",
	"\t- Start in January, before the lease ends",
	"\t- [x] Ask the landlord",
	"\t- [ ] Find a flat",
	"\t\t- [ ] Pick districts",
	"\t\t\t- near the river",
	"\t\t- [ ] Write to agents",
	"\t\t\t- two or three, by phone",
	"\t- [ ] Buy tickets",
	"\t\t- [ ] Compare prices",
	"- [ ] Learn Serbian",
	"\t- [ ] Find a teacher 📁",
	"\t\t- [ ] Ask friends",
	"\t\t- [ ] Book a trial",
	"\t- [ ] Buy a book",
	"",
	"## Backlog",
	"",
	"## Done",
	"",
].join("\n");

async function planned() {
	const { tasks } = rig({ text: PLAN });
	const listed = await tasks.listed();
	return { listed, sent: tasksIn({ kind: "columns", columns: ["today", "soon"] }, { place: "more" }, listed) };
}

async function input() {
	const { listed, sent } = await planned();
	return JSON.parse(briefingOf("candidates", listed.today, sent).input);
}

describe("what Best task chooses among: what Max can start now", () => {
	it("a plain task is itself; a folded task gives only its next step, the one its card shows; an unfolded one its open subtasks by the same rules", async () => {
		const { sent } = await planned();
		expect(candidatesOf(sent).map((c) => c.item.title)).toEqual(["Pay rent", "Pick districts", "Ask friends", "Buy a book"]);
		const belgrade = sent.find((t) => t.title === "Move to Belgrade")!;
		expect(candidatesOf(sent)[1].item.id).toBe(belgrade.card.step!.id);
	});

	it("a task met twice is one candidate", async () => {
		const { sent } = await planned();
		expect(candidatesOf([...sent, ...sent]).map((c) => c.item.title)).toEqual(["Pay rent", "Pick districts", "Ask friends", "Buy a book"]);
	});

	it("refs name the candidates only, in the order sent; goals and later steps have none", async () => {
		const { listed, sent } = await planned();
		const briefing = briefingOf("candidates", listed.today, sent);
		const lookup = new TaskLookup(listed);
		expect(Object.keys(briefing.refs)).toEqual(["t1", "t2", "t3", "t4"]);
		expect(Object.values(briefing.refs).map((id) => lookup.find(id)!.title)).toEqual(["Pay rent", "Pick districts", "Ask friends", "Buy a book"]);
		expect(JSON.parse(briefing.input).tasks).toBeUndefined();
	});

	it("a folded task's step: its goals top first, with their words; the steps after it in that branch, depth first (a later sibling with its own subtasks), each with its description", async () => {
		const [, districts] = (await input()).candidates;
		expect(districts).toEqual({
			ref: "t2",
			title: "Pick districts",
			list: "soon",
			inProgress: false,
			priority: null,
			due: null,
			time: null,
			projects: ["Life"],
			labels: [],
			description: "- near the river",
			goals: [
				{ title: "Move to Belgrade", description: "- Start in January, before the lease ends", priority: "p1", due: null, time: null, projects: ["Life"], labels: [] },
				{ title: "Find a flat", description: null, priority: null, due: null, time: null, projects: ["Life"], labels: [] },
			],
			after: [
				{ title: "Write to agents", description: "- two or three, by phone" },
				{ title: "Buy tickets", description: null },
				{ title: "Compare prices", description: null },
			],
		});
	});

	it("an unfolded goal with a folded step: the step of the folded one, both goals above it; a plain subtask: its goal, nothing after", async () => {
		const [, , friends, book] = (await input()).candidates;
		expect(friends.goals.map((g: { title: string }) => g.title)).toEqual(["Learn Serbian", "Find a teacher"]);
		expect(friends.after).toEqual([{ title: "Book a trial", description: null }]);
		expect(book.goals.map((g: { title: string }) => g.title)).toEqual(["Learn Serbian"]);
		expect(book.after).toEqual([]);
	});

	it("a plain task: no goals, nothing after, its own description", async () => {
		const [rent] = (await input()).candidates;
		expect(rent).toMatchObject({ ref: "t1", title: "Pay rent", list: "today", description: null, goals: [], after: [] });
	});
});

describe("Best task's answer", () => {
	async function answered(answer: (refOf: (title: string) => string, goalId: string) => unknown, during: (tasks: TaskServiceImpl, belgrade: TaskItem) => Promise<void> = async () => undefined) {
		const { assistant, transport, tasks } = rig({ text: PLAN });
		const outcome = assistant.press("bestTask");
		await settle();
		await during(tasks, (await tasks.listed()).lists.soon.find((t) => t.title === "Move to Belgrade")!);
		const listed = await tasks.listed();
		const goal = listed.lists.soon.find((t) => t.title === "Move to Belgrade")!;
		const refOf = (title: string) => (JSON.parse(transport.asked[0].question.input).candidates as { ref: string; title: string }[]).find((c) => c.title === title)!.ref;
		transport.answer(answer(refOf, goal.id));
		return { result: await outcome, listed };
	}

	it("a goal named (its id, never a ref) is a bad answer, never swapped for its step", async () => {
		const { result } = await answered((_, goalId) => ({ taskRef: goalId, reason: "The plan." }));
		expect(result).toMatchObject({ kind: "failed", words: "Claude's answer didn't name one of the tasks. Try again." });
	});

	it("a folded task's step is drawn on that folded task's two-line card", async () => {
		const { result, listed } = await answered((refOf) => ({ taskRef: refOf("Pick districts"), reason: "Five minutes." }));
		const belgrade = listed.lists.soon.find((t) => t.title === "Move to Belgrade")!;
		expect(result.kind === "task" && result.task.id).toBe(belgrade.id);
		expect(result.kind === "task" && { ...result.card, step: result.card.step?.title }).toEqual({ text: "Pick districts", title: "Pick districts", over: "Move to Belgrade", step: "Pick districts" });
	});

	it("a step of an unfolded goal's folded subtask is drawn on that subtask's card", async () => {
		const { result } = await answered((refOf) => ({ taskRef: refOf("Ask friends"), reason: "Easy." }));
		expect(result.kind === "task" && [result.task.title, result.card.over, result.card.title]).toEqual(["Find a teacher", "Find a teacher", "Ask friends"]);
	});

	it("any other subtask on its own card, its task's title small above", async () => {
		const { result } = await answered((refOf) => ({ taskRef: refOf("Buy a book"), reason: "Cheap." }));
		expect(result.kind === "task" && [result.task.title, result.card]).toEqual(["Buy a book", { text: "Buy a book", title: "Buy a book", over: "Learn Serbian", step: null }]);
	});

	it("a step closed during the wait is gone", async () => {
		const { result } = await answered(
			(refOf) => ({ taskRef: refOf("Pick districts"), reason: "Five minutes." }),
			(tasks, belgrade) => tasks.setStatus(belgrade.card.step!.key, "done"),
		);
		expect(result).toMatchObject({ kind: "failed", words: "That task was closed while Claude was thinking." });
	});

	it("a fold changed during the wait draws the step as the screen draws it now: on its own card, its task's title above", async () => {
		const { result } = await answered(
			(refOf) => ({ taskRef: refOf("Pick districts"), reason: "Five minutes." }),
			(tasks, belgrade) => tasks.setCollapsed(belgrade.key, false),
		);
		expect(result.kind === "task" && [result.task.title, result.card]).toEqual(["Pick districts", { text: "Pick districts", title: "Pick districts", over: "Find a flat", step: null }]);
	});

	it("a top task alone", async () => {
		const { result } = await answered((refOf) => ({ taskRef: refOf("Pay rent"), reason: "Due." }));
		expect(result.kind === "task" && [result.task.title, result.card]).toEqual(["Pay rent", { text: "Pay rent", title: "Pay rent", over: null, step: null }]);
	});
});

describe("Best task's prompt", () => {
	it("is the spec's default prompt, word for word", () => {
		const spec = readFileSync(new URL("../../../docs/superpowers/specs/2026-11-16-assistant-design.md", import.meta.url), "utf8");
		const quoted = spec.split("- default prompt:\n\n")[1].split("\n\n")[0].split("\n").map((line) => line.replace(/^> /, "")).join(" ");
		expect(bestTask.defaultPrompt).toBe(quoted);
	});
});
