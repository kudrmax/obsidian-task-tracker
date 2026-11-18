import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { type CalendarFile, calendarPath, readCalendarFile } from "../core/application/calendarFile";
import { type CalendarSource, type ProjectsScreenState, TasksFileMissingError } from "../core/application/contracts";
import { type EventFile, SourceProblemError } from "../core/application/EventSource";
import type { Projects, ProjectsScreenStore, SettingsStore, TaskFileStore, Ticker, Timers } from "../core/application/ports";
import { DEFAULT_SETTINGS, settingsFrom, type TaskCalendarSettings } from "../core/settings";

/** The program only reads: a write it is asked for is a bug, never a change of Max's files. */
export class ReadOnlyError extends Error {
	constructor(what: string) {
		super(`obsidian-task-calendar reads only: ${what}`);
		this.name = "ReadOnlyError";
	}
}

/** A file's text, null when there is none. */
async function textOf(path: string): Promise<string | null> {
	try {
		return await readFile(path, "utf8");
	} catch (e) {
		if ((e as { code?: string }).code === "ENOENT") return null;
		throw e;
	}
}

/**
 * The tasks file, read once from the disk. The reads tidy it first (a write that is no step): the change is kept in
 * memory, so later reads of the run see the file as the plugin would, and the disk stays as it is.
 */
export class ReadOnlyTaskFile implements TaskFileStore {
	private text: Promise<string | null> | null = null;
	private disk: Promise<string | null> | null = null;

	constructor(private readonly path: string | null) {}

	read(): Promise<string | null> {
		return (this.text ??= this.stored());
	}

	/** The file as the disk has it, whatever the tidy made of it in memory. */
	stored(): Promise<string | null> {
		return (this.disk ??= this.path === null ? Promise.resolve(null) : textOf(this.path));
	}

	async write(fn: (text: string) => string): Promise<void> {
		const text = await this.read();
		if (text === null) throw new TasksFileMissingError(this.path ?? "");
		this.text = Promise.resolve(fn(text));
	}

	async create(): Promise<void> {
		throw new ReadOnlyError("the tasks file is never created");
	}

	onChange(): () => void {
		return () => undefined;
	}
}

/** The plugin's `data.json` as the plugin reads it (`settingsFrom`); without one, the plugin's defaults. Never written. */
export async function settingsAt(path: string): Promise<SettingsStore> {
	const text = await textOf(path);
	const settings: TaskCalendarSettings = text === null ? DEFAULT_SETTINGS : settingsFrom(JSON.parse(text));
	return {
		get: () => settings,
		update: async () => {
			throw new ReadOnlyError("the settings are never written");
		},
		onChange: () => () => undefined,
	};
}

/** A calendar's file in the vault, at the path the settings give it. */
export function calendarFileAt(vault: string, source: CalendarSource, settings: SettingsStore): EventFile {
	return {
		name: source,
		read: async (): Promise<CalendarFile> => {
			const path = join(vault, calendarPath(source, settings.get()));
			const exists = await stat(path).catch(() => null);
			if (!exists) throw new SourceProblemError({ kind: "fileMissing" }, "file missing");
			return readCalendarFile(await readFile(path, "utf8"), source);
		},
		onChange: () => () => undefined,
	};
}

/** Nothing ticks: the program answers once and ends. */
export const NO_TICKS: Ticker = { every: () => () => undefined };

/** Node's one-shot timers, by number, none keeping the process alive. */
export function nodeTimers(): Timers {
	const running = new Map<number, ReturnType<typeof setTimeout>>();
	let next = 1;
	return {
		set: (fn, ms) => {
			const id = next++;
			const timer = setTimeout(() => {
				running.delete(id);
				fn();
			}, ms);
			timer.unref();
			running.set(id, timer);
			return id;
		},
		clear: (id) => {
			clearTimeout(running.get(id));
			running.delete(id);
		},
	};
}

/** No notes here, so the old move to projects never runs from the program: its notes are never ready. */
export const NO_NOTES: Projects = { list: () => [], ready: () => false, onChange: () => () => undefined };

/** The device's Projects state for one run: the Subprojects tick as asked, Done's branch open, nothing folded. */
export function runProjectsScreen(subprojects: boolean): ProjectsScreenStore {
	let state: ProjectsScreenState = { subprojects, doneOpen: true, folded: [] };
	return { get: () => state, set: (next) => (state = next) };
}
