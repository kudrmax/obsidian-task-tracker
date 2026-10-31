import type { GroupName, SectionKey, Task } from "./Task";
import { formatTaskLine, parseTaskLine, type Markers } from "./TaskLine";

export interface SectionNamesOf {
	/** Left out by a reader Inbox means nothing to: the phone's reminders, Inbox tasks having no slot. */
	readonly inbox?: string;
	readonly now: string;
	readonly soon: string;
	readonly done: string;
	/** The heading of the tasks outside any section, when it is lower down; without it every `###` is a section. */
	readonly ungrouped?: string;
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
	/** The section of its list it sits in; a subtask's is its task's. */
	readonly group: GroupName;
	/** The task lines nested right under this one, in file order. */
	readonly subtasks: readonly TaskEntry[];
}

/** A block of a list: the tasks above its first `###`, or a `###` heading and what is under it, up to the next. */
export interface TaskGroup {
	/** Its place among the list's groups; 0 is always the block above the first heading. */
	readonly index: number;
	readonly name: GroupName;
	readonly heading: boolean;
	readonly entries: readonly TaskEntry[];
	/** Nothing under the heading but blank lines. */
	readonly blank: boolean;
}

/**
 * A number: right before that task of the list, in its group. "start" and "end": the ends of the tasks outside any
 * section. `endOf`: after the last task of that group, or right under its heading.
 */
export type InsertPosition = number | "start" | "end" | { readonly endOf: number };

/** The group the tasks outside any section are in: the ungrouped heading when the list has one, else the top block. */
export function ungroupedIndex(groups: readonly TaskGroup[]): number {
	for (let i = groups.length - 1; i > 0; i--) if (groups[i].name === null) return i;
	return 0;
}

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

interface Block {
	readonly name: GroupName;
	/** The `###` line; null for the top block. */
	readonly headingLine: number | null;
	/** The first line under the heading. */
	readonly start: number;
	readonly end: number;
}

const SECTION_KEYS: readonly SectionKey[] = ["inbox", "now", "soon", "done"];
const LIST_END_RE = /^#{1,2}(\s|$)/;
const GROUP_HEADING_RE = /^###\s+(.*?)\s*$/;
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
	private readonly groupLists: ReadonlyMap<SectionKey, readonly TaskGroup[]>;
	private readonly blockLists: ReadonlyMap<SectionKey, readonly Block[]>;

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
		const groups = new Map<SectionKey, TaskGroup[]>();
		const blocks = new Map<SectionKey, Block[]>();
		for (const [key, section] of this.sections) {
			const listBlocks = this.findBlocks(section);
			const listEntries: TaskEntry[] = [];
			groups.set(key, listBlocks.map((block, index) => this.readGroup(key, block, index, listEntries, spans)));
			entries.set(key, listEntries);
			blocks.set(key, listBlocks);
		}
		this.entries = entries;
		this.spans = spans;
		this.groupLists = groups;
		this.blockLists = blocks;
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

	/** The list's groups in file order, the top block first even when empty. Before normalization names may repeat. */
	groups(section: SectionKey): readonly TaskGroup[] {
		return this.groupLists.get(section) ?? [];
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

	/** An empty `### name` before group `before`; `before` equal to the number of groups puts it last. */
	addGroup(section: SectionKey, name: string, before: number): TaskDocument {
		if (before < 1) throw new Error("No group goes above the tasks outside any section");
		return this.withLines(this.splice(this.groupStartLine(section, before), 0, [`### ${name}`]));
	}

	/** Group `from` goes before group `before`. The top block moved down gets the heading of the tasks outside any section. */
	moveGroup(section: SectionKey, from: number, before: number): TaskDocument {
		if (before < 1) throw new Error("No group goes above the tasks outside any section");
		if (before === from || before === from + 1) return this;
		const block = this.blockOf(section, from);
		const content = this.contentOf(block);
		const core = this.lines.slice(block.headingLine ?? content.first, content.last);
		if (block.headingLine === null) core.unshift(`### ${this.ungroupedName()}`);
		const cut = this.cutOf(section, from);
		const apart = Array<string>(cut.to - cut.from - (content.last - (block.headingLine ?? content.first))).fill("");
		const last = before === this.blockLists.get(section)!.length;
		const moved = last ? [...apart, ...core] : [...core, ...apart];
		return this.withLines(this.cutAndInsert(cut, this.groupStartLine(section, before), moved));
	}

	renameGroup(section: SectionKey, index: number, name: string): TaskDocument {
		const line = this.blockOf(section, index).headingLine;
		if (line === null) throw new Error("The tasks outside any section have no heading");
		return this.withLines(this.splice(line, 1, [`### ${name}`]));
	}

	/** What group `from` holds goes to the start or the end of the tasks of group `into`; the heading of `from` goes. */
	mergeGroup(section: SectionKey, from: number, into: number, at: "start" | "end"): TaskDocument {
		if (from === into) throw new Error("A group merges into another one");
		const content = this.contentOf(this.blockOf(section, from));
		const moved = this.lines.slice(content.first, content.last);
		return this.withLines(this.cutAndInsert(this.cutOf(section, from), this.groupInsertionLine(section, into, at), moved));
	}

	/** A group with nothing but blank lines goes, its blank lines with it unless they part the list from the next one. */
	deleteGroup(section: SectionKey, index: number): TaskDocument {
		const group = this.groups(section)[index];
		const block = this.blockOf(section, index);
		if (!group?.blank || block.headingLine === null) throw new Error("Only an empty section is deleted");
		const cut = this.cutOf(section, index);
		return this.withLines(this.splice(cut.from, cut.to - cut.from, []));
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
		if (typeof position === "number") {
			const tasks = this.tasks(section);
			if (tasks.length === 0) return s.firstLine;
			if (position >= tasks.length) return this.lineAfter(tasks[tasks.length - 1]);
			return this.spans.get(tasks[Math.max(0, position)])!.line;
		}
		const groups = this.groups(section);
		const index = typeof position === "object" ? position.endOf : ungroupedIndex(groups);
		const group = groups[index];
		if (!group) throw new Error(`Group missing: ${this.names[section]}[${index}]`);
		const block = this.blockLists.get(section)![index];
		if (group.entries.length === 0) return block.start;
		if (position === "start") return this.spans.get(group.entries[0])!.line;
		return this.lineAfter(group.entries[group.entries.length - 1]);
	}

	private groupInsertionLine(section: SectionKey, index: number, at: "start" | "end"): number {
		const group = this.groups(section)[index];
		if (!group) throw new Error(`Group missing: ${this.names[section]}[${index}]`);
		if (group.entries.length === 0) return this.blockOf(section, index).start;
		return at === "start" ? this.spans.get(group.entries[0])!.line : this.lineAfter(group.entries[group.entries.length - 1]);
	}

	/** Where group `index` begins; the number of groups: after the list's last filled line. */
	private groupStartLine(section: SectionKey, index: number): number {
		const blocks = this.blockLists.get(section);
		if (!blocks) throw new Error(`Section missing: ${this.names[section]}`);
		if (index < blocks.length) return blocks[index].headingLine ?? blocks[index].start;
		const list = this.sections.get(section)!;
		let line = list.endLine;
		while (line > list.firstLine && this.lines[line - 1].trim() === "") line--;
		return line;
	}

	private blockOf(section: SectionKey, index: number): Block {
		const block = this.blockLists.get(section)?.[index];
		if (!block) throw new Error(`Group missing: ${this.names[section]}[${index}]`);
		return block;
	}

	/** A block's filled lines under its heading, from the first to past the last; empty, at its start, when all are blank. */
	private contentOf(block: Block): { first: number; last: number } {
		const first = this.firstFilled(block);
		if (first === block.end) return { first: block.start, last: block.start };
		return { first, last: this.lastFilled(block) };
	}

	/**
	 * The lines a block takes with it when it leaves: its heading, its lines and the blank lines under them. The last
	 * block of a list leaves its blank lines to part the list from the next one and takes those above it instead, so
	 * a block cut anywhere leaves the blank lines around it as they were.
	 */
	private cutOf(section: SectionKey, index: number): { from: number; to: number } {
		const block = this.blockOf(section, index);
		const content = this.contentOf(block);
		const start = block.headingLine ?? content.first;
		if (index < this.blockLists.get(section)!.length - 1) return { from: start, to: block.end };
		let from = start;
		const top = this.sections.get(section)!.firstLine;
		while (from > top && this.lines[from - 1].trim() === "") from--;
		return { from, to: Math.max(start, content.last) };
	}

	/** Removes the cut and puts `moved` in at `target`, a line of the document before the cut. */
	private cutAndInsert(cut: { from: number; to: number }, target: number, moved: readonly string[]): string[] {
		const size = cut.to - cut.from;
		const lines = this.splice(cut.from, size, []);
		lines.splice(target >= cut.to ? target - size : Math.min(target, cut.from), 0, ...moved);
		return lines;
	}

	/** The first line under the block's heading that is not blank; its end when there is none. */
	private firstFilled(block: Block): number {
		let line = block.start;
		while (line < block.end && this.lines[line].trim() === "") line++;
		return line;
	}

	/** Past the block's last line that is not blank: the blank lines after it stay where they are. */
	private lastFilled(block: Block): number {
		let line = block.end;
		while (line > block.start && this.lines[line - 1].trim() === "") line--;
		return line;
	}

	private ungroupedName(): string {
		if (this.names.ungrouped === undefined) throw new Error("No name for the tasks outside any section");
		return this.names.ungrouped;
	}

	private lineAfter(entry: TaskEntry): number {
		const span = this.spans.get(entry)!;
		return span.line + span.lineCount;
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
			if (LIST_END_RE.test(this.lines[i])) return i;
		}
		return this.lines.length;
	}

	private findBlocks(section: Section): Block[] {
		const blocks: Block[] = [];
		let name: GroupName = null;
		let headingLine: number | null = null;
		let start = section.firstLine;
		for (let i = section.firstLine; i <= section.endLine; i++) {
			const m = i < section.endLine ? GROUP_HEADING_RE.exec(this.lines[i]) : null;
			if (!m && i < section.endLine) continue;
			blocks.push({ name, headingLine, start, end: i });
			if (!m) break;
			name = m[1] === this.names.ungrouped ? null : m[1];
			headingLine = i;
			start = i + 1;
		}
		return blocks;
	}

	/** A block's tasks, numbered on from the tasks of the blocks above it in `entries`. */
	private readGroup(key: SectionKey, block: Block, index: number, entries: TaskEntry[], spans: Map<TaskEntry, Span>): TaskGroup {
		const blank = this.lines.slice(block.start, block.end).every((line) => line.trim() === "");
		const own = this.readLevel(key, block.start, block.end, null, block.name, entries.length, spans);
		entries.push(...own);
		return { index, name: block.name, heading: block.headingLine !== null, entries: own, blank };
	}

	/** The task lines from `from` to `end` that no task line above them in that range holds, each with its own subtasks. */
	private readLevel(section: SectionKey, from: number, end: number, parent: Place | null, group: GroupName, firstIndex: number, spans: Map<TaskEntry, Span>): TaskEntry[] {
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
			const place: Place = parent ? { index: parent.index, path: [...parent.path, entries.length] } : { index: firstIndex + entries.length, path: [] };
			const subtasks = this.readLevel(section, i + 1, i + 1 + children.length, place, group, 0, spans);
			const entry: TaskEntry = { section, ...place, raw, indent: parsed.indent, bullet: parsed.bullet, task: { ...parsed.task, children }, group, subtasks };
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
