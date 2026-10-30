import { isValidLocalDate, minutesToHHMM, parseHHMM } from "./LocalDate";
import { STATUS_CHARS, type Slot, type Task, type TaskStatus } from "./Task";

export interface Markers {
	readonly dueDate: string;
	readonly slot: string;
}

export interface ParsedTaskLine {
	readonly indent: string;
	readonly bullet: string;
	readonly task: Task;
}

const LINE_RE = /^([ \t]*)([-*+])[ \t]+\[(.)\][ \t]+(.*)$/;
const DATE = "(\\d{4}-\\d{2}-\\d{2})";
const TIME = "(\\d{2}:\\d{2})";
const MINUTES_PER_DAY = 1440;

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

	constructor(markers: Markers) {
		this.slotRe = new RegExp(`(?:^|\\s+)${escapeRegExp(markers.slot)}\\s+${DATE}\\s+${TIME}(?:-${TIME})?$`);
		this.dueRe = new RegExp(`(?:^|\\s+)${escapeRegExp(markers.dueDate)}\\s+${DATE}$`);
	}

	slice(body: string): { text: string; dueDate: string | null; slot: Slot | null } {
		let text = body;
		let dueDate: string | null = null;
		let slot: Slot | null = null;
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
			break;
		}
		return { text: text.trim(), dueDate, slot };
	}

	private slotOf(m: RegExpExecArray): Slot | null {
		const date = m[1];
		const start = parseHHMM(m[2]);
		if (!isValidLocalDate(date) || start === null) return null;
		if (m[3] === undefined) return start < MINUTES_PER_DAY ? { date, start, end: null } : null;
		const end = parseHHMM(m[3]);
		if (end === null || start >= end) return null;
		return { date, start, end };
	}
}

export function parseTaskLine(line: string, markers: Markers): ParsedTaskLine | null {
	const m = LINE_RE.exec(line);
	if (!m) return null;
	const statusChar = m[3];
	const fields = new FieldSlicer(markers).slice(m[4]);
	return {
		indent: m[1],
		bullet: m[2],
		task: { status: statusOf(statusChar), statusChar, ...fields, children: [] },
	};
}

export function formatTaskLine(parsed: ParsedTaskLine, markers: Markers): string {
	const { indent, bullet, task } = parsed;
	let line = `${indent}${bullet} [${task.statusChar}] ${task.text}`;
	if (task.dueDate) line += ` ${markers.dueDate} ${task.dueDate}`;
	if (task.slot) {
		const { date, start, end } = task.slot;
		line += ` ${markers.slot} ${date} ${minutesToHHMM(start)}${end === null ? "" : `-${minutesToHHMM(end)}`}`;
	}
	return line;
}
