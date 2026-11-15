import { describe, expect, it } from "vitest";
import type { ScreenView, TaskItem } from "../../core/application/contracts";
import { entryJobStep, type EntryJobOutcome, type EntryJobs, NO_ENTRY_JOBS, queuedEntryJobs } from "../../core/application/EntryJobs";
import { callDoor, type DoorContext, type EntryAnswer, type WireLook } from "../../core/application/PhoneCalls";
import type { EntryJob, EntrySession } from "../../core/application/QuickEntry";

/**
 * The quick entry's job order as a step function: a host that calls the door in its own serial dispatch runs the jobs
 * Enter queues in the order the plugin's QuickEntrySession runs them, with no service to wait on.
 */

const NOW = new Date(2026, 10, 15, 9, 30).getTime();
const DAY = "2026-11-15";
const FILE = ["## Inbox", "", "- [ ] Idea", "", "## Now", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n");

/** A host as the plugin's runtime will be: one replica, the door called in order, each answer kept. */
class Host {
	context: DoorContext;
	session: EntrySession | null = null;
	jobs: EntryJobs = NO_ENTRY_JOBS;
	readonly steps: string[] = [];
	readonly renamed: { was: string; now: string }[] = [];

	constructor(tasks: string) {
		this.context = { tasks, nowMs: NOW };
	}

	screen(): ScreenView {
		const answer = callDoor("tasks.screen", [DAY], this.context);
		if (!answer.ok) throw new Error(answer.error.message);
		this.keep(answer);
		return answer.result as ScreenView;
	}

	look(): WireLook {
		const inbox = this.screen().inbox;
		return { cards: { inbox: inbox.map((i: TaskItem) => ({ key: i.key, id: i.id, level: 0, group: null })) }, day: DAY, shown: ["inbox"] };
	}

	entry(method: string, ...args: unknown[]): EntryAnswer {
		const answer = callDoor(`entry.${method}`, [this.session, this.look(), ...args], this.context);
		if (!answer.ok) throw new Error(answer.error.message);
		const entry = answer.result as EntryAnswer;
		this.session = entry.session;
		this.jobs = queuedEntryJobs(this.jobs, entry.jobs);
		return entry;
	}

	/** Every job queued so far, run to the end inside this one call: no waiting. */
	runJobs(): void {
		let outcome: EntryJobOutcome = null;
		for (;;) {
			const { jobs, step } = entryJobStep(this.jobs, outcome);
			this.jobs = jobs;
			if (step === null) return;
			if (step.kind === "renamed") {
				this.steps.push("renamed");
				this.renamed.push({ was: step.was.title, now: step.now.title });
				outcome = null;
				continue;
			}
			this.steps.push(step.method);
			const entry = step.method.startsWith("entry.");
			const coming = step.coming ? [{ inbox: this.look().cards.inbox }] : [];
			const answer = callDoor(step.method, entry ? [this.session, this.look(), ...step.args, ...coming] : [...step.args], this.context);
			if (answer.ok) {
				this.keep(answer);
				if (entry) this.session = (answer.result as EntryAnswer).session;
				outcome = { ok: true, result: answer.result };
			} else outcome = { ok: false };
		}
	}

	private keep(answer: Extract<ReturnType<typeof callDoor>, { ok: true }>): void {
		this.context = { ...this.context, ...(answer.tasks !== undefined && { tasks: answer.tasks }), ...(answer.ids !== undefined && { ids: answer.ids }), ...(answer.history !== undefined && { history: answer.history }) };
	}
}

describe("entryJobStep: the quick entry's jobs, run by a host of the door", () => {
	it("writes two tasks entered one after the other in order, each shown where it landed, and leaves no job", () => {
		const host = new Host(FILE);
		host.entry("openAtEnd", "inbox");
		host.entry("type", "First");
		host.entry("enter");
		host.entry("type", "Second");
		host.entry("enter");
		expect(host.jobs.queue).toHaveLength(2);
		host.runJobs();
		expect(host.context.tasks).toContain("- [ ] Idea\n- [ ] First\n- [ ] Second\n");
		const job = ["entry.call", "tasks.createWithId", "entry.shown", "entry.unshown", "entry.done"];
		expect(host.steps).toEqual([...job, ...job]);
		expect(host.session!.jobs).toEqual([]);
		expect(host.jobs).toEqual(NO_ENTRY_JOBS);
	});

	it("renames a task, telling the host the task as it now stands", () => {
		const host = new Host(FILE);
		const idea = host.screen().inbox[0];
		host.entry("open", host.entry("renameSpot", idea, false).value, idea);
		host.entry("type", "Idea, renamed");
		host.entry("enter");
		host.runJobs();
		expect(host.context.tasks).toContain("- [ ] Idea, renamed\n");
		expect(host.steps).toEqual(["entry.call", "tasks.edit", "renamed", "entry.unshown", "entry.done"]);
		expect(host.renamed).toEqual([{ was: "Idea", now: "Idea, renamed" }]);
	});

	it("ends a job whose write fails, and runs the next: the task renamed is gone from the file meanwhile", () => {
		const host = new Host(FILE);
		const idea = host.screen().inbox[0];
		host.entry("open", host.entry("renameSpot", idea, false).value, idea);
		host.entry("type", "Idea, renamed");
		host.entry("enter");
		host.entry("openAtEnd", "inbox");
		host.entry("type", "After");
		host.entry("enter");
		host.context = { ...host.context, tasks: host.context.tasks!.replace("- [ ] Idea\n", "") };
		host.runJobs();
		expect(host.steps).toEqual(["entry.call", "tasks.edit", "entry.unshown", "entry.done", "entry.call", "tasks.createWithId", "entry.shown", "entry.unshown", "entry.done"]);
		expect(host.context.tasks).toContain("- [ ] After\n");
		expect(host.session!.jobs).toEqual([]);
	});

	it("asks for nothing with no job queued", () => {
		expect(entryJobStep(NO_ENTRY_JOBS, null)).toEqual({ jobs: NO_ENTRY_JOBS, step: null });
	});

	it("waits for the lists before reading a job's call and before showing a new task, and after a section or an unfold", () => {
		const create = { id: "j1", kind: "create", run: "r1", line: {} } as unknown as EntryJob;
		let jobs: EntryJobs = queuedEntryJobs(NO_ENTRY_JOBS, [create]);
		const first = entryJobStep(jobs, null);
		expect(first.step).toEqual({ kind: "door", method: "entry.call", args: ["j1"], fresh: true });
		jobs = first.jobs;
		const call = { method: "createSection", args: ["Errands", { kind: "list", list: "inbox", group: null, before: null }] };
		const write = entryJobStep(jobs, { ok: true, result: { value: call, jobs: [] } });
		expect(write.step).toEqual({ kind: "door", method: "tasks.createSection", args: call.args });
		expect(entryJobStep(write.jobs, { ok: true, result: null }).step).toEqual({ kind: "door", method: "entry.unshown", args: ["j1"], fresh: true });
	});
});
