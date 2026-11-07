import { matchLines } from "../domain/LineMatch";
import { type LineIds, type OutlineLine, outlineOf, type TaskDocument } from "../domain/TaskDocument";

/** A heading or a task line of the text the ids are for, in file order, with its id. */
export interface TaskIdLine {
	readonly raw: string;
	/** A task line; else a heading (a list's or a section's). */
	readonly task: boolean;
	readonly id: string;
}

/**
 * Who each task and section of the tasks file is, as plain data: the headings and task lines of the text last read or
 * written, each with its id, and where fresh ids go on from. The service keeps it while it runs; the door hands it to
 * the host and takes it back, as the undo steps.
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
 * The identity of the tasks file's tasks and sections through the life of a service: the ids of its task lines and
 * headings. A write carries them by the lines it made of which (`wrote`), an undo step by the lines it gave back
 * (`carried`); a text changed elsewhere keeps the id of every such line it left in place, and of a line edited in place,
 * by an ordered diff of its headings and task lines, read from the lines themselves: a text is parsed once, with its ids.
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

	/** The tags `text`'s lines are parsed with: the ids its tasks and headings have, reconciled first when the ids are another text's. */
	of(text: string): LineIds {
		if (this.last?.text === text) return this.last.ids;
		const outline = outlineOf(text);
		const known = sameOutline(this.current.lines, outline) ? this.inOrder(outline) : this.reconciled(text, outline);
		return this.keep(text, known);
	}

	/** Every task's and heading's id in `text`, by its line. */
	idsOf(text: string): ReadonlyMap<number, string> {
		return this.of(text).known;
	}

	/** A write left `text`, the document `after`: its tasks and headings are who its lines' tags say. */
	wrote(text: string, after: TaskDocument): void {
		const tags = after.lineTags();
		this.commit(text, after.nextTag(), outlineOf(text).map((line) => ({ ...line, id: tags[line.line] })));
	}

	/** An undo step made `after` of `before`: a line it gave back is who it was, a line it left is who it was. */
	carried(before: string, after: string, step: CarriedLines): void {
		const was = this.of(before).known;
		const next = this.current.next;
		const given = new Set(step.ids.values());
		const lines = outlineOf(after).map((line) => {
			const origin = step.origins[line.line];
			const kept = origin === null || origin === undefined ? undefined : was.get(origin);
			return { ...line, id: step.ids.get(line.line) ?? (kept !== undefined && !given.has(kept) ? kept : `t${next + line.line}`) };
		});
		this.commit(after, next + after.split("\n").length, lines);
	}

	private inOrder(outline: readonly OutlineLine[]): Map<number, string> {
		return new Map(outline.map((line, i) => [line.line, this.current.lines[i].id]));
	}

	/** The ids of another text carried over to `text`'s lines by place and line; a line it added gets a new one. */
	private reconciled(text: string, outline: readonly OutlineLine[]): Map<number, string> {
		const old = this.current.lines;
		const pairs = matchLines(
			old.map((l) => l.raw),
			outline.map((l) => l.raw),
			(b, a) => old[b].task === outline[a].task,
		);
		const known = new Map<number, string>();
		for (const [b, a] of pairs) if (old[b].task === outline[a].task) known.set(outline[a].line, old[b].id);
		const next = this.current.next;
		for (const line of outline) if (!known.has(line.line)) known.set(line.line, `t${next + line.line}`);
		this.current = { next: next + text.split("\n").length, lines: outline.map((l) => ({ raw: l.raw, task: l.task, id: known.get(l.line)! })) };
		return known;
	}

	private commit(text: string, next: number, lines: readonly (OutlineLine & { readonly id: string })[]): void {
		this.current = { next, lines: lines.map(({ raw, task, id }) => ({ raw, task, id })) };
		this.last = { text, ids: { known: new Map(lines.map((l) => [l.line, l.id])), next } };
	}

	private keep(text: string, known: ReadonlyMap<number, string>): LineIds {
		const ids = { known, next: this.current.next };
		this.last = { text, ids };
		return ids;
	}
}

function sameOutline(lines: readonly TaskIdLine[], outline: readonly OutlineLine[]): boolean {
	return lines.length === outline.length && lines.every((line, i) => line.raw === outline[i].raw && line.task === outline[i].task);
}
