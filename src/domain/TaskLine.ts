import { Repeat } from "./Repeat";
import { isValidLocalDate, minutesToHHMM, parseHHMM } from "./LocalDate";

const DAY_MINUTES = 1440;
import { STATUS_CHARS, type ReminderKind, type Slot, type Task, type TaskStatus } from "./Task";

export interface Markers {
	readonly dueDate: string;
	/** Precedes a slot that rings as a notification; also the marker written when a kind has none of its own. */
	readonly slot: string;
	readonly alarmSlot?: string;
	readonly silentSlot?: string;
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

function slotMarkers(markers: Markers): ReadonlyMap<string, ReminderKind> {
	const kinds = new Map<string, ReminderKind>();
	for (const [marker, kind] of [[markers.slot, "notification"], [markers.alarmSlot, "alarm"], [markers.silentSlot, "none"]] as const) {
		if (marker && !kinds.has(marker)) kinds.set(marker, kind);
	}
	return kinds;
}

function markerOf(kind: ReminderKind, markers: Markers): string {
	const own = kind === "alarm" ? markers.alarmSlot : kind === "none" ? markers.silentSlot : markers.slot;
	return own || markers.slot;
}

class FieldSlicer {
	private readonly slotRe: RegExp;
	private readonly dueRe: RegExp;
	private readonly repeatRe: RegExp | null;
	private readonly kinds: ReadonlyMap<string, ReminderKind>;

	constructor(markers: Markers) {
		this.kinds = slotMarkers(markers);
		const alternatives = [...this.kinds.keys()].map(escapeRegExp).join("|");
		this.slotRe = new RegExp(`(?:^|\\s+)(${alternatives})\\s+${DATE}\\s+${TIME}(?:-${TIME})?$`);
		this.dueRe = new RegExp(`(?:^|\\s+)${escapeRegExp(markers.dueDate)}\\s+${DATE}$`);
		this.repeatRe = markers.repeat ? new RegExp(`(?:^|\\s+)${escapeRegExp(markers.repeat)}\\s+(.+?)$`) : null;
	}

	slice(body: string): { text: string; dueDate: string | null; slot: Slot | null; reminder: ReminderKind; repeat: Repeat | null } {
		let text = body;
		let dueDate: string | null = null;
		let slot: Slot | null = null;
		let reminder: ReminderKind = "notification";
		let repeat: Repeat | null = null;
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
		return { text: text.trim(), dueDate, slot, reminder, repeat };
	}

	private slotOf(m: RegExpExecArray): Slot | null {
		const date = m[2];
		const start = parseHHMM(m[3]);
		if (!isValidLocalDate(date) || start === null || start >= DAY_MINUTES) return null;
		if (m[4] === undefined) return { date, start, end: null };
		const end = parseHHMM(m[4]);
		if (end === null || start === end) return null;
		return { date, start, end: end < start ? end + DAY_MINUTES : end };
	}
}

const slicers = new Map<string, FieldSlicer>();

/** The slicer for these markers, compiled once per pair of markers. */
export function fieldSlicerFor(markers: Markers): FieldSlicer {
	const key = [markers.slot, markers.alarmSlot ?? "", markers.silentSlot ?? "", markers.dueDate, markers.repeat ?? ""].join("\u0000");
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
		line += ` ${markerOf(task.reminder, markers)} ${date} ${minutesToHHMM(start)}${end === null ? "" : `-${minutesToHHMM(end > DAY_MINUTES ? end - DAY_MINUTES : end)}`}`;
	}
	if (task.repeat && markers.repeat) line += ` ${markers.repeat} ${task.repeat.format()}`;
	return line;
}
