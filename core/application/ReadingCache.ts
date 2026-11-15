import type { LineIds, TaskDocument } from "../domain/TaskDocument";
import type { LocalDate } from "../domain/Task";
import { settingsFrom, type TaskCalendarSettings } from "../settings";
import type { TaskIdState } from "./TaskIdentity";

/** A text as one reading has it: parsed, with every section, and tidied for the day; and whether tidying changes the file. */
export interface TextReading {
	readonly parsed: TaskDocument;
	readonly whole: TaskDocument;
	readonly tidied: TaskDocument;
	readonly changed: boolean;
}

/** What `TaskIdentity.of` settled on for a reading from a state: the state after, whether it changed, and the reading's ids. */
export interface SettledIds {
	readonly state: TaskIdState;
	readonly changed: boolean;
	readonly ids: LineIds;
}

interface ReadingEntry {
	readonly text: string;
	readonly reading: string;
	readonly today: LocalDate;
	readonly notes: string;
	readonly value: TextReading;
}

interface IdsEntry {
	readonly from: TaskIdState;
	readonly settled: SettledIds;
}

/**
 * What the door's calls share across calls, so a call over a text and settings it saw before does not read them again:
 * the settings parsed from `data.json`, the text read for a day under a reading of the settings, the ids an identity
 * settled on for a reading, and the reading retagged with them. Every entry is found only by everything its value was
 * made of, so it answers exactly what reading anew would. Each kind keeps a few entries, the latest first.
 */
export class ReadingCache {
	private readonly settingsTexts: { readonly text: string; readonly value: TaskCalendarSettings }[] = [];
	private readonly readings: ReadingEntry[] = [];
	private readonly settledIds = new WeakMap<TaskDocument, IdsEntry[]>();
	private readonly retaggedDocs = new WeakMap<TaskDocument, { readonly ids: LineIds; readonly doc: TaskDocument }[]>();
	private readonly keys = new WeakMap<object, string>();
	private readonly derived = new WeakMap<object, Map<string, unknown>>();

	constructor(private readonly size = 6) {}

	/** The plugin's settings from its `data.json`, or the defaults for nothing; frozen, as the calls share them. */
	settings(json: string): TaskCalendarSettings {
		const kept = this.settingsTexts.find((e) => e.text === json);
		if (kept) return kept.value;
		const value = deepFreeze(settingsFrom(json.trim() === "" ? null : JSON.parse(json)));
		this.keep(this.settingsTexts, { text: json, value });
		return value;
	}

	/** The text read for `today` under the reading `reading` with the notes `notes`, made by `make` the first time. */
	reading(text: string, reading: string, today: LocalDate, notes: string, make: () => TextReading): TextReading {
		const kept = this.readings.find((e) => e.text === text && e.reading === reading && e.today === today && e.notes === notes);
		if (kept) return kept.value;
		const value = make();
		this.keep(this.readings, { text, reading, today, notes, value });
		return value;
	}

	/** What an identity in `from` settles on reading `doc`, made by `make` the first time. */
	settled(doc: TaskDocument, from: TaskIdState, make: () => SettledIds): SettledIds {
		const entries = this.settledIds.get(doc) ?? [];
		const kept = entries.find((e) => sameIdState(e.from, from));
		if (kept) return kept.settled;
		const settled = make();
		this.keep(entries, { from, settled });
		this.settledIds.set(doc, entries);
		return settled;
	}

	/** `doc` retagged by `ids`, made once for the same ids. */
	retagged(doc: TaskDocument, ids: LineIds): TaskDocument {
		const entries = this.retaggedDocs.get(doc) ?? [];
		const kept = entries.find((e) => e.ids === ids);
		if (kept) return kept.doc;
		const tagged = doc.retagged(ids);
		this.keep(entries, { ids, doc: tagged });
		this.retaggedDocs.set(doc, entries);
		return tagged;
	}

	/** What `make` derives from `owner` under the name `slot`, made once for the same object. */
	memo<T>(owner: object, slot: string, make: () => T): T {
		let slots = this.derived.get(owner);
		if (slots === undefined) this.derived.set(owner, (slots = new Map()));
		if (slots.has(slot)) return slots.get(slot) as T;
		const value = make();
		slots.set(slot, value);
		return value;
	}

	/** A value's JSON, made once for the same object. */
	keyOf(value: object): string {
		const kept = this.keys.get(value);
		if (kept !== undefined) return kept;
		const key = JSON.stringify(value);
		this.keys.set(value, key);
		return key;
	}

	private keep<T>(entries: T[], entry: T): void {
		entries.unshift(entry);
		if (entries.length > this.size) entries.length = this.size;
	}
}

/** Two states of the ids alike, line by line: a state that crossed JSON is another object with the same content. */
export function sameIdState(a: TaskIdState, b: TaskIdState): boolean {
	if (a === b) return true;
	if (a.next !== b.next || a.lines.length !== b.lines.length) return false;
	for (let i = 0; i < a.lines.length; i++) {
		const x = a.lines[i];
		const y = b.lines[i];
		if (x.id !== y.id || x.raw !== y.raw || x.task !== y.task) return false;
	}
	const ah = a.held ?? {};
	const bh = b.held ?? {};
	const keys = Object.keys(ah);
	if (keys.length !== Object.keys(bh).length) return false;
	for (const key of keys) {
		const x = ah[key];
		const y = bh[key];
		if (y === undefined || x.length !== y.length || x.some((raw, i) => raw !== y[i])) return false;
	}
	return true;
}

function deepFreeze<T>(value: T): T {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const v of Object.values(value)) deepFreeze(v);
	}
	return value;
}
