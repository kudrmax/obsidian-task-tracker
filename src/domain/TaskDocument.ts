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
	readonly index: number;
	readonly raw: string;
	readonly indent: string;
	readonly bullet: string;
	readonly task: Task;
	readonly group: GroupName;
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

	moveEntry(entry: TaskEntry, section: SectionKey, position: InsertPosition): TaskDocument {
		const span = this.spanOf(entry);
		const moved = this.lines.slice(span.line, span.line + span.lineCount);
		const without = this.withLines(this.splice(span.line, span.lineCount, []));
		const target = without.insertionLine(section, this.positionAfterRemoval(entry, section, position));
		return without.withLines(without.splice(target, 0, moved));
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
		const own = this.tasks(entry.section)[entry.index];
		const span = own && own.raw === entry.raw ? this.spans.get(own) : undefined;
		if (!span) throw new Error(`Task not found in the document: ${entry.section}[${entry.index}] ${entry.raw}`);
		return span;
	}

	private positionAfterRemoval(entry: TaskEntry, section: SectionKey, position: InsertPosition): InsertPosition {
		if (typeof position !== "number" || section !== entry.section || position <= entry.index) return position;
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

	private readGroup(key: SectionKey, block: Block, index: number, entries: TaskEntry[], spans: Map<TaskEntry, Span>): TaskGroup {
		const own: TaskEntry[] = [];
		let blank = true;
		let i = block.start;
		while (i < block.end) {
			const raw = this.lines[i];
			if (raw.trim() !== "") blank = false;
			const parsed = parseTaskLine(raw, this.markers);
			if (!parsed) {
				i++;
				continue;
			}
			const children = this.childrenOf(i, block.end, parsed.indent.length);
			const entry: TaskEntry = {
				section: key,
				index: entries.length,
				raw,
				indent: parsed.indent,
				bullet: parsed.bullet,
				task: { ...parsed.task, children },
				group: block.name,
			};
			entries.push(entry);
			own.push(entry);
			spans.set(entry, { line: i, lineCount: 1 + children.length });
			i += 1 + children.length;
		}
		return { index, name: block.name, heading: block.headingLine !== null, entries: own, blank };
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
