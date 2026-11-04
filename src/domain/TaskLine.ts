import { Repeat } from "./Repeat";
import { isValidLocalDate, minutesToHHMM, parseHHMM } from "./LocalDate";

const DAY_MINUTES = 1440;
import { STATUS_CHARS, type Slot, type Task, type TaskStatus } from "./Task";

export interface Markers {
	readonly dueDate: string;
	readonly slot: string;
	readonly repeat?: string;
	/** Prefixes of the priority levels: a line whose text starts with one of them, then more text, has that priority. */
	readonly priorities?: readonly string[];
}

export interface ParsedTaskLine {
	readonly indent: string;
	readonly bullet: string;
	readonly task: Task;
}

const LINE_RE = /^([ \t]*)([-*+])[ \t]+\[(.)\][ \t]+(.*)$/;
const DATE = "(\\d{4}-\\d{2}-\\d{2})";
const FIRST_WORD_RE = /^(\S+)\s+(\S.*)$/;
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

class FieldSlicer {
	private readonly slotRe: RegExp;
	private readonly dueRe: RegExp;
	private readonly repeatRe: RegExp | null;

	constructor(markers: Markers) {
		this.slotRe = new RegExp(`(?:^|\\s+)${escapeRegExp(markers.slot)}\\s+${DATE}\\s+${TIME}(?:-${TIME})?$`);
		this.dueRe = new RegExp(`(?:^|\\s+)${escapeRegExp(markers.dueDate)}\\s+${DATE}$`);
		this.repeatRe = markers.repeat ? new RegExp(`(?:^|\\s+)${escapeRegExp(markers.repeat)}\\s+(.+?)$`) : null;
	}

	slice(body: string): { text: string; dueDate: string | null; slot: Slot | null; repeat: Repeat | null } {
		let text = body;
		let dueDate: string | null = null;
		let slot: Slot | null = null;
		let repeat: Repeat | null = null;
		for (;;) {
			const slotMatch: RegExpExecArray | null = slot === null ? this.slotRe.exec(text) : null;
			if (slotMatch) {
				const parsed = this.slotOf(slotMatch);
				if (!parsed) break;
				slot = parsed;
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
			const repeatMatch: RegExpExecArray | null = repeat === null ? (this.repeatRe?.exec(text) ?? null) : null;
			if (repeatMatch) {
				const parsed = Repeat.parse(repeatMatch[1]);
				if (!parsed) break;
				repeat = parsed;
				text = text.slice(0, repeatMatch.index);
				continue;
			}
			break;
		}
		return { text: text.trim(), dueDate, slot, repeat };
	}

	private slotOf(m: RegExpExecArray): Slot | null {
		const date = m[1];
		const start = parseHHMM(m[2]);
		if (!isValidLocalDate(date) || start === null || start >= DAY_MINUTES) return null;
		if (m[3] === undefined) return { date, start, end: null };
		const end = parseHHMM(m[3]);
		if (end === null || start === end) return null;
		return { date, start, end: end < start ? end + DAY_MINUTES : end };
	}
}

const slicers = new Map<string, FieldSlicer>();

/** The slicer for these markers, compiled once per pair of markers. */
export function fieldSlicerFor(markers: Markers): FieldSlicer {
	const key = `${markers.slot}\u0000${markers.dueDate}\u0000${markers.repeat ?? ""}`;
	let slicer = slicers.get(key);
	if (!slicer) {
		slicer = new FieldSlicer(markers);
		slicers.set(key, slicer);
	}
	return slicer;
}

export function parseTaskLine(line: string, markers: Markers): ParsedTaskLine | null {
	const m = LINE_RE.exec(line);
	if (!m) return null;
	const statusChar = m[3];
	const fields = fieldSlicerFor(markers).slice(m[4]);
	return {
		indent: m[1],
		bullet: m[2],
		task: { status: statusOf(statusChar), statusChar, ...fields, ...priorityOf(fields.text, markers), children: [] },
	};
}

function priorityOf(text: string, markers: Markers): { text: string; priority: string | null } {
	const m = FIRST_WORD_RE.exec(text);
	if (!m || !markers.priorities?.includes(m[1])) return { text, priority: null };
	return { text: m[2], priority: m[1] };
}

export function formatTaskLine(parsed: ParsedTaskLine, markers: Markers): string {
	const { indent, bullet, task } = parsed;
	let line = `${indent}${bullet} [${task.statusChar}] ${task.priority ? `${task.priority} ` : ""}${task.text}`;
	if (task.dueDate) line += ` ${markers.dueDate} ${task.dueDate}`;
	if (task.slot) {
		const { date, start, end } = task.slot;
		line += ` ${markers.slot} ${date} ${minutesToHHMM(start)}${end === null ? "" : `-${minutesToHHMM(end > DAY_MINUTES ? end - DAY_MINUTES : end)}`}`;
	}
	if (task.repeat && markers.repeat) line += ` ${markers.repeat} ${task.repeat.format()}`;
	return line;
}
