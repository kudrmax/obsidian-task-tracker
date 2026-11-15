import type { EventRef, TAbstractFile, TFile } from "obsidian";
import type { ScreenView, TaskItem } from "../../core/application/contracts";
import type { Clock } from "../../core/application/ports";
import { LocalProjectsScreenStore } from "../../obsidian/infrastructure/LocalProjectsScreenStore";
import { PluginSettings, type SettingsPersistence } from "../../obsidian/infrastructure/PluginSettings";
import type { RuntimeEvent } from "../../obsidian/runtime/events";
import type { CalendarFeed } from "../../obsidian/runtime/network/CalendarLane";
import { ObsidianTasksVault, type ObsidianVault } from "../../obsidian/runtime/persistence/TasksVault";
import { Runtime } from "../../obsidian/runtime/Runtime";
import { SETTINGS_FILE, type StoredSettings } from "../../obsidian/settingsFile";
import { FakeTimers } from "../fakes/FakeTimers";

export const PATH = "TODOs Tasks.md";
export const DAY = "2026-11-15";
export const FILE = [
	"## Inbox",
	"",
	"- [ ] Idea",
	"- [ ] Call the bank",
	"",
	"## Projects",
	"",
	"- Дружба",
	"\t- Small talk",
	"",
	"## Now",
	"",
	"- [ ] Parent",
	"\t- [ ] Child",
	"### Errands",
	"- [ ] Shop",
	"",
	"## Soon",
	"",
	"## Backlog",
	"",
	"## Done",
	"",
].join("\n");

type Listener = (file: TAbstractFile, oldPath: string) => void;

/**
 * Obsidian's vault as the runtime uses it, in memory: a `TFile` follows a rename, `process` reads and writes in one step
 * (after `gate`, and after a hook that stands for another device writing in between) and, as Obsidian does, writes and
 * tells whatever `fn` answers, the same text too; every change is an event.
 */
export class MemoryObsidianVault implements ObsidianVault {
	private readonly texts = new Map<TFile, string>();
	private readonly listeners = new Map<EventRef, { name: string; callback: Listener }>();
	readonly between: (() => void)[] = [];
	readonly written: string[] = [];
	gate: Promise<void> | null = null;
	private open: (() => void) | null = null;

	getFileByPath(path: string): TFile | null {
		return [...this.texts.keys()].find((f) => f.path === path) ?? null;
	}

	text(path: string): string | undefined {
		const file = this.getFileByPath(path);
		return file ? this.texts.get(file) : undefined;
	}

	/** While set, a read takes the text as it is when asked and answers once the gate opens: a slow disk. */
	readGate: Promise<void> | null = null;
	/** Every change event told, by kind. */
	readonly told: string[] = [];

	async read(file: TFile): Promise<string> {
		const text = this.texts.get(file)!;
		if (this.readGate) await this.readGate;
		return text;
	}

	async process(file: TFile, fn: (data: string) => string): Promise<string> {
		if (this.gate) await this.gate;
		this.between.shift()?.();
		const next = fn(this.texts.get(file)!);
		this.texts.set(file, next);
		this.written.push(next);
		this.emit("modify", file);
		return next;
	}

	async create(path: string, data: string): Promise<TFile> {
		if (this.getFileByPath(path)) throw new Error("File already exists.");
		const file = { path } as TFile;
		this.texts.set(file, data);
		this.emit("create", file);
		return file;
	}

	on(name: "modify" | "create" | "delete" | "rename", callback: Listener): EventRef {
		const ref = {} as EventRef;
		this.listeners.set(ref, { name, callback });
		return ref;
	}

	offref(ref: EventRef): void {
		this.listeners.delete(ref);
	}

	get listenerCount(): number {
		return this.listeners.size;
	}

	/** Another device (Sync, an agent) writes the file. */
	outside(path: string, text: string, tell = true): void {
		const file = this.getFileByPath(path);
		if (!file) {
			const made = { path } as TFile;
			this.texts.set(made, text);
			if (tell) this.emit("create", made);
			return;
		}
		this.texts.set(file, text);
		if (tell) this.emit("modify", file);
	}

	rename(from: string, to: string): void {
		const file = this.getFileByPath(from)!;
		(file as { path: string }).path = to;
		this.emit("rename", file, from);
	}

	hold(): void {
		this.gate = new Promise((resolve) => (this.open = resolve));
	}

	release(): void {
		this.gate = null;
		this.open?.();
	}

	private emit(name: string, file: TFile, oldPath?: string): void {
		this.told.push(name);
		for (const l of [...this.listeners.values()]) if (l.name === name) l.callback(file as TAbstractFile, oldPath ?? "");
	}
}

/** data.json and the device's storage, in memory. */
export class MemorySettingsHost implements SettingsPersistence {
	file: Record<string, unknown> = {};
	readonly local = new Map<string, unknown>();
	async loadData(): Promise<unknown> {
		return structuredClone(this.file);
	}
	async saveData(data: unknown): Promise<void> {
		this.file = structuredClone(data) as Record<string, unknown>;
	}
	loadLocalStorage(key: string): unknown {
		return this.local.get(key) ?? null;
	}
	saveLocalStorage(key: string, data: unknown): void {
		this.local.set(key, data);
	}
}

export class ManualClock implements Clock {
	constructor(public ms = new Date(2026, 10, 15, 12, 0).getTime()) {}
	now(): Date {
		return new Date(this.ms);
	}
}

export interface Harness {
	readonly runtime: Runtime<StoredSettings>;
	readonly vault: MemoryObsidianVault;
	readonly host: MemorySettingsHost;
	readonly settings: PluginSettings<StoredSettings>;
	readonly screens: LocalProjectsScreenStore;
	readonly timers: FakeTimers;
	readonly clock: ManualClock;
	readonly notices: string[];
	readonly events: RuntimeEvent[];
	/** A calendar file changed in the vault (an export, another device). */
	readonly calendarChanged: (path: string) => void;
	/** How many times the phone's export was asked. */
	readonly exports: () => number;
}

export interface HarnessOptions {
	readonly file?: string | null;
	readonly feeds?: readonly CalendarFeed[];
	readonly calendarTexts?: Map<string, string>;
	/** The calendar files' reads, when a test holds or fails them. */
	readonly readCalendar?: (path: string) => Promise<string | null>;
	readonly projects?: { list(): []; ready(): boolean; onChange(listener: () => void): () => void };
	readonly clock?: ManualClock;
	readonly ready?: boolean;
}

/** A runtime over a vault holding `file` at `PATH`, built (unless `ready: false`). */
export async function harness(options: HarnessOptions = {}): Promise<Harness> {
	const vault = new MemoryObsidianVault();
	const file = options.file === undefined ? FILE : options.file;
	if (file !== null) vault.outside(PATH, file, false);
	const host = new MemorySettingsHost();
	const settings = new PluginSettings(host, "data.json", SETTINGS_FILE);
	await settings.load();
	const screens = new LocalProjectsScreenStore(host);
	const timers = new FakeTimers();
	const clock = options.clock ?? new ManualClock();
	const notices: string[] = [];
	const texts = options.calendarTexts ?? new Map<string, string>();
	const calendarListeners = new Set<(path: string) => void>();
	let exports = 0;
	const runtime = new Runtime<StoredSettings>({
		vault: new ObsidianTasksVault(vault),
		settings,
		projectsScreen: screens,
		projects: options.projects ?? { list: () => [], ready: () => true, onChange: () => () => undefined },
		isIosApp: false,
		feeds: options.feeds ?? [],
		calendarTexts: {
			read: options.readCalendar ?? (async (path) => texts.get(path) ?? null),
			watch: (listener) => {
				calendarListeners.add(listener);
				return () => calendarListeners.delete(listener);
			},
		},
		work: { export: () => void exports++ },
		clock,
		timers,
		notices: { show: (text) => notices.push(text) },
	});
	const events: RuntimeEvent[] = [];
	runtime.subscribe((e) => e && events.push(e));
	if (options.ready !== false) {
		runtime.hostReady("layout");
		runtime.hostReady("metadata");
		await runtime.ready();
		await settle(runtime);
	}
	const calendarChanged = (path: string) => calendarListeners.forEach((l) => l(path));
	return { runtime, vault, host, settings, screens, timers, clock, notices, events, calendarChanged, exports: () => exports };
}

/** Every write and read the runtime started has landed. */
export async function settle(runtime: Runtime<StoredSettings>): Promise<void> {
	for (let i = 0; i < 3; i++) {
		for (let j = 0; j < 10; j++) await new Promise((resolve) => setTimeout(resolve, 0));
		await runtime.persisted();
	}
}

const flat = (items: readonly TaskItem[]): TaskItem[] => items.flatMap((i) => [i, ...flat(i.allSubtasks)]);

export function screenOf(runtime: Runtime<StoredSettings>, day = DAY): ScreenView {
	const answer = runtime.read("tasks.screen", [day]);
	if (!answer.ok) throw new Error(answer.error.message);
	return answer.result as ScreenView;
}

/** Every task the screen shows, by title. */
export function itemOf(runtime: Runtime<StoredSettings>, title: string, day = DAY): TaskItem {
	const screen = screenOf(runtime, day);
	const found = flat([...screen.inbox, ...screen.day.list, ...screen.soon, ...screen.backlog, ...screen.done]).find((i) => i.title === title);
	if (!found) throw new Error(`no task ${title}`);
	return found;
}

export function ok(answer: { ok: boolean; result?: unknown; error?: { message: string } }): unknown {
	if (!answer.ok) throw new Error(answer.error!.message);
	return answer.result;
}
