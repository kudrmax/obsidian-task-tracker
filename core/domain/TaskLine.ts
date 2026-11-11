import { Repeat } from "./Repeat";
import { isValidLocalDate, MINUTES_PER_DAY, minutesToHHMM, parseHHMM } from "./LocalDate";
import { labelsOfText, labelTags } from "./Label";
import { priorityOfText } from "./Priority";
import { projectFields, projectsOfText } from "./Project";

import { DEFAULT_REMINDER, STATUS_CHARS, type ReminderKind, type Slot, type Task, type TaskStatus } from "./Task";

/** Any day: a rule without its `from` is read at it first, then anchored at the line's own. */
const ANY_DAY = "2000-01-01";

export interface Markers {
	readonly dueDate: string;
	/** Precedes a slot that rings as a notification; also the marker written when a kind has none of its own. */
	readonly slot: string;
	readonly alarmSlot?: string;
	readonly liveSlot?: string;
	readonly silentSlot?: string;
	readonly repeat?: string;
	/** Stands alone among the fields of a task whose subtasks are folded away. */
	readonly collapsed?: string;
	/** Prefixes of the priority levels: a line whose text starts with one of them, then more text, has that priority. */
	readonly priorities?: readonly string[];
	/** The tag folder of the labels: `label` for `#label/<name>`. */
	readonly labelTag?: string;
	/** Names of the labels: a tag `#<labelTag>/<name>` anywhere in the text is that label. */
	readonly labels?: readonly string[];
}

export interface ParsedTaskLine {
	readonly indent: string;
	readonly bullet: string;
	readonly task: Task;
}

const LINE_RE = /^([ \t]*)([-*+])[ \t]+\[(.)\][ \t]+(.*)$/;
const DATE = "(\\d{4}-\\d{2}-\\d{2})";
const TIME = "(\\d{2}:\\d{2})";

export function statusOf(char: string): TaskStatus {
	for (const status of Object.keys(STATUS_CHARS) as TaskStatus[]) {
		if (STATUS_CHARS[status] === char) return status;
	}
	return "todo";
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slotMarkers(markers: Markers): ReadonlyMap<string, ReminderKind> {
	const kinds = new Map<string, ReminderKind>();
	for (const [marker, kind] of [[markers.slot, "notification"], [markers.alarmSlot, "alarm"], [markers.liveSlot, "live"], [markers.silentSlot, "none"]] as const) {
		if (marker && !kinds.has(marker)) kinds.set(marker, kind);
	}
	return kinds;
}

function markerOf(kind: ReminderKind, markers: Markers): string {
	const own = { notification: markers.slot, alarm: markers.alarmSlot, live: markers.liveSlot, none: markers.silentSlot }[kind];
	return own || markers.slot;
}

class FieldSlicer {
	private readonly slotRe: RegExp;
	private readonly dueRe: RegExp;
	private readonly repeatRe: RegExp | null;
	private readonly collapsedRe: RegExp | null;
	private readonly kinds: ReadonlyMap<string, ReminderKind>;

	constructor(markers: Markers) {
		this.kinds = slotMarkers(markers);
		const alternatives = [...this.kinds.keys()].map(escapeRegExp).join("|");
		this.slotRe = new RegExp(`(?:^|\\s+)(${alternatives})\\s+${DATE}\\s+${TIME}(?:-${TIME})?$`);
		this.dueRe = new RegExp(`(?:^|\\s+)${escapeRegExp(markers.dueDate)}\\s+${DATE}$`);
		this.repeatRe = markers.repeat ? new RegExp(`(?:^|\\s+)${escapeRegExp(markers.repeat)}\\s+(.+?)$`) : null;
		this.collapsedRe = markers.collapsed ? new RegExp(`(?:^|\\s+)${escapeRegExp(markers.collapsed)}$`) : null;
	}

	/**
	 * The fields at the end of a line's body. A rule of every few units written without `from` counts from the line's own
	 * day, its due date or its slot's, whichever stands on it; a line with neither keeps it as text.
	 */
	slice(body: string): { text: string; dueDate: string | null; slot: Slot | null; reminder: ReminderKind; repeat: Repeat | null; collapsed: boolean } {
		const { unanchored, ...read } = this.fields(body, true);
		if (!unanchored || read.repeat === null) return read;
		const day = read.dueDate ?? read.slot?.date ?? null;
		return day === null ? this.fields(body, false) : { ...read, repeat: read.repeat.anchoredAt(day) };
	}

	/** The fields; `lenient`, a rule without its `from` is read anchored anywhere, and said to be (`unanchored`). */
	private fields(body: string, lenient: boolean): { text: string; dueDate: string | null; slot: Slot | null; reminder: ReminderKind; repeat: Repeat | null; collapsed: boolean; unanchored: boolean } {
		let unanchored = false;
		let text = body;
		let dueDate: string | null = null;
		let slot: Slot | null = null;
		let reminder: ReminderKind = DEFAULT_REMINDER;
		let repeat: Repeat | null = null;
		let collapsed = false;
		for (;;) {
			const slotMatch: RegExpExecArray | null = slot === null ? this.slotRe.exec(text) : null;
			if (slotMatch) {
				const parsed = this.slotOf(slotMatch);
				if (!parsed) break;
				slot = parsed;
				reminder = this.kinds.get(slotMatch[1]) ?? "notification";
				text = text.slice(0, slotMatch.index);
				continue;
			}
			const dueMatch: RegExpExecArray | null = dueDate === null ? this.dueRe.exec(text) : null;
			if (dueMatch) {
				if (!isValidLocalDate(dueMatch[1])) break;
				dueDate = dueMatch[1];
				text = text.slice(0, dueMatch.index);
				continue;
			}
			const collapsedMatch: RegExpExecArray | null = collapsed ? null : (this.collapsedRe?.exec(text) ?? null);
			if (collapsedMatch) {
				collapsed = true;
				text = text.slice(0, collapsedMatch.index);
				continue;
			}
			const repeatMatch: RegExpExecArray | null = repeat === null ? (this.repeatRe?.exec(text) ?? null) : null;
			if (repeatMatch) {
				const strict: Repeat | null = Repeat.parse(repeatMatch[1]);
				const parsed: Repeat | null = strict ?? (lenient ? Repeat.parse(repeatMatch[1], ANY_DAY) : null);
				if (!parsed) break;
				unanchored = strict === null;
				repeat = parsed;
				text = text.slice(0, repeatMatch.index);
				continue;
			}
			break;
		}
		return { text: text.trim(), dueDate, slot, reminder, repeat, collapsed, unanchored };
	}

	private slotOf(m: RegExpExecArray): Slot | null {
		const date = m[2];
		const start = parseHHMM(m[3]);
		if (!isValidLocalDate(date) || start === null || start >= MINUTES_PER_DAY) return null;
		if (m[4] === undefined) return { date, start, end: null };
		const end = parseHHMM(m[4]);
		if (end === null || start === end) return null;
		return { date, start, end: end < start ? end + MINUTES_PER_DAY : end };
	}
}

const slicers = new Map<string, FieldSlicer>();

/** The slicer for these markers, compiled once per pair of markers. */
export function fieldSlicerFor(markers: Markers): FieldSlicer {
	const key = [markers.slot, markers.alarmSlot ?? "", markers.liveSlot ?? "", markers.silentSlot ?? "", markers.dueDate, markers.repeat ?? "", markers.collapsed ?? ""].join("\u0000");
	let slicer = slicers.get(key);
	if (!slicer) {
		slicer = new FieldSlicer(markers);
		slicers.set(key, slicer);
	}
	return slicer;
}

/** Lines read under one set of markers: a document rebuilt after each change reads mostly the same lines again. */
const readLines = new WeakMap<Markers, Map<string, ParsedTaskLine | null>>();
/** Lines kept per set of markers before the store starts afresh. */
const KEPT_LINES = 20_000;

/** The task a line holds under `markers`, or null; the answer is shared, never to be changed. */
/** A line with a checkbox: a task line under any markers. */
export function isTaskLine(line: string): boolean {
	return LINE_RE.test(line);
}

export function parseTaskLine(line: string, markers: Markers): ParsedTaskLine | null {
	let kept = readLines.get(markers);
	if (!kept) readLines.set(markers, (kept = new Map()));
	const known = kept.get(line);
	if (known !== undefined) return known;
	if (kept.size >= KEPT_LINES) kept.clear();
	const parsed = readTaskLine(line, markers);
	kept.set(line, parsed);
	return parsed;
}

function readTaskLine(line: string, markers: Markers): ParsedTaskLine | null {
	const m = LINE_RE.exec(line);
	if (!m) return null;
	const statusChar = m[3];
	const tagged = labelsOfText(m[4], markers.labelTag ?? "", markers.labels ?? []);
	const named = projectsOfText(tagged.text, fieldStops(markers));
	const fields = fieldSlicerFor(markers).slice(named.text);
	return {
		indent: m[1],
		bullet: m[2],
		task: { status: statusOf(statusChar), statusChar, ...fields, ...priorityOfText(fields.text, markers.priorities ?? []), labels: tagged.labels, projects: named.projects, children: [] },
	};
}

/** The marks of the fields a project's name runs up to. */
export function fieldStops(markers: Markers): readonly string[] {
	return [markers.dueDate, markers.slot, markers.alarmSlot ?? "", markers.liveSlot ?? "", markers.silentSlot ?? "", markers.repeat ?? "", markers.collapsed ?? ""];
}

/** The line: the title, its projects, its labels, then the other fields; the projects right after the title, where the app of 0.4.189 keeps them too. */
export function formatTaskLine(parsed: ParsedTaskLine, markers: Markers): string {
	const { indent, bullet, task } = parsed;
	let line = `${indent}${bullet} [${task.statusChar}] ${task.priority ? `${task.priority} ` : ""}${task.text}`;
	line += projectFields(task.projects);
	if (task.labels.length > 0 && markers.labelTag) line += labelTags(markers.labelTag, task.labels);
	if (task.collapsed && markers.collapsed) line += ` ${markers.collapsed}`;
	if (task.dueDate) line += ` ${markers.dueDate} ${task.dueDate}`;
	if (task.slot) {
		const { date, start, end } = task.slot;
		line += ` ${markerOf(task.reminder, markers)} ${date} ${minutesToHHMM(start)}${end === null ? "" : `-${minutesToHHMM(end > MINUTES_PER_DAY ? end - MINUTES_PER_DAY : end)}`}`;
	}
	if (task.repeat && markers.repeat) line += ` ${markers.repeat} ${task.repeat.format()}`;
	return line;
}
