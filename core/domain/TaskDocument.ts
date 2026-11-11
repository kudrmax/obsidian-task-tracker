import { descriptionIndent, descriptionMarkdown, markdownLines } from "./description";
import { DEFAULT_REMINDER, STATUS_CHARS, type GroupName, type SectionKey, type Task } from "./Task";
import { formatTaskLine, isTaskLine, parseTaskLine, type Markers } from "./TaskLine";
import { matchLines } from "./LineMatch";
import { PROJECTS_HEADING, type ProjectTree, readTree, treeLines, treeSpan } from "./ProjectTree";

export interface SectionNamesOf {
	/** Left out by a reader Inbox means nothing to: the phone's reminders, Inbox tasks having no slot. */
	readonly inbox?: string;
	/** Left out by a reader Backlog means nothing to, as Inbox. */
	readonly backlog?: string;
	readonly now: string;
	readonly soon: string;
	readonly done: string;
	/** The heading of the tasks outside any section, when it is lower down; without it every `###` is a section. */
	readonly ungrouped?: string;
}

export interface TaskEntry {
	/**
	 * Who the task is: its line's tag. A line keeps its tag through every change of the document, wherever it moves and
	 * however it is rewritten; a line made anew gets a fresh one. `parse` takes the tags of a text's lines from `LineIds`.
	 */
	readonly id: string;
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
	/** The names of its projects: its own fields', a subtask's its top task's whatever its own line says. */
	readonly projects: readonly string[];
	/** The task lines nested right under this one, in file order. */
	readonly subtasks: readonly TaskEntry[];
}

/** A block of a list: the tasks above its first `###`, or a `###` heading and what is under it, up to the next. */
export interface TaskGroup {
	/** Its place among the list's groups; 0 is always the block above the first heading. */
	readonly index: number;
	readonly name: GroupName;
	readonly heading: boolean;
	/** Who the section is: its heading line's tag, kept through a rename and a move; null without a heading. */
	readonly id: string | null;
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

/**
 * What `retagged` makes of a document's tags: `t<n>` becomes `known`'s id for `n` when it has one, else `t` and `next`
 * plus `n`. A parse tags each line by its line, from `t0`, and the lines a change makes after it on from there; so a
 * document read from a text is retagged by the ids of that text's lines, wherever its changes moved them.
 */
export interface LineIds {
	readonly known: ReadonlyMap<number, string>;
	readonly next: number;
}

/** A heading or a task line of a document, where it stands, with its tag's number. */
export interface OutlineLine {
	readonly line: number;
	readonly raw: string;
	readonly task: boolean;
	readonly tag: number;
}

/** The lines of a text as `TaskDocument.parse` splits it. */
function linesOfText(text: string): string[] {
	const eol = text.includes("\r\n") ? "\r\n" : "\n";
	const body = text.endsWith(eol) ? text.slice(0, -eol.length) : text;
	return body === "" && text === "" ? [] : body.split(eol);
}

/** A line of the document and its tag. */
interface Row {
	readonly line: string;
	readonly tag: string;
}

/** The tags a change gives the lines it makes: each a fresh one, on from where the document's left off. */
class Mint {
	constructor(public next: number) {}

	rows(lines: readonly string[]): Row[] {
		return lines.map((line) => ({ line, tag: `t${this.next++}` }));
	}
}

function linesOfRows(rows: readonly Row[]): string[] {
	return rows.map((row) => row.line);
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

const SECTION_KEYS: readonly SectionKey[] = ["inbox", "backlog", "now", "soon", "done"];
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
		a.labels.length === b.labels.length &&
		a.labels.every((label, i) => label === b.labels[i]) &&
		(a.repeat?.format() ?? null) === (b.repeat?.format() ?? null) &&
		a.slot?.date === b.slot?.date &&
		a.slot?.start === b.slot?.start &&
		a.slot?.end === b.slot?.end &&
		a.reminder === b.reminder &&
		a.collapsed === b.collapsed &&
		sameLines(a.projects, b.projects) &&
		sameLines(a.children, b.children)
	);
}

/** A tag's number: the order lines were tagged in. */
function tagNumber(tag: string): number {
	return Number(tag.slice(1));
}

/** Every task and subtask, each before its own subtasks. */
export function flatten(entries: readonly TaskEntry[]): TaskEntry[] {
	return entries.flatMap((entry) => [entry, ...flatten(entry.subtasks)]);
}

function sameLines(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((line, i) => line === b[i]);
}

function contains(entry: TaskEntry, other: TaskEntry): boolean {
	return entry.section === other.section && entry.index === other.index && entry.path.every((i, k) => other.path[k] === i) && other.path.length >= entry.path.length;
}

/** The lines of an entry under another indent: its own line and the deeper ones keep their depth below it. */
function reindented(rows: readonly Row[], from: string, to: string): Row[] {
	if (from === to) return [...rows];
	return rows.map((row) => (row.line.startsWith(from) ? { line: to + row.line.slice(from.length), tag: row.tag } : row));
}

export class TaskDocument {
	private readonly lines: readonly string[];
	private readonly sections: ReadonlyMap<SectionKey, Section>;
	private readonly entries: ReadonlyMap<SectionKey, readonly TaskEntry[]>;
	private readonly spans: ReadonlyMap<TaskEntry, Span>;
	private readonly groupLists: ReadonlyMap<SectionKey, readonly TaskGroup[]>;
	private readonly blockLists: ReadonlyMap<SectionKey, readonly Block[]>;

	private constructor(
		private readonly rows: readonly Row[],
		private readonly eol: string,
		private readonly trailingEol: boolean,
		private readonly names: SectionNamesOf,
		private readonly markers: Markers,
		private readonly next: number,
	) {
		this.lines = linesOfRows(rows);
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

	/** Each line tagged by its line, `t0` on. */
	static parse(text: string, sections: SectionNamesOf, markers: Markers): TaskDocument {
		const eol = text.includes("\r\n") ? "\r\n" : "\n";
		const trailingEol = text.endsWith(eol);
		const lines = linesOfText(text);
		const rows = lines.map((line, i) => ({ line, tag: `t${i}` }));
		return new TaskDocument(rows, eol, trailingEol, sections, markers, lines.length);
	}

	/** The document with every tag renamed by `ids`; the tags its changes make go on past every new one. */
	retagged(ids: LineIds): TaskDocument {
		const rows = this.rows.map((row) => {
			const n = tagNumber(row.tag);
			return { line: row.line, tag: ids.known.get(n) ?? `t${ids.next + n}` };
		});
		return new TaskDocument(rows, this.eol, this.trailingEol, this.names, this.markers, ids.next + this.next);
	}

	/** The headings and the task lines, in file order, each with its tag's number. */
	outline(): readonly OutlineLine[] {
		return this.rows.flatMap((row, line): OutlineLine[] => {
			const task = isTaskLine(row.line);
			return task || SECTION_HEADING_RE.test(row.line) || GROUP_HEADING_RE.test(row.line) ? [{ line, raw: row.line, task, tag: tagNumber(row.tag) }] : [];
		});
	}

	static empty(all: readonly string[]): string {
		return TaskDocument.parse("", { inbox: "", now: "", soon: "", done: "" }, { dueDate: "", slot: "" })
			.ensureSections(all)
			.serialize();
	}

	/** The prefixes of the priority levels the file is read with. */
	priorityPrefixes(): readonly string[] {
		return this.markers.priorities ?? [];
	}

	serialize(): string {
		return this.lines.join(this.eol) + (this.trailingEol ? this.eol : "");
	}

	/** The projects of `## Projects`, as the file has them: none without the heading. */
	projectTree(): ProjectTree {
		return readTree(this.lines);
	}

	/** The file has `## Projects`. */
	hasProjectTree(): boolean {
		return treeSpan(this.lines).heading !== null;
	}

	/**
	 * The file with `tree` as its `## Projects`: the list's lines in place of the ones it had (where the first stood, else
	 * under the heading), every other line where it was; without the heading, the section made right after Inbox (at the
	 * file's end without Inbox). The same tree changes nothing.
	 */
	withProjectTree(tree: ProjectTree): TaskDocument {
		const span = treeSpan(this.lines);
		if (span.heading !== null && span.extra.length === 0 && tree.same(readTree(this.lines))) return this;
		const mint = this.mint();
		const lines = mint.rows(treeLines(tree, span.unit));
		if (span.heading === null) return this.withRows(this.newTreeRows(lines, mint), mint);
		const gone = new Set(span.items);
		for (const extra of span.extra) {
			if (!extra.bare) continue;
			for (let i = extra.heading; i < extra.end; i++) gone.add(i);
		}
		const kept = this.rows.map((row, i) => ({ row, i })).filter(({ i }) => !gone.has(i));
		const rows = kept.map(({ row }) => row);
		const firstOwn = span.own.length > 0 ? kept.findIndex(({ i }) => i > span.own[0]) : -1;
		let at = span.own.length > 0 ? (firstOwn < 0 ? rows.length : firstOwn) : kept.findIndex(({ i }) => i === span.heading) + 1;
		if (span.own.length === 0) {
			if (at < rows.length && rows[at].line.trim() === "") at++;
			else rows.splice(at++, 0, ...mint.rows([""]));
		}
		rows.splice(at, 0, ...lines);
		const after = at + lines.length;
		if (span.own.length === 0 && after < rows.length && rows[after].line.trim() !== "") rows.splice(after, 0, ...mint.rows([""]));
		return this.withRows(rows, mint);
	}

	/** The rows with a new `## Projects` holding `lines`, right after Inbox, apart from what is around it by blank lines. */
	private newTreeRows(lines: readonly Row[], mint: Mint): Row[] {
		const inbox = this.sections.get("inbox");
		const rows = [...this.rows];
		let at = inbox ? inbox.endLine : rows.length;
		while (at > (inbox?.firstLine ?? 0) && rows[at - 1].line.trim() === "") at--;
		const block = [...(at > 0 ? mint.rows([""]) : []), ...mint.rows([`## ${PROJECTS_HEADING}`, ""]), ...lines];
		const rest = rows.slice(at);
		const blankAfter = rest.findIndex((row) => row.line.trim() !== "");
		const tail = blankAfter < 0 ? [] : rest.slice(blankAfter);
		return [...rows.slice(0, at), ...block, ...(tail.length > 0 ? mint.rows([""]) : []), ...tail];
	}

	/** Each entry's own line written anew from its task, as the file's format has it now, even where its task reads the same. */
	rewrittenLines(entries: readonly TaskEntry[], change: (task: Task) => Task = (task) => task): TaskDocument {
		const rows = [...this.rows];
		let changed = false;
		for (const entry of entries) {
			const line = this.spanOf(entry).line;
			const written = formatTaskLine({ indent: entry.indent, bullet: entry.bullet, task: change(entry.task) }, this.markers);
			if (written === rows[line].line) continue;
			rows[line] = { line: written, tag: rows[line].tag };
			changed = true;
		}
		return changed ? this.withRows(rows) : this;
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

	/** The task or subtask whose tag is `id`, wherever it stands; undefined when none has it. */
	byId(id: string): TaskEntry | undefined {
		return flatten(this.allTasks()).find((entry) => entry.id === id);
	}

	/** The task or subtask at that place, if there is one. */
	find(section: SectionKey, index: number, path: readonly number[]): TaskEntry | undefined {
		let entry: TaskEntry | undefined = this.tasks(section)[index];
		for (const i of path) entry = entry?.subtasks[i];
		return entry;
	}

	/** The line the entry's task stands on, from 0. */
	lineOf(entry: TaskEntry): number {
		return this.spanOf(entry).line;
	}

	allTasks(): readonly TaskEntry[] {
		return SECTION_KEYS.flatMap((key) => this.tasks(key));
	}

	/** Where the tags of the lines a change makes after this document begin: past every tag it has. */
	nextTag(): number {
		return this.next;
	}

	/** The tag of each heading and task line, by its line, from 0. */
	outlineTags(): ReadonlyMap<number, string> {
		return new Map(this.outline().map((o) => [o.line, this.rows[o.line].tag]));
	}

	/**
	 * The task a change made since `before`, wherever the rules then moved it: the first one it made, as its tag tells; the
	 * rules may make others after it (a repeating task's next copy).
	 */
	insertedSince(before: TaskDocument): TaskEntry | undefined {
		const old = new Set(flatten(before.allTasks()).map((entry) => entry.id));
		const made = flatten(this.allTasks()).filter((entry) => !old.has(entry.id));
		return made.sort((a, b) => tagNumber(a.id) - tagNumber(b.id))[0];
	}

	/** Where each of `moved`, tasks of `before`, stands after a change moved them, by its tag; undefined when it is gone. */
	movedSince(_before: TaskDocument, moved: readonly TaskEntry[]): (TaskEntry | undefined)[] {
		const all = new Map(flatten(this.allTasks()).map((entry) => [entry.id, entry]));
		return moved.map((entry) => all.get(entry.id));
	}

	insert(section: SectionKey, position: InsertPosition, task: Task): TaskDocument {
		const line = this.insertionLine(section, position);
		const mint = this.mint();
		return this.withRows(this.splice(line, 0, mint.rows(this.linesOf("", "-", task))), mint);
	}

	replace(entry: TaskEntry, task: Task): TaskDocument {
		const span = this.spanOf(entry);
		if (sameTask(entry.task, task)) return this;
		const mint = this.mint();
		return this.withRows(this.splice(span.line, span.lineCount, this.rewritten(span, this.linesOf(entry.indent, entry.bullet, task), mint)), mint);
	}

	/**
	 * Each entry of this document becomes its task, as `replace` one after another would, in one rewrite. Only the task's
	 * own line changes unless its description and subtasks do; those rewritten lines may not hold another change.
	 */
	replaceAll(changes: readonly (readonly [TaskEntry, Task])[]): TaskDocument {
		const edits: { line: number; count: number; rows: Row[] }[] = [];
		const mint = this.mint();
		for (const [entry, task] of changes) {
			const span = this.spanOf(entry);
			if (sameTask(entry.task, task)) continue;
			const own = sameLines(entry.task.children, task.children);
			edits.push(
				own
					? { line: span.line, count: 1, rows: this.rewritten({ line: span.line, lineCount: 1 }, [formatTaskLine({ indent: entry.indent, bullet: entry.bullet, task }, this.markers)], mint) }
					: { line: span.line, count: span.lineCount, rows: this.rewritten(span, this.linesOf(entry.indent, entry.bullet, task), mint) },
			);
		}
		if (edits.length === 0) return this;
		edits.sort((a, b) => b.line - a.line);
		const rows = [...this.rows];
		let below = rows.length;
		for (const edit of edits) {
			if (edit.line + edit.count > below) throw new Error(`Changes overlap at line ${edit.line + 1}`);
			rows.splice(edit.line, edit.count, ...edit.rows);
			below = edit.line;
		}
		return this.withRows(rows, mint);
	}

	/** The last task taken out of a section takes the section away, unless something but blank lines is left under it. */
	removeEntry(entry: TaskEntry): TaskDocument {
		const span = this.spanOf(entry);
		return this.leftBy(entry, this.withRows(this.splice(span.line, span.lineCount, [])));
	}

	/**
	 * A subtask moved here leaves its task and becomes a task of `section`, with the projects it had through it; `projects`
	 * gives it others. The section it leaves empty goes, as with `removeEntry`.
	 */
	moveEntry(entry: TaskEntry, section: SectionKey, position: InsertPosition, projects?: readonly string[]): TaskDocument {
		const span = this.spanOf(entry);
		const moved = this.ownRows(entry, span, "", projects ?? (entry.path.length > 0 ? entry.projects : entry.task.projects));
		const without = this.withRows(this.splice(span.line, span.lineCount, []));
		const target = without.insertionLine(section, this.positionAfterRemoval(entry, section, position));
		return this.leftBy(entry, without.withRows(without.splice(target, 0, moved)));
	}

	/** An empty `### name` before group `before`; `before` equal to the number of groups puts it last. */
	addGroup(section: SectionKey, name: string, before: number): TaskDocument {
		if (before < 1) throw new Error("No group goes above the tasks outside any section");
		const mint = this.mint();
		return this.withRows(this.splice(this.groupStartLine(section, before), 0, mint.rows([`### ${name}`])), mint);
	}

	/**
	 * The `moved` tasks of group `index`, with their subtasks and in their order, go under a new `### name` right after the
	 * group's last line that stays; the rest of the group stays as it is, even when nothing is left in it. Nothing to move is `addGroup` after the group.
	 */
	splitGroup(section: SectionKey, index: number, name: string, moved: readonly TaskEntry[]): TaskDocument {
		if (moved.length === 0) return this.addGroup(section, name, index + 1);
		const block = this.blockOf(section, index);
		const spans = moved.map((entry) => this.spanOf(entry));
		const inMoved = (line: number) => spans.some((span) => line >= span.line && line < span.line + span.lineCount);
		let at = block.end;
		while (at > block.start && (this.lines[at - 1].trim() === "" || inMoved(at - 1))) at--;
		if (at === block.start) at = Math.min(...spans.map((span) => span.line));
		const rows = moved.flatMap((entry, i) => reindented(this.rows.slice(spans[i].line, spans[i].line + spans[i].lineCount), entry.indent, ""));
		const kept = this.rows.filter((_, line) => !inMoved(line));
		const mint = this.mint();
		kept.splice(at - spans.filter((span) => span.line < at).reduce((sum, span) => sum + span.lineCount, 0), 0, ...mint.rows([`### ${name}`]), ...rows);
		return this.withRows(kept, mint);
	}

	/** Group `from` goes before group `before`. The top block moved down gets the heading of the tasks outside any section. */
	moveGroup(section: SectionKey, from: number, before: number): TaskDocument {
		if (before < 1) throw new Error("No group goes above the tasks outside any section");
		if (before === from || before === from + 1) return this;
		const block = this.blockOf(section, from);
		const content = this.contentOf(block);
		const mint = this.mint();
		const core = this.rows.slice(block.headingLine ?? content.first, content.last);
		if (block.headingLine === null) core.unshift(...mint.rows([`### ${this.ungroupedName()}`]));
		const cut = this.cutOf(section, from);
		const apart = mint.rows(Array<string>(cut.to - cut.from - (content.last - (block.headingLine ?? content.first))).fill(""));
		const last = before === this.blockLists.get(section)!.length;
		const moved = last ? [...apart, ...core] : [...core, ...apart];
		return this.withRows(this.cutAndInsert(cut, this.groupStartLine(section, before), moved), mint);
	}

	renameGroup(section: SectionKey, index: number, name: string): TaskDocument {
		const line = this.blockOf(section, index).headingLine;
		if (line === null) throw new Error("The tasks outside any section have no heading");
		return this.withRows(this.splice(line, 1, [{ line: `### ${name}`, tag: this.rows[line].tag }]));
	}

	/** What group `from` holds goes to the start or the end of the tasks of group `into`; the heading of `from` goes. */
	mergeGroup(section: SectionKey, from: number, into: number, at: "start" | "end"): TaskDocument {
		if (from === into) throw new Error("A group merges into another one");
		const content = this.contentOf(this.blockOf(section, from));
		const moved = this.rows.slice(content.first, content.last);
		return this.withRows(this.cutAndInsert(this.cutOf(section, from), this.groupInsertionLine(section, into, at), moved));
	}

	/** A group with nothing but blank lines goes, its blank lines with it unless they part the list from the next one. */
	deleteGroup(section: SectionKey, index: number): TaskDocument {
		const group = this.groups(section)[index];
		const block = this.blockOf(section, index);
		if (!group?.blank || block.headingLine === null) throw new Error("Only an empty section is deleted");
		const cut = this.cutOf(section, index);
		return this.withRows(this.splice(cut.from, cut.to - cut.from, []));
	}

	/** Puts the entry with its subtasks among `parent`'s subtasks, right before `before` (one of them) or last. */
	nestEntry(entry: TaskEntry, parent: TaskEntry, before: TaskEntry | null): TaskDocument {
		if (contains(entry, parent)) throw new Error(`A task cannot go under itself: ${entry.raw}`);
		const span = this.spanOf(entry);
		const target = before ? this.spanOf(before).line : this.endOf(parent);
		const moved = this.ownRows(entry, span, this.childIndent(parent), []);
		const without = this.splice(span.line, span.lineCount, []);
		without.splice(target > span.line ? target - span.lineCount : target, 0, ...moved);
		return this.leftBy(entry, this.withRows(without));
	}

	/**
	 * The task's description from Markdown, as one block right under its line and before its subtasks, at the indent its
	 * description has, else its subtasks'. The same text changes nothing; an empty one, or a lone empty point, takes the description away.
	 */
	setDescription(entry: TaskEntry, markdown: string): TaskDocument {
		const lines = markdownLines(markdown);
		if (lines.join("\n") === (descriptionMarkdown(entry) ?? "")) return this;
		const indent = descriptionIndent(entry) ?? this.childIndent(entry);
		const subtasks = entry.subtasks.flatMap((sub) => [sub.raw, ...sub.task.children]);
		return this.replace(entry, { ...entry.task, children: [...lines.map((line) => indent + line), ...subtasks] });
	}

	/**
	 * The entry's child lines with every subtask `[ ]` and without its due date, slot (with its reminder kind) and repeat;
	 * description lines as they are. Indented as a task of its own's, even for a subtask.
	 */
	freshChildren(entry: TaskEntry): readonly string[] {
		const first = this.spanOf(entry).line + 1;
		const children = [...entry.task.children];
		const open = (sub: TaskEntry): void => {
			const task: Task = { ...sub.task, status: "todo", statusChar: STATUS_CHARS.todo, dueDate: null, slot: null, reminder: DEFAULT_REMINDER, repeat: null };
			children[this.spanOf(sub).line - first] = formatTaskLine({ indent: sub.indent, bullet: sub.bullet, task }, this.markers);
			sub.subtasks.forEach(open);
		};
		entry.subtasks.forEach(open);
		return children.map((line) => (line.startsWith(entry.indent) ? line.slice(entry.indent.length) : line));
	}

	/** A new subtask of `parent`, right before its subtask `before` or last. */
	insertUnder(parent: TaskEntry, task: Task, before: TaskEntry | null = null): TaskDocument {
		const line = before ? this.spanOf(before).line : this.endOf(parent);
		const mint = this.mint();
		return this.withRows(this.splice(line, 0, mint.rows(this.linesOf(this.childIndent(parent), parent.bullet, task))), mint);
	}

	ensureSections(all: readonly string[]): TaskDocument {
		const present = new Set(this.headingNames());
		const missing = all.filter((name) => !present.has(name));
		if (missing.length === 0) return this;
		const rows = [...this.rows];
		const mint = this.mint();
		for (const name of missing) {
			if (rows.length > 0 && rows[rows.length - 1].line !== "") rows.push(...mint.rows([""]));
			rows.push(...mint.rows([`## ${name}`]));
		}
		return new TaskDocument(rows, this.eol, true, this.names, this.markers, mint.next);
	}

	/** Under each list's heading one blank line, then what is under it; a heading with nothing below it stays as it is. */
	spacedHeadings(): TaskDocument {
		const headings = [...this.sections.values()].map((s) => s.headingLine).sort((a, b) => b - a);
		let rows: Row[] | null = null;
		const mint = this.mint();
		for (const heading of headings) {
			const current: readonly Row[] = rows ?? this.rows;
			let filled = heading + 1;
			while (filled < current.length && current[filled].line.trim() === "") filled++;
			if (filled === current.length || (filled === heading + 2 && current[heading + 1].line === "")) continue;
			rows ??= [...this.rows];
			rows.splice(heading + 1, filled - heading - 1, ...mint.rows([""]));
		}
		return rows ? this.withRows(rows, mint) : this;
	}

	/**
	 * `after`, this document once `entry` was taken from its place (and put elsewhere): without the section it was the
	 * last task of, when only blank lines are left under its heading. No section's heading is left to the rules.
	 */
	private leftBy(entry: TaskEntry, after: TaskDocument): TaskDocument {
		if (entry.path.length > 0 || entry.group === null) return after;
		const group = this.groups(entry.section).find((g) => g.entries.some((e) => e.index === entry.index));
		const left = group && after.groups(entry.section)[group.index];
		if (!group || !left?.heading || left.name !== group.name || !left.blank) return after;
		return after.deleteGroup(entry.section, left.index);
	}

	/**
	 * The entry's lines under another indent, its own line written with `projects` as its projects: a subtask that becomes
	 * a task takes the ones it had through its parent, a task put under another one needs none.
	 */
	private ownRows(entry: TaskEntry, span: Span, indent: string, projects: readonly string[]): Row[] {
		const rows = reindented(this.rows.slice(span.line, span.line + span.lineCount), entry.indent, indent);
		if (!sameLines(entry.task.projects, projects)) rows[0] = { line: formatTaskLine({ indent, bullet: entry.bullet, task: { ...entry.task, projects } }, this.markers), tag: rows[0].tag };
		return rows;
	}

	/**
	 * `lines` in place of the span's: its first line keeps the tag of the span's first, as a rewritten task keeps who it
	 * is; the lines under it keep theirs where they stay or are edited in place, a task line for a task line.
	 */
	private rewritten(span: Span, lines: readonly string[], mint: Mint): Row[] {
		const old = this.rows.slice(span.line + 1, span.line + span.lineCount);
		const fresh = lines.slice(1);
		const isTask = (line: string) => parseTaskLine(line, this.markers) !== null;
		const kept = new Map(matchLines(linesOfRows(old), fresh, (b, a) => isTask(old[b].line) === isTask(fresh[a])).map(([b, a]) => [a, old[b].tag]));
		const rows = fresh.map((line, i) => ({ line, tag: kept.get(i) ?? mint.rows([line])[0].tag }));
		return [{ line: lines[0], tag: this.rows[span.line].tag }, ...rows];
	}

	private mint(): Mint {
		return new Mint(this.next);
	}

	private withRows(rows: readonly Row[], mint: Mint | null = null): TaskDocument {
		return new TaskDocument(rows, this.eol, this.trailingEol, this.names, this.markers, mint?.next ?? this.next);
	}

	private splice(start: number, deleteCount: number, insert: readonly Row[]): Row[] {
		const rows = [...this.rows];
		rows.splice(start, deleteCount, ...insert);
		return rows;
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
		if (group.entries.length === 0) return this.emptyBlockLine(section, index);
		if (position === "start") return this.spans.get(group.entries[0])!.line;
		return this.lineAfter(group.entries[group.entries.length - 1]);
	}

	private groupInsertionLine(section: SectionKey, index: number, at: "start" | "end"): number {
		const group = this.groups(section)[index];
		if (!group) throw new Error(`Group missing: ${this.names[section]}[${index}]`);
		if (group.entries.length === 0) return this.emptyBlockLine(section, index);
		return at === "start" ? this.spans.get(group.entries[0])!.line : this.lineAfter(group.entries[group.entries.length - 1]);
	}

	/**
	 * Where a task goes in a block without tasks: right under its heading. The top block's blank lines stay under the
	 * list's heading when a `###` follows, and part the list from the next one when it is the last.
	 */
	private emptyBlockLine(section: SectionKey, index: number): number {
		const block = this.blockOf(section, index);
		const last = index === this.blockLists.get(section)!.length - 1;
		return block.headingLine === null && !last ? this.firstFilled(block) : block.start;
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
	private cutAndInsert(cut: { from: number; to: number }, target: number, moved: readonly Row[]): Row[] {
		const size = cut.to - cut.from;
		const rows = this.splice(cut.from, size, []);
		rows.splice(target >= cut.to ? target - size : Math.min(target, cut.from), 0, ...moved);
		return rows;
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
		const own = this.readLevel(key, block.start, block.end, null, block.name, entries.length, spans, null);
		entries.push(...own);
		return { index, name: block.name, heading: block.headingLine !== null, id: block.headingLine === null ? null : this.rows[block.headingLine].tag, entries: own, blank };
	}

	/** The task lines from `from` to `end` that no task line above them in that range holds, each with its own subtasks. */
	private readLevel(section: SectionKey, from: number, end: number, parent: Place | null, group: GroupName, firstIndex: number, spans: Map<TaskEntry, Span>, parentProjects: readonly string[] | null): TaskEntry[] {
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
			const projects = parent ? (parentProjects ?? []) : parsed.task.projects;
			const subtasks = this.readLevel(section, i + 1, i + 1 + children.length, place, group, 0, spans, projects);
			const entry: TaskEntry = { id: this.rows[i].tag, section, ...place, raw, indent: parsed.indent, bullet: parsed.bullet, task: { ...parsed.task, children }, group, projects, subtasks };
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
