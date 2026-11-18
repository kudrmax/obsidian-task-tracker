import { composeCore, type Core, type CorePorts } from "../../core/application/composeCore";
import { ScreenSettingsImpl } from "../../core/application/ScreenSettingsImpl";
import type { Clock } from "../../core/application/contracts";
import { FakeSettingsStore } from "../../tests/fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../../tests/fakes/InMemoryTaskFileStore";
import type { ScreenServices } from "../ui/engine/screenStore";
import { ShownSettingsStore, type ViewSettings, ViewSettingsStore } from "../ui/viewSettings";
import { mockTasks } from "./mockTasks";
import { StandCalendars } from "./StandCalendars";

/** The write delays the stand offers: none, a real write and read-back, a slow one. */
export const WRITE_DELAYS = [0, 30, 300] as const;
export type WriteDelay = (typeof WRITE_DELAYS)[number];

/** The stand's clock: the real time, or a moment it is set to (a scenario's, for a day that reads the same every run). */
export class StandClock implements Clock {
	private at: Date | null = null;

	now(): Date {
		return this.at ? new Date(this.at) : new Date();
	}

	set(at: Date | null): void {
		this.at = at;
	}
}

/** The tasks file in memory, each write held back `delay` ms first, as a real write and its read-back take time. */
class DelayedFile extends InMemoryTaskFileStore {
	delay: WriteDelay = 30;

	override async write(fn: (text: string) => string): Promise<void> {
		if (this.delay > 0) await new Promise((resolve) => window.setTimeout(resolve, this.delay));
		return super.write(fn);
	}
}

/** What the stand's commands and the checks reach: the services, the made-up file, the clock and the delay. */
export interface Stand {
	readonly services: ScreenServices;
	readonly core: Core;
	readonly clock: StandClock;
	/** The tasks file's text as it stands now: what the checks read as the user's truth. */
	fileText(): string | null;
	/** Replaces the file's text (null: no file), as an edit from outside would. */
	setFileText(text: string | null): void;
	/** New made-up tasks around the clock's now. */
	reset(): void;
	readonly delay: WriteDelay;
	setDelay(delay: WriteDelay): void;
}

/**
 * The real core (`composeCore`) over a tasks file in memory, the stand's clock and made-up calendars: the same services
 * the plugin composes over the vault, so the engine runs on the real rules from its first day.
 */
export function composeStand(): Stand {
	const clock = new StandClock();
	const file = new DelayedFile(mockTasks(clock.now()));
	const settings = new FakeSettingsStore();
	const ports: CorePorts = {
		tasksFile: file,
		settings,
		clock,
		ticker: { every: (ms, tick) => {
			const id = window.setInterval(tick, ms);
			return () => window.clearInterval(id);
		} },
		timers: { set: (fn, ms) => window.setTimeout(fn, ms), clear: (id) => window.clearTimeout(id) },
		calendarFiles: { google: noFile("google"), iphone: noFile("iphone"), work: noFile("work") },
		feeds: [],
		work: { export: async () => undefined },
		isPhone: () => false,
	};
	const core = composeCore(ports);
	let view: Partial<ViewSettings> = {};
	const viewListeners = new Set<() => void>();
	const viewFile = {
		get: () => view as ViewSettings,
		update: async (patch: Partial<ViewSettings>) => {
			view = { ...view, ...patch };
			viewListeners.forEach((listener) => listener());
		},
		onChange: (listener: () => void) => {
			viewListeners.add(listener);
			return () => viewListeners.delete(listener);
		},
	};
	const calendars = new StandCalendars(clock, () => core.days.today());
	const services: ScreenServices = { tasks: core.tasks, days: core.days, undo: core.undo, calendars, clock, settings: new ShownSettingsStore(new ScreenSettingsImpl(settings), new ViewSettingsStore(viewFile)) };
	return {
		services,
		core,
		clock,
		fileText: () => file.text,
		setFileText(text) {
			file.text = text;
			file.emitChange();
		},
		reset() {
			file.text = mockTasks(clock.now());
			file.emitChange();
		},
		get delay() {
			return file.delay;
		},
		setDelay(delay) {
			file.delay = delay;
		},
	};
}

/** A calendar file the stand has none of: the made-up calendars stand in for every source. */
function noFile(name: "google" | "iphone" | "work") {
	return { name, read: () => Promise.reject(new Error(`the stand has no ${name} calendar file`)), onChange: () => () => undefined };
}
