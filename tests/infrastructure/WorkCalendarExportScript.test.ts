import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkCalendarExportScript, type ExportScriptAdapter } from "../../src/infrastructure/WorkCalendarExportScript";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";

const PLUGIN_DIR = ".obsidian/plugins/task-calendar";
const EXPORT = `${PLUGIN_DIR}/work-calendar-export.js`;
const VAULT = "/private/var/mobile/Obsidian/Vault";

class FakeAdapter implements ExportScriptAdapter {
	readonly writes: string[] = [];
	constructor(readonly files: Map<string, string> = new Map()) {}
	async exists(path: string): Promise<boolean> {
		return this.files.has(path);
	}
	async read(path: string): Promise<string> {
		return this.files.get(path) ?? "";
	}
	async write(path: string, data: string): Promise<void> {
		this.writes.push(path);
		this.files.set(path, data);
	}
}

function script(workCalendarFile = "calendar/work.json", adapter = new FakeAdapter()) {
	const settings = new FakeSettingsStore({ ...DEFAULT_SETTINGS, workCalendarFile });
	return { export: new WorkCalendarExportScript(adapter, PLUGIN_DIR, settings), settings, adapter };
}

interface FakeEvent {
	identifier: string;
	title: string;
	startDate: Date;
	endDate: Date;
	isAllDay: boolean;
	location: string | null;
	calendar: { title: string; color: { hex: string } };
	attendees: { isCurrentUser: boolean; status: string }[] | null;
}

function event(over: Partial<FakeEvent> = {}): FakeEvent {
	return {
		identifier: "standup",
		title: "Standup",
		startDate: new Date(2026, 9, 30, 10),
		endDate: new Date(2026, 9, 30, 10, 15),
		isAllDay: false,
		location: null,
		calendar: { title: "Work", color: { hex: "1BADF8" } },
		attendees: null,
		...over,
	};
}

/** Scriptable's globals over a folder in memory: what the loader and the export touch. */
function scriptable(files: Map<string, string>, events: FakeEvent[], bookmarks = new Map([["ObsidianVault", VAULT]])) {
	const asked: { start: Date; end: Date }[] = [];
	vi.stubGlobal("FileManager", {
		local: () => ({
			bookmarkExists: (name: string) => bookmarks.has(name),
			bookmarkedPath: (name: string) => bookmarks.get(name),
			joinPath: (a: string, b: string) => `${a}/${b}`,
			fileExists: (path: string) => files.has(path) || [...files.keys()].some((f) => f.startsWith(`${path}/`)),
			readString: (path: string) => files.get(path),
			writeString: (path: string, text: string) => files.set(path, text),
			createDirectory: () => undefined,
		}),
	});
	vi.stubGlobal("CalendarEvent", {
		between: async (start: Date, end: Date) => {
			asked.push({ start, end });
			return events;
		},
	});
	vi.stubGlobal("Device", { name: () => "iPhone" });
	vi.stubGlobal("config", { runsInApp: false });
	vi.stubGlobal("Script", { complete: () => undefined });
	return asked;
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (...args: string[]) => () => Promise<void>;

async function runInScriptable(loader: string): Promise<void> {
	await new AsyncFunction(loader)();
}

async function exported(files: Map<string, string>, path = `${VAULT}/calendar/work.json`) {
	return JSON.parse(files.get(path) ?? "null") as { device: string; events: { id: string; color: string; calendar: string; location: string | null }[] };
}

describe("WorkCalendarExportScript", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("writes the export into the plugin's folder with the work file path from the settings", async () => {
		const { export: s, adapter } = script("work/events.json");
		await s.install();
		expect(adapter.files.get(EXPORT)).toMatch(/^const OUTPUT = "work\/events\.json";\n/);
	});

	it("leaves an export that is already current alone", async () => {
		const { export: s, adapter } = script();
		await s.install();
		await s.install();
		expect(adapter.writes).toHaveLength(1);
	});

	it("rewrites the export when the work file path changes, and stops when unsubscribed", async () => {
		const { export: s, adapter, settings } = script();
		const stop = s.keepInstalled();
		await settings.update({ workCalendarFile: "other.json" });
		await s.install();
		expect(adapter.files.get(EXPORT)).toMatch(/^const OUTPUT = "other\.json";/);
		stop();
		await settings.update({ workCalendarFile: "third.json" });
		await new Promise((resolve) => setTimeout(resolve));
		expect(adapter.files.get(EXPORT)).toMatch(/^const OUTPUT = "other\.json";/);
	});

	it("gives a loader that finds the export in the plugin's own folder", () => {
		const settings = new FakeSettingsStore();
		const s = new WorkCalendarExportScript(new FakeAdapter(), "config/plugins/task-calendar", settings);
		expect(s.loader).toContain(`"config/plugins/task-calendar/work-calendar-export.js"`);
	});

	describe("run in Scriptable", () => {
		async function setUp(events: FakeEvent[]) {
			const { export: s, adapter } = script();
			await s.install();
			const files = new Map([[`${VAULT}/${EXPORT}`, adapter.files.get(EXPORT) ?? ""]]);
			const asked = scriptable(files, events);
			return { files, asked, loader: s.loader };
		}

		it("writes the phone's events into the work file", async () => {
			const { files, loader } = await setUp([event(), event({ identifier: "1:1", title: "1:1", location: "Room 4" })]);
			await runInScriptable(loader);
			const file = await exported(files);
			expect(file.device).toBe("iPhone");
			expect(file.events.map((e) => e.calendar)).toEqual(["Work", "Work"]);
			expect(file.events[1].location).toBe("Room 4");
		});

		it("asks for yesterday through two weeks ahead, so every day the timeline opens nearby has its events", async () => {
			const { asked, loader } = await setUp([]);
			vi.useFakeTimers({ now: new Date(2026, 9, 30, 2, 30), toFake: ["Date"] });
			await runInScriptable(loader);
			vi.useRealTimers();
			expect(asked).toEqual([{ start: new Date(2026, 9, 29), end: new Date(2026, 10, 14) }]);
		});

		it("gives each occurrence of a repeating event its own id", async () => {
			const tomorrow = { startDate: new Date(2026, 9, 31, 10), endDate: new Date(2026, 9, 31, 10, 15) };
			const { files, loader } = await setUp([event(), event(tomorrow)]);
			await runInScriptable(loader);
			const ids = (await exported(files)).events.map((e) => e.id);
			expect(new Set(ids).size).toBe(2);
		});

		it("leaves out the meetings I declined", async () => {
			const declined = event({ title: "Declined", attendees: [{ isCurrentUser: true, status: "declined" }, { isCurrentUser: false, status: "accepted" }] });
			const othersDeclined = event({ title: "Kept", attendees: [{ isCurrentUser: true, status: "accepted" }, { isCurrentUser: false, status: "declined" }] });
			const { files, loader } = await setUp([declined, othersDeclined]);
			await runInScriptable(loader);
			expect((await exported(files)).events).toHaveLength(1);
		});

		it("writes calendar colours as #RRGGBB whether Scriptable gives the # or not", async () => {
			const { files, loader } = await setUp([event(), event({ calendar: { title: "Home", color: { hex: "#FF9500" } } })]);
			await runInScriptable(loader);
			expect((await exported(files)).events.map((e) => e.color)).toEqual(["#1BADF8", "#FF9500"]);
		});

		it("says what to do when the vault bookmark is missing", async () => {
			const { loader } = await setUp([]);
			scriptable(new Map(), [], new Map());
			await expect(runInScriptable(loader)).rejects.toThrow(/ObsidianVault/);
		});

		it("says what to do when the plugin has not written the export yet", async () => {
			const { loader } = await setUp([]);
			scriptable(new Map(), []);
			await expect(runInScriptable(loader)).rejects.toThrow(/Obsidian/);
		});
	});
});
