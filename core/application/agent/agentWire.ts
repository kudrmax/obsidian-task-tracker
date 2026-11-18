import type { LocalDate, SectionKey, TaskKey } from "../contracts";

export type { LocalDate };

/** A task's status in the program's words. */
export type WireStatus = "open" | "inProgress" | "done" | "wontDo";

/** Where Max sees a task: never the file's section. `day` is a later day, given in `date`. */
export type WirePlace = "inbox" | "backlog" | "soon" | "today" | "day" | "done";

/** A task's slot: its start and end on the clock, the full moment it starts, how long it lasts, and whether it rides the now line. */
export interface WireTime {
	readonly start: string;
	readonly end?: string;
	readonly startsAt: string;
	readonly durationMin?: number;
	readonly passed: boolean;
}

/** The step a folded task's card shows, and the titles down to it from the task. */
export interface WireStep {
	readonly ref: string;
	readonly title: string;
	readonly path: readonly string[];
}

/** A task as an agent reads it: a field without a value is left out. A subtask has no place, date or projects. */
export interface WireTask {
	readonly ref: string;
	readonly title: string;
	readonly status: WireStatus;
	readonly place?: WirePlace;
	readonly date?: LocalDate;
	readonly due?: LocalDate;
	readonly time?: WireTime;
	readonly reminder?: WireReminder;
	readonly section?: string;
	readonly projects?: readonly string[];
	readonly priority?: { readonly name: string; readonly rank: number };
	readonly labels?: readonly string[];
	readonly repeat?: string;
	readonly description?: string;
	readonly progress?: { readonly done: number; readonly total: number };
	readonly collapsed?: boolean;
	readonly nextStep?: WireStep;
	readonly subtasks?: readonly WireTask[];
	/** The open subtask a folded task's card shows. */
	readonly next?: boolean;
}

/** How the phone reminds of a task at its start. */
export type WireReminder = "lockScreen" | "notification" | "alarm" | "none";

/** A section of a list as its column draws it: `name` null for the tasks outside any; an empty section stays. */
export interface WireSection {
	readonly name: string | null;
	readonly tasks: readonly WireTask[];
}

/** Soon, Inbox or Backlog in its sections. */
export interface WireList {
	readonly list: "soon" | "inbox" | "backlog";
	readonly sections: readonly WireSection[];
}

export interface WireEvents {
	readonly allDay: readonly { readonly title: string; readonly calendar: string }[];
	readonly timed: readonly {
		readonly title: string;
		readonly start: string;
		readonly end: string;
		readonly startsAt: string;
		readonly endsAt: string;
		readonly calendar: string;
		readonly passed: boolean;
	}[];
}

/** The calendars' sources as the sources window gives them, unfiltered. */
export interface WireCalendars {
	readonly alert: "none" | "old" | "broken";
	readonly sources: readonly { readonly source: "google" | "iphone" | "work"; readonly tone: "plain" | "old" | "broken" | "spare"; readonly words: string; readonly updated?: string }[];
}

/** A day as Max sees it at Now–calendar: its list in sections and its timeline, never a task in both, and its meetings. */
export interface WireDay {
	readonly date: LocalDate;
	readonly weekday: string;
	readonly relation: "today" | "tomorrow" | "yesterday" | "past" | "future";
	readonly dayStart: string;
	readonly now?: string;
	readonly past?: true;
	readonly note?: string;
	readonly list?: { readonly sections: readonly WireSection[] };
	readonly timeline?: readonly WireTask[];
	readonly events: WireEvents;
	readonly calendars: WireCalendars;
}

export interface WireWeek {
	readonly days: readonly WireDay[];
}

export interface WireAll {
	readonly tasks: readonly WireTask[];
}

export interface WireProject {
	readonly name: string;
	readonly path: readonly string[];
	readonly depth: number;
	readonly folder: boolean;
	readonly status: "active" | "waiting" | "done";
	readonly note?: string;
}

export interface WireProjects {
	readonly projects: readonly WireProject[];
	readonly noProject: { readonly openTasks: boolean };
}

/** A part of a project By project: its own tasks, a subproject's, or (with `--done`) the closed ones. */
export interface WirePart {
	readonly kind: "own" | "subproject" | "done";
	readonly title?: string;
	readonly path: readonly string[];
	readonly tasks: readonly WireTask[];
}

export interface WireProjectAnswer {
	readonly project: { readonly name: string; readonly folder: boolean; readonly status: "active" | "waiting" | "done" };
	readonly parts: readonly WirePart[];
}

export interface WireSearch {
	readonly query: string;
	readonly groups: readonly { readonly list: "inbox" | "backlog" | "soon" | "today" | "done"; readonly tasks: readonly WireTask[] }[];
}

/** One task whole, and where it is stored: `stored` is for editing the file by the recipes, never what to tell Max. */
export interface WireTaskAnswer {
	readonly task: WireTask;
	readonly stored: { readonly section: string; readonly line: string };
}

export interface WireHelp {
	readonly program: string;
	readonly commands: readonly { readonly command: string; readonly answers: string }[];
	readonly options: readonly { readonly option: string; readonly means: string }[];
	readonly places: readonly { readonly place: WirePlace; readonly means: string }[];
	readonly statuses: readonly { readonly status: WireStatus; readonly means: string }[];
	readonly priorities: readonly { readonly name: string; readonly rank: number }[];
	readonly labels: readonly string[];
	/** The labels the assistant's buttons are set to use (Best task's Label and Skip label), the label chosen or null for none. */
	readonly assistantLabels: readonly { readonly action: string; readonly option: string; readonly label: string | null; readonly means: string }[];
	readonly notes: readonly string[];
}

/** Why the program answers no data. */
export type AgentErrorCode = "tasksFileMissing" | "unknownCommand" | "badArgument" | "unknownProject" | "staleTask" | "unknownTask" | "failed";

export class AgentError extends Error {
	constructor(
		readonly code: AgentErrorCode,
		message: string,
		readonly candidates?: readonly string[],
	) {
		super(message);
		this.name = "AgentError";
	}
}

/** The failure as the program prints it. */
export interface WireError {
	readonly error: { readonly code: AgentErrorCode; readonly message: string; readonly candidates?: readonly string[] };
}

const HOUR = 60;
const DAY_HOURS = 24;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Minutes of a day as the clock writes them: `14:00`, `00:30`. */
export function clockTime(minutes: number): string {
	return `${pad2(Math.floor(minutes / HOUR) % DAY_HOURS)}:${pad2(minutes % HOUR)}`;
}

/** A moment as the device's clock writes it, to the minute: `2026-11-18T13:05`. */
export function localMoment(at: Date): string {
	return `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}T${pad2(at.getHours())}:${pad2(at.getMinutes())}`;
}

/** A value that may be none, mapped when it is there. */
export function mapNull<T, R>(value: T | null | undefined, map: (value: T) => R): R | undefined {
	return value === null || value === undefined ? undefined : map(value);
}

/** The object without the fields left undefined or null. */
export function defined<T extends object>(value: T): T {
	return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined && v !== null)) as T;
}

/** The object without the fields that hold no value: none, false, an empty text or an empty list. */
export function present<T extends object>(value: T): T {
	const empty = (v: unknown) => v === undefined || v === null || v === false || v === "" || (Array.isArray(v) && v.length === 0);
	return Object.fromEntries(Object.entries(value).filter(([, v]) => !empty(v))) as T;
}

/**
 * A task's key as an opaque ref: its parts as JSON, the bytes in hex, so no list's name shows in it. The task's id is left
 * out: it lives only while one run of the core does.
 */
export function refOf(key: TaskKey): string {
	return [...utf8(JSON.stringify([key.section, key.index, key.path, key.raw]))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SECTIONS: readonly SectionKey[] = ["inbox", "now", "soon", "backlog", "done"];

/** The key a ref holds; null for text that is no ref. */
export function keyOfRef(ref: string): TaskKey | null {
	if (!/^(?:[0-9a-f]{2})+$/.test(ref)) return null;
	try {
		const bytes = ref.match(/../g)!.map((pair) => parseInt(pair, 16));
		const parts: unknown = JSON.parse(fromUtf8(bytes));
		if (!Array.isArray(parts) || parts.length !== 4) return null;
		const [section, index, path, raw] = parts as [unknown, unknown, unknown, unknown];
		if (!SECTIONS.includes(section as SectionKey) || !Number.isInteger(index) || typeof raw !== "string") return null;
		if (!Array.isArray(path) || !path.every((i) => Number.isInteger(i))) return null;
		return { section: section as SectionKey, index: index as number, path: path as number[], raw };
	} catch {
		return null;
	}
}

function utf8(text: string): number[] {
	return [...unescape(encodeURIComponent(text))].map((ch) => ch.charCodeAt(0));
}

function fromUtf8(bytes: readonly number[]): string {
	return decodeURIComponent(escape(String.fromCharCode(...bytes)));
}
