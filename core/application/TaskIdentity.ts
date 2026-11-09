import { matchLines } from "../domain/LineMatch";
import type { LineIds, OutlineLine, TaskDocument } from "../domain/TaskDocument";

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
	/**
	 * The lines a task had before, the latest first, by id: rewritten by this identity's writes or edited in place
	 * elsewhere, a key read before still names its task. Left out: none.
	 */
	readonly held?: Readonly<Record<string, readonly string[]>>;
}

/** How many earlier lines of a task are kept: enough for the writes made while an earlier one is still being drawn. */
const HELD = 8;

export const NO_TASK_IDS: TaskIdState = { next: 0, lines: [] };

/** How an undo step left the text: each line's line before it (null: put in), and the ids the step gave back by line. */
export interface CarriedLines {
	readonly origins: readonly (number | null)[];
	readonly ids: ReadonlyMap<number, string>;
}

/**
 * The identity of the tasks file's tasks and sections through the life of a service: the ids of its task lines and
 * headings, kept for the file as read, tidied for today, which is what every screen shows and every write starts from.
 * A text is matched by its own reading: parsed, each line tagged by its line, and tidied, which carries the tags of the
 * lines it moves; so a file a host keeps untidied reads with the same ids every time. A write carries the ids by the
 * lines it made of which (`wrote`), an undo step by the lines it gave back (`carried`); a text changed elsewhere keeps
 * the id of every heading and task line it left in place, or edited in place, by an ordered diff of its reading.
 */
export class TaskIdentity {
	private current: TaskIdState;
	private last: { readonly text: string; readonly ids: LineIds } | null = null;
	/** The ids an undo step gave the lines of its text, by line, until that text is read. */
	private pending: { readonly text: string; readonly ids: ReadonlyMap<number, string> } | null = null;

	constructor(state: TaskIdState = NO_TASK_IDS) {
		this.current = state;
	}

	get state(): TaskIdState {
		return this.current;
	}

	/**
	 * What `text`'s reading is retagged by (`TaskDocument.retagged`): `read` gives it parsed and tidied, each line tagged by
	 * its line. Kept, with the ids of the reading's lines, until another text is read.
	 */
	of(text: string, read: () => TaskDocument): LineIds {
		if (this.last?.text === text) return this.last.ids;
		const doc = read();
		const outline = doc.outline();
		const next = this.current.next;
		const known = this.pending?.text === text ? this.given(outline, this.pending.ids) : sameOutline(this.current.lines, outline) ? this.inOrder(outline) : this.matched(outline);
		this.pending = null;
		const fresh = outline.some((o) => !known.has(o.tag));
		for (const o of outline) if (!known.has(o.tag)) known.set(o.tag, `t${next + o.tag}`);
		const settled = !fresh && sameOutline(this.current.lines, outline) && outline.every((o, i) => known.get(o.tag) === this.current.lines[i].id);
		if (!settled) this.settle(next + doc.nextTag(), outline.map((o) => ({ raw: o.raw, task: o.task, id: known.get(o.tag)! })));
		const ids = { known, next };
		this.last = { text, ids };
		return ids;
	}

	/** A write left `text`, the document `after`: its tasks and headings are who its lines' tags say. */
	wrote(text: string, after: TaskDocument): void {
		const tags = after.outlineTags();
		this.settle(after.nextTag(), after.outline().map((o) => ({ raw: o.raw, task: o.task, id: tags.get(o.line)! })));
		this.pending = null;
		this.last = { text, ids: { known: new Map([...tags].map(([line, tag]) => [line, tag])), next: this.current.next } };
	}

	/**
	 * An undo step made `after` of `before`: a line it gave back is who it was, a line it left is who it was. Known once
	 * `after` is read (`of`).
	 */
	carried(before: string, after: string, step: CarriedLines): void {
		const was = this.last?.text === before ? this.last.ids.known : this.pending?.text === before ? this.pending.ids : new Map<number, string>();
		const given = new Set(step.ids.values());
		const ids = new Map<number, string>();
		step.origins.forEach((origin, line) => {
			const own = step.ids.get(line) ?? (origin === null ? undefined : was.get(origin));
			if (own !== undefined && (step.ids.has(line) || !given.has(own))) ids.set(line, own);
		});
		this.pending = { text: after, ids };
		this.last = null;
	}

	/** Whether `raw` is a line the task `id` has, or had while this identity knew it. */
	held(id: string, raw: string): boolean {
		return this.current.lines.some((line) => line.id === id && line.raw === raw) || (this.current.held?.[id]?.includes(raw) ?? false);
	}

	/** The state for `lines`: a task whose line changed keeps the line it had among those it held. */
	private settle(next: number, lines: readonly TaskIdLine[]): void {
		const was = new Map(this.current.lines.filter((line) => line.task).map((line) => [line.id, line.raw]));
		const held: Record<string, readonly string[]> = {};
		for (const line of lines) {
			if (!line.task) continue;
			const before = was.get(line.id);
			const kept = this.current.held?.[line.id] ?? [];
			const all = before !== undefined && before !== line.raw ? [before, ...kept.filter((raw) => raw !== before)] : kept;
			if (all.length > 0) held[line.id] = all.slice(0, HELD);
		}
		this.current = { next, lines, ...(Object.keys(held).length > 0 && { held }) };
	}

	/** The ids of the reading's lines that an undo step gave its text's lines. */
	private given(outline: readonly OutlineLine[], ids: ReadonlyMap<number, string>): Map<number, string> {
		const known = new Map<number, string>();
		for (const o of outline) {
			const id = ids.get(o.tag);
			if (id !== undefined) known.set(o.tag, id);
		}
		return known;
	}

	private inOrder(outline: readonly OutlineLine[]): Map<number, string> {
		return new Map(outline.map((o, i) => [o.tag, this.current.lines[i].id]));
	}

	/** The ids of the reading the state is for, carried to this reading's lines by place and line. */
	/** The ids of the reading the state is for, carried to this reading's lines by place and line. */
	private matched(outline: readonly OutlineLine[]): Map<number, string> {
		const old = this.current.lines;
		const pairs = matchLines(
			old.map((l) => l.raw),
			outline.map((o) => o.raw),
			(b, a) => old[b].task === outline[a].task,
		);
		const known = new Map<number, string>();
		for (const [b, a] of pairs) if (old[b].task === outline[a].task) known.set(outline[a].tag, old[b].id);
		return known;
	}
}

function sameOutline(lines: readonly TaskIdLine[], outline: readonly OutlineLine[]): boolean {
	return lines.length === outline.length && lines.every((line, i) => line.raw === outline[i].raw && line.task === outline[i].task);
}
