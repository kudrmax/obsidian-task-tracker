import type { LocalDate } from "./Task";

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;
const DAY_MS = 86_400_000;

function pad2(n: number): string {
	return n < 10 ? `0${n}` : String(n);
}

function formatUtc(d: Date): LocalDate {
	return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function localDateOf(d: Date): LocalDate {
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function isValidLocalDate(s: string): boolean {
	const m = DATE_RE.exec(s);
	if (!m) return false;
	const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
	return formatUtc(d) === s;
}

export function addDays(date: LocalDate, n: number): LocalDate {
	const m = DATE_RE.exec(date);
	if (!m) throw new Error(`Not a date: ${date}`);
	const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + n * DAY_MS;
	return formatUtc(new Date(ms));
}

export function minutesToHHMM(minutes: number): string {
	return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

export function parseHHMM(s: string): number | null {
	const m = TIME_RE.exec(s);
	if (!m) return null;
	const hours = Number(m[1]);
	const minutes = Number(m[2]);
	if (hours > 24 || minutes > 59) return null;
	const total = hours * 60 + minutes;
	return total > 1440 ? null : total;
}
