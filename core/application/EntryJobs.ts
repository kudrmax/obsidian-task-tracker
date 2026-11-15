import type { TaskItem } from "./contracts";
import type { EntryCall, EntryJob } from "./QuickEntry";

/**
 * What a quick entry's job asks next of its host. `door`: call the door's `method` with `args`; an `entry.*` method takes
 * the session and the look before them (`QuickEntry`), and `coming` adds, last, the cards each list is about to draw
 * once the write before is in them. `fresh`: before this step the lists must show every write before it (a host whose
 * views are drawn from its replica at once has nothing to wait for). `renamed`: a rename was written; `now` is the task
 * as the file now has it (the plugin keeps it open on the full screen).
 */
export type EntryJobStep =
	| { readonly kind: "door"; readonly method: string; readonly args: readonly unknown[]; readonly coming?: true; readonly fresh?: true }
	| { readonly kind: "renamed"; readonly was: TaskItem; readonly now: TaskItem };

/** What the last step came to: a door call's answer (`ok` and its `result`), or nothing for a `renamed` step and the start. */
export type EntryJobOutcome = { readonly ok: true; readonly result: unknown } | { readonly ok: false } | null;

type Phase = "call" | "write" | "shown" | "renamed" | "unshown" | "done";

/** The jobs a host runs, as plain data: those queued, and the one under way with the step it is at. */
export interface EntryJobs {
	readonly queue: readonly EntryJob[];
	readonly running: { readonly job: EntryJob; readonly phase: Phase; readonly call?: EntryCall; readonly failed?: boolean } | null;
}

export const NO_ENTRY_JOBS: EntryJobs = { queue: [], running: null };

/** The service method a job's call writes by: a new task is created with its id. */
function writeMethod(call: EntryCall): string {
	return call.method === "createInPlace" ? "createWithId" : call.method;
}

/** The jobs with those an answer queued (`EntryAnswer.jobs`) after them, in order. */
export function queuedEntryJobs(jobs: EntryJobs, added: readonly EntryJob[]): EntryJobs {
	return added.length === 0 ? jobs : { ...jobs, queue: [...jobs.queue, ...added] };
}

/** The jobs an `entry.*` step's answer queued, as it answered them. */
function answeredJobs(outcome: EntryJobOutcome): readonly EntryJob[] {
	return outcome?.ok ? ((outcome.result as { jobs?: readonly EntryJob[] } | null)?.jobs ?? []) : [];
}

/**
 * The order a quick entry's jobs run in, one at a time: each job's call is read once the lists show every write before
 * it, then written; a new task is shown where it landed, a rename told; whatever happened, the job stops waiting
 * (`unshown`) and is done, and the next one starts. `outcome` is what the step `jobs` last asked came to. Answers the
 * jobs as they now stand and the step to take, null when none is left.
 */
export function entryJobStep(jobs: EntryJobs, outcome: EntryJobOutcome): { readonly jobs: EntryJobs; readonly step: EntryJobStep | null } {
	const running = jobs.running;
	if (running === null) {
		const [job, ...queue] = jobs.queue;
		if (!job) return { jobs, step: null };
		return { jobs: { queue, running: { job, phase: "call" } }, step: { kind: "door", method: "entry.call", args: [job.id], fresh: true } };
	}
	const { job } = running;
	const failed = running.failed === true || outcome?.ok === false;
	const queued = queuedEntryJobs(jobs, running.phase === "write" || running.phase === "renamed" ? [] : answeredJobs(outcome));
	const at = (phase: Phase, step: EntryJobStep, call?: EntryCall) => ({ jobs: { queue: queued.queue, running: { job, phase, ...(call && { call }), ...(failed && { failed }) } }, step });
	const unshown = (fresh = false) => at("unshown", { kind: "door", method: "entry.unshown", args: [job.id], ...(fresh && { fresh: true as const }) });
	switch (running.phase) {
		case "call": {
			if (failed) return unshown();
			const call = (outcome!.ok ? ((outcome!.result as { value: EntryCall | null }).value ?? null) : null) as EntryCall | null;
			if (call === null) return unshown(job.kind === "section");
			return at("write", { kind: "door", method: `tasks.${writeMethod(call)}`, args: call.args }, call);
		}
		case "write": {
			const call = running.call!;
			if (failed) return unshown();
			const result = (outcome as { result: unknown }).result;
			if (call.method === "createInPlace") return at("shown", { kind: "door", method: "entry.shown", args: [job.id, result ?? null], coming: true, fresh: true });
			if (call.method === "edit") return result && job.kind === "rename" ? at("renamed", { kind: "renamed", was: job.item, now: result as TaskItem }) : unshown();
			return unshown(true);
		}
		case "shown":
		case "renamed":
			return unshown();
		case "unshown":
			return at("done", { kind: "door", method: "entry.done", args: [job.id] });
		case "done":
			return entryJobStep({ queue: queued.queue, running: null }, null);
	}
}
