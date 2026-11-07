import { matchLines } from "../domain/LineMatch";
import { type LineIds, type OutlineLine, outlineOf, type TaskDocument } from "../domain/TaskDocument";

/** A heading or a task line of the text the ids are for, in file order: a task's with its id, a heading's null. */
export interface TaskIdLine {
	readonly raw: string;
	readonly id: string | null;
}

/**
 * Who each task of the tasks file is, as plain data: the headings and task lines of the text last read or written, each
 * task with its id, and where fresh ids go on from. The service keeps it while it runs; the door hands it to the host
 * and takes it back, as the undo steps.
 */
export interface TaskIdState {
	readonly next: number;
	readonly lines: readonly TaskIdLine[];
}

export const NO_TASK_IDS: TaskIdState = { next: 0, lines: [] };

/** How an undo step left the text: each line's line before it (null: put in), and the ids the step gave back by line. */
export interface CarriedLines {
	readonly origins: readonly (number | null)[];
	readonly ids: ReadonlyMap<number, string>;
}

/**
 * A task's identity through the life of a service: the ids of the tasks file's tasks. A write carries them by the lines
 * it made of which (`wrote`), an undo step by the lines it gave back (`carried`); a text changed elsewhere keeps the id of
 * every task line it left in place, and of a line edited in place, by an ordered diff of its headings and task lines, read
 * from the lines themselves: a text is parsed once, with its ids.
 */
export class TaskIdentity {
	private current: TaskIdState;
	private last: { readonly text: string; readonly ids: LineIds } | null = null;

	constructor(state: TaskIdState = NO_TASK_IDS) {
		this.current = state;
	}

	get state(): TaskIdState {
		return this.current;
	}

	/** The tags `text`'s lines are parsed with: the ids its tasks have, reconciled first when the ids are another text's. */
	of(text: string): LineIds {
		if (this.last?.text === text) return this.last.ids;
		const outline = outlineOf(text);
		const known = sameOutline(this.current.lines, outline) ? this.inOrder(outline) : this.reconciled(text, outline);
		return this.keep(text, known);
	}

	/** Every task's id in `text`, by its line. */
	idsOf(text: string): ReadonlyMap<number, string> {
		return this.of(text).known;
	}

	/** A write left `text`, the document `after`: its tasks are who its lines' tags say. */
	wrote(text: string, after: TaskDocument): void {
		const tags = after.lineTags();
		const known = new Map<number, string>();
		const lines = outlineOf(text).map(({ line, raw, task }) => {
			if (task) known.set(line, tags[line]);
			return { raw, id: task ? tags[line] : null };
		});
		this.current = { next: after.nextTag(), lines };
		this.last = { text, ids: { known, next: this.current.next } };
	}

	/** An undo step made `after` of `before`: a line it gave back is the task it was, a line it left is who it was. */
	carried(before: string, after: string, step: CarriedLines): void {
		const was = this.of(before).known;
		const next = this.current.next;
		const given = new Set(step.ids.values());
		const known = new Map<number, string>();
		const lines = outlineOf(after).map(({ line, raw, task }) => {
				if (!task) return { raw, id: null };
				const origin = step.origins[line];
				const kept = origin === null || origin === undefined ? undefined : was.get(origin);
				const own = step.ids.get(line) ?? (kept !== undefined && !given.has(kept) ? kept : `t${next + line}`);
				known.set(line, own);
				return { raw, id: own };
			});
		this.current = { next: next + after.split("\n").length, lines };
		this.last = { text: after, ids: { known, next: this.current.next } };
	}

	private inOrder(outline: readonly OutlineLine[]): Map<number, string> {
		const known = new Map<number, string>();
		outline.forEach((line, i) => {
			const id = this.current.lines[i].id;
			if (line.task && id !== null) known.set(line.line, id);
		});
		return known;
	}

	/** The ids of another text carried over to `text`'s task lines by place and line; a task line it added gets a new one. */
	private reconciled(text: string, outline: readonly OutlineLine[]): Map<number, string> {
		const old = this.current.lines;
		const pairs = matchLines(
			old.map((l) => l.raw),
			outline.map((l) => l.raw),
			(b, a) => (old[b].id !== null) === outline[a].task,
		);
		const known = new Map<number, string>();
		for (const [b, a] of pairs) if (old[b].id !== null && outline[a].task) known.set(outline[a].line, old[b].id!);
		const next = this.current.next;
		for (const line of outline) if (line.task && !known.has(line.line)) known.set(line.line, `t${next + line.line}`);
		this.current = { next: next + text.split("\n").length, lines: outline.map((l) => ({ raw: l.raw, id: l.task ? known.get(l.line)! : null })) };
		return known;
	}

	private keep(text: string, known: ReadonlyMap<number, string>): LineIds {
		const ids = { known, next: this.current.next };
		this.last = { text, ids };
		return ids;
	}
}

function sameOutline(lines: readonly TaskIdLine[], outline: readonly OutlineLine[]): boolean {
	return lines.length === outline.length && lines.every((line, i) => line.raw === outline[i].raw && (line.id !== null) === outline[i].task);
}
