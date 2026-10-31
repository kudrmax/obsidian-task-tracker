import type { SectionKey, Task } from "./Task";
import { formatTaskLine, parseTaskLine, type Markers } from "./TaskLine";

export interface SectionNamesOf {
	/** Left out by a reader Inbox means nothing to: the phone's reminders, Inbox tasks having no slot. */
	readonly inbox?: string;
	readonly now: string;
	readonly soon: string;
	readonly done: string;
}

export interface TaskEntry {
	readonly section: SectionKey;
	/** Among the tasks of the section: the task's own index, or that of the task a subtask belongs to. */
	readonly index: number;
	/** Indexes among the subtasks, from that task down to this one; empty for a task. */
	readonly path: readonly number[];
	readonly raw: string;
	readonly indent: string;
	readonly bullet: string;
	readonly task: Task;
	/** The task lines nested right under this one, in file order. */
	readonly subtasks: readonly TaskEntry[];
}

export type InsertPosition = number | "start" | "end";

interface Span {
	readonly line: number;
	readonly lineCount: number;
}

interface Place {
	readonly index: number;
	readonly path: readonly number[];
}

interface Section {
	readonly headingLine: number;
	readonly firstLine: number;
	readonly endLine: number;
}

const SECTION_KEYS: readonly SectionKey[] = ["inbox", "now", "soon", "done"];
const HEADING_RE = /^#{1,6}(\s|$)/;
const SECTION_HEADING_RE = /^##\s+(.*?)\s*$/;
const INDENT_RE = /^[ \t]*/;
const DEFAULT_INDENT_UNIT = "\t";

function indentWidth(line: string): number {
	return INDENT_RE.exec(line)![0].length;
}

function sameTask(a: Task, b: Task): boolean {
	return (
		a.status === b.status &&
		a.statusChar === b.statusChar &&
		a.text === b.text &&
		a.dueDate === b.dueDate &&
		a.priority === b.priority &&
		a.slot?.date === b.slot?.date &&
		a.slot?.start === b.slot?.start &&
		a.slot?.end === b.slot?.end &&
		a.children.length === b.children.length &&
		a.children.every((c, i) => c === b.children[i])
	);
}

function contains(entry: TaskEntry, other: TaskEntry): boolean {
	return entry.section === other.section && entry.index === other.index && entry.path.every((i, k) => other.path[k] === i) && other.path.length >= entry.path.length;
}

/** The lines of an entry under another indent: its own line and the deeper ones keep their depth below it. */
function reindented(lines: readonly string[], from: string, to: string): string[] {
	if (from === to) return [...lines];
	return lines.map((line) => (line.startsWith(from) ? to + line.slice(from.length) : line));
}

export class TaskDocument {
	private readonly sections: ReadonlyMap<SectionKey, Section>;
	private readonly entries: ReadonlyMap<SectionKey, readonly TaskEntry[]>;
	private readonly spans: ReadonlyMap<TaskEntry, Span>;

	private constructor(
		private readonly lines: readonly string[],
		private readonly eol: string,
		private readonly trailingEol: boolean,
		private readonly names: SectionNamesOf,
		private readonly markers: Markers,
	) {
		this.sections = this.findSections();
		const entries = new Map<SectionKey, TaskEntry[]>();
		const spans = new Map<TaskEntry, Span>();
		for (const [key, section] of this.sections) {
			entries.set(key, this.readTasks(key, section, spans));
		}
		this.entries = entries;
		this.spans = spans;
	}

	static parse(text: string, sections: SectionNamesOf, markers: Markers): TaskDocument {
		const eol = text.includes("\r\n") ? "\r\n" : "\n";
		const trailingEol = text.endsWith(eol);
		const body = trailingEol ? text.slice(0, -eol.length) : text;
		const lines = body === "" && text === "" ? [] : body.split(eol);
		return new TaskDocument(lines, eol, trailingEol, sections, markers);
	}

	static empty(all: readonly string[]): string {
		return TaskDocument.parse("", { inbox: "", now: "", soon: "", done: "" }, { dueDate: "", slot: "" })
			.ensureSections(all)
			.serialize();
	}

	serialize(): string {
		return this.lines.join(this.eol) + (this.trailingEol ? this.eol : "");
	}

	hasSection(section: SectionKey): boolean {
		return this.sections.has(section);
	}

	tasks(section: SectionKey): readonly TaskEntry[] {
		return this.entries.get(section) ?? [];
	}

	/** The task or subtask at that place, if there is one. */
	find(section: SectionKey, index: number, path: readonly number[]): TaskEntry | undefined {
		let entry: TaskEntry | undefined = this.tasks(section)[index];
		for (const i of path) entry = entry?.subtasks[i];
		return entry;
	}

	allTasks(): readonly TaskEntry[] {
		return SECTION_KEYS.flatMap((key) => this.tasks(key));
	}

	insert(section: SectionKey, position: InsertPosition, task: Task): TaskDocument {
		const line = this.insertionLine(section, position);
		return this.withLines(this.splice(line, 0, this.linesOf("", "-", task)));
	}

	replace(entry: TaskEntry, task: Task): TaskDocument {
		const span = this.spanOf(entry);
		if (sameTask(entry.task, task)) return this;
		return this.withLines(this.splice(span.line, span.lineCount, this.linesOf(entry.indent, entry.bullet, task)));
	}

	removeEntry(entry: TaskEntry): TaskDocument {
		const span = this.spanOf(entry);
		return this.withLines(this.splice(span.line, span.lineCount, []));
	}

	/** A subtask moved here leaves its task and becomes a task of `section`. */
	moveEntry(entry: TaskEntry, section: SectionKey, position: InsertPosition): TaskDocument {
		const span = this.spanOf(entry);
		const moved = reindented(this.lines.slice(span.line, span.line + span.lineCount), entry.indent, "");
		const without = this.withLines(this.splice(span.line, span.lineCount, []));
		const target = without.insertionLine(section, this.positionAfterRemoval(entry, section, position));
		return without.withLines(without.splice(target, 0, moved));
	}

	/** Puts the entry with its subtasks among `parent`'s subtasks, right before `before` (one of them) or last. */
	nestEntry(entry: TaskEntry, parent: TaskEntry, before: TaskEntry | null): TaskDocument {
		if (contains(entry, parent)) throw new Error(`A task cannot go under itself: ${entry.raw}`);
		const span = this.spanOf(entry);
		const target = before ? this.spanOf(before).line : this.endOf(parent);
		const moved = reindented(this.lines.slice(span.line, span.line + span.lineCount), entry.indent, this.childIndent(parent));
		const without = this.splice(span.line, span.lineCount, []);
		without.splice(target > span.line ? target - span.lineCount : target, 0, ...moved);
		return this.withLines(without);
	}

	/** A new last subtask of `parent`. */
	insertUnder(parent: TaskEntry, task: Task): TaskDocument {
		return this.withLines(this.splice(this.endOf(parent), 0, this.linesOf(this.childIndent(parent), parent.bullet, task)));
	}

	ensureSections(all: readonly string[]): TaskDocument {
		const present = new Set(this.headingNames());
		const missing = all.filter((name) => !present.has(name));
		if (missing.length === 0) return this;
		const lines = [...this.lines];
		for (const name of missing) {
			if (lines.length > 0 && lines[lines.length - 1] !== "") lines.push("");
			lines.push(`## ${name}`);
		}
		return new TaskDocument(lines, this.eol, true, this.names, this.markers);
	}

	private withLines(lines: readonly string[]): TaskDocument {
		return new TaskDocument(lines, this.eol, this.trailingEol, this.names, this.markers);
	}

	private splice(start: number, deleteCount: number, insert: readonly string[]): string[] {
		const lines = [...this.lines];
		lines.splice(start, deleteCount, ...insert);
		return lines;
	}

	private linesOf(indent: string, bullet: string, task: Task): string[] {
		return [formatTaskLine({ indent, bullet, task }, this.markers), ...task.children];
	}

	private spanOf(entry: TaskEntry): Span {
		const own = this.find(entry.section, entry.index, entry.path);
		const span = own && own.raw === entry.raw ? this.spans.get(own) : undefined;
		if (!span) throw new Error(`Task not found in the document: ${entry.section}[${entry.index}]${entry.path.map((i) => `[${i}]`).join("")} ${entry.raw}`);
		return span;
	}

	private endOf(entry: TaskEntry): number {
		const span = this.spanOf(entry);
		return span.line + span.lineCount;
	}

	/** The indent of `parent`'s subtasks: the one they have, else one level deeper by the file's own step. */
	private childIndent(parent: TaskEntry): string {
		return parent.subtasks[0]?.indent ?? parent.indent + this.indentUnit();
	}

	private indentUnit(): string {
		const step = (entry: TaskEntry): string | null => {
			for (const sub of entry.subtasks) {
				if (sub.indent.startsWith(entry.indent) && sub.indent.length > entry.indent.length) return sub.indent.slice(entry.indent.length);
				const deeper = step(sub);
				if (deeper) return deeper;
			}
			return null;
		};
		for (const entry of this.allTasks()) {
			const unit = step(entry);
			if (unit) return unit;
		}
		return DEFAULT_INDENT_UNIT;
	}

	private positionAfterRemoval(entry: TaskEntry, section: SectionKey, position: InsertPosition): InsertPosition {
		if (typeof position !== "number" || entry.path.length > 0 || section !== entry.section || position <= entry.index) return position;
		return position - 1;
	}

	private insertionLine(section: SectionKey, position: InsertPosition): number {
		const s = this.sections.get(section);
		if (!s) throw new Error(`Section missing: ${this.names[section]}`);
		const tasks = this.tasks(section);
		if (tasks.length === 0) return s.firstLine;
		const index = position === "start" ? 0 : position === "end" ? tasks.length : position;
		if (index >= tasks.length) {
			const last = this.spans.get(tasks[tasks.length - 1])!;
			return last.line + last.lineCount;
		}
		return this.spans.get(tasks[Math.max(0, index)])!.line;
	}

	private headingNames(): string[] {
		const names: string[] = [];
		for (const line of this.lines) {
			const m = SECTION_HEADING_RE.exec(line);
			if (m) names.push(m[1]);
		}
		return names;
	}

	private findSections(): Map<SectionKey, Section> {
		const found = new Map<SectionKey, Section>();
		this.lines.forEach((line, i) => {
			const m = SECTION_HEADING_RE.exec(line);
			if (!m) return;
			const key = SECTION_KEYS.find((k) => this.names[k] === m[1] && !found.has(k));
			if (key) found.set(key, { headingLine: i, firstLine: i + 1, endLine: this.sectionEnd(i + 1) });
		});
		return found;
	}

	private sectionEnd(from: number): number {
		for (let i = from; i < this.lines.length; i++) {
			if (HEADING_RE.test(this.lines[i])) return i;
		}
		return this.lines.length;
	}

	private readTasks(key: SectionKey, section: Section, spans: Map<TaskEntry, Span>): TaskEntry[] {
		return this.readLevel(key, section.firstLine, section.endLine, null, spans);
	}

	/** The task lines from `from` to `end` that no task line above them in that range holds, each with its own subtasks. */
	private readLevel(section: SectionKey, from: number, end: number, parent: Place | null, spans: Map<TaskEntry, Span>): TaskEntry[] {
		const entries: TaskEntry[] = [];
		let i = from;
		while (i < end) {
			const raw = this.lines[i];
			const parsed = parseTaskLine(raw, this.markers);
			if (!parsed) {
				i++;
				continue;
			}
			const children = this.childrenOf(i, end, parsed.indent.length);
			const place: Place = parent ? { index: parent.index, path: [...parent.path, entries.length] } : { index: entries.length, path: [] };
			const subtasks = this.readLevel(section, i + 1, i + 1 + children.length, place, spans);
			const entry: TaskEntry = { section, ...place, raw, indent: parsed.indent, bullet: parsed.bullet, task: { ...parsed.task, children }, subtasks };
			entries.push(entry);
			spans.set(entry, { line: i, lineCount: 1 + children.length });
			i += 1 + children.length;
		}
		return entries;
	}

	private childrenOf(taskLine: number, endLine: number, indent: number): string[] {
		const children: string[] = [];
		for (let i = taskLine + 1; i < endLine; i++) {
			const line = this.lines[i];
			if (line.trim() === "" || indentWidth(line) <= indent) break;
			children.push(line);
		}
		return children;
	}
}
