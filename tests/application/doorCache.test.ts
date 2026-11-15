import { describe, expect, it } from "vitest";
import type { ScreenView, TaskItem } from "../../core/application/contracts";
import { callDoor, type DoorAnswer, type DoorContext } from "../../core/application/PhoneCalls";
import { ReadingCache } from "../../core/application/ReadingCache";
import { DEFAULT_ZOOM_LEVELS } from "../../core/application/timelineZoom";
import { DEFAULT_SETTINGS } from "../../core/settings";
import { bigTasksFile } from "./bigTasksFile";

/**
 * The door's cache across calls changes no answer: a host that hands every answer back, through writes, undo, a change
 * of the settings, the next day, an edit made elsewhere and ids that crossed JSON, gets from a door with the cache
 * exactly what a door without one answers, warm or cold, and whatever else the cache saw in between.
 */

const DAY = "2026-11-15";
const NOW = new Date(2026, 10, 15, 9, 30).getTime();
const NEXT_DAY = new Date(2026, 10, 16, 9, 30).getTime();
const AFTER_MIDNIGHT = new Date(2026, 10, 16, 1, 0).getTime();

type Ok = Extract<DoorAnswer, { ok: true }>;

/** A host as the iPhone app is: it keeps what each answer gives back and hands it in with the next call. */
class Host {
	context: DoorContext;
	readonly answers: unknown[] = [];

	constructor(
		tasks: string,
		private readonly cache: ReadingCache | null,
		private readonly json = false,
	) {
		this.context = { tasks, nowMs: NOW, settings: "" };
	}

	call(method: string, args: unknown[] = []): Ok {
		const context = this.json ? (JSON.parse(JSON.stringify(this.context)) as DoorContext) : this.context;
		const answer = callDoor(method, args, context, this.cache);
		this.answers.push({ method, answer });
		if (!answer.ok) throw new Error(`${method}: ${answer.error.message}`);
		this.context = {
			...this.context,
			...(answer.tasks !== undefined && { tasks: answer.tasks }),
			...(answer.history !== undefined && { history: answer.history }),
			...(answer.settings !== undefined && { settings: answer.settings }),
			...(answer.projectsScreen !== undefined && { projectsScreen: answer.projectsScreen }),
			...(answer.ids !== undefined && { ids: answer.ids }),
		};
		return answer;
	}

	set(part: Partial<DoorContext>): void {
		this.context = { ...this.context, ...part };
	}
}

const flat = (items: readonly TaskItem[]): TaskItem[] => items.flatMap((i) => [i, ...flat(i.allSubtasks)]);
const every = (s: ScreenView): TaskItem[] => flat([...s.inbox, ...s.day.list, ...s.day.slotted, ...s.soon, ...s.backlog, ...s.done]);
const titled = (host: Host, day: string, title: string): TaskItem => {
	const item = every(host.call("tasks.screen", [day]).result as ScreenView).find((i) => i.title === title);
	if (!item) throw new Error(`no ${title}`);
	return item;
};

/** A day of a host's calls, each read again so a warm cache answers it too. */
function scenario(host: Host): void {
	const views = (day: string) => {
		for (let i = 0; i < 2; i++) {
			host.call("tasks.funnelView", [true]);
			host.call("tasks.screen", [day]);
			host.call("tasks.projectsScreen", []);
			host.call("tasks.search", ["task"]);
		}
	};
	host.call("tasks.normalize");
	views(DAY);
	host.call("tasks.setStatus", [titled(host, DAY, "Inbox idea number 3 about something to sort later").key, "done"]);
	views(DAY);
	const made = host.call("tasks.createWithId", ["A new one", null, { kind: "list", list: "inbox", group: null, before: null }]);
	views(DAY);
	host.call("tasks.startCarry", [{ keys: [titled(host, DAY, "Backlog item 4 that may happen one day").key] }, false]);
	host.call("tasks.carryAt", [{ edge: true, node: null }, 1000]);
	host.call("tasks.carryAt", [{ edge: true, node: null }, 1400]);
	host.call("tasks.endCarry", ["cancelled"]);
	host.call("history.undo");
	views(DAY);
	host.call("history.redo");
	views(DAY);
	host.call("tasks.rename", [titled(host, DAY, "Errand 2 to run on the way home").key, "Errand two, renamed"]);
	views(DAY);
	host.call("settings.setSection", ["backlog", "Someday"]);
	views(DAY);
	host.call("settings.setDayStartHour", [3]);
	host.set({ nowMs: AFTER_MIDNIGHT });
	views(DAY);
	host.set({ nowMs: NEXT_DAY });
	host.call("tasks.normalize");
	views("2026-11-16");
	host.set({ tasks: `${host.context.tasks}\n- [ ] Written on another device\n`.replace("Inbox idea number 7", "Inbox idea number seven") });
	views("2026-11-16");
	host.call("tasks.setPriority", [titled(host, "2026-11-16", "Inbox idea number seven about something to sort later").key, "p1"]);
	views("2026-11-16");
	host.set({ ids: undefined });
	views("2026-11-16");
	host.call("tasks.remove", [titled(host, "2026-11-16", "A new one").key]);
	expect(made.result).toMatchObject({ id: expect.any(String) });
	views("2026-11-16");
}

const answersOf = (cache: ReadingCache | null, json = false, tasks = bigTasksFile(DAY)): unknown[] => {
	const host = new Host(tasks, cache, json);
	scenario(host);
	return host.answers;
};

describe("the door's cache across calls", () => {
	const without = answersOf(null);

	it("answers every call of a day as the door without it does", () => {
		expect(answersOf(new ReadingCache())).toEqual(without);
	});

	it("answers the same when the host's context crosses JSON each call, as the iPhone app's does", () => {
		expect(answersOf(new ReadingCache(), true)).toEqual(answersOf(null, true));
	});

	it("answers the same the second time over, everything in it already", () => {
		const cache = new ReadingCache();
		answersOf(cache);
		expect(answersOf(cache)).toEqual(without);
	});

	it("never gives one host's file, settings or ids to another: two hosts on one cache, their calls interleaved", () => {
		const cache = new ReadingCache(2);
		const other = bigTasksFile(DAY).replace(/Backlog item/g, "Someday item").replace("Inbox idea number 3", "Inbox idea number 3");
		const a = new Host(bigTasksFile(DAY), cache);
		const b = new Host(other, cache);
		const plainA = new Host(bigTasksFile(DAY), null);
		const plainB = new Host(other, null);
		for (const host of [a, b, plainA, plainB]) host.call("tasks.normalize");
		for (let i = 0; i < 3; i++) {
			for (const [cached, plain] of [[a, plainA], [b, plainB]] as const) {
				expect(cached.call("tasks.screen", [DAY]).result).toEqual(plain.call("tasks.screen", [DAY]).result);
				expect(cached.call("tasks.funnelView", [true])).toEqual(plain.call("tasks.funnelView", [true]));
			}
			const key = (h: Host) => every(h.call("tasks.screen", [DAY]).result as ScreenView)[i].key;
			expect(a.call("tasks.toggleDone", [key(a)])).toEqual(plainA.call("tasks.toggleDone", [key(plainA)]));
		}
	});

	it("reads a file awaiting the move to projects by the notes handed in with it, never by another call's notes", () => {
		const cache = new ReadingCache();
		const text = "## Inbox\n- [ ] Call 🗂️ [[Acme]]\n- [ ] Other\n";
		const acme = [{ name: "Acme", path: "Clients/Acme.md", link: "Acme" }];
		const other = [{ name: "Acme", path: "Old/Acme.md", link: "Old/Acme" }];
		for (const projects of [acme, other, [], acme]) {
			const context: DoorContext = { tasks: text, nowMs: NOW, projects };
			expect(callDoor("tasks.screen", [DAY], context, cache)).toEqual(callDoor("tasks.screen", [DAY], context, null));
		}
	});

	it("reads a list of notes changed in place between two calls as it now is", () => {
		const cache = new ReadingCache();
		const text = "## Inbox\n- [ ] Call 🗂️ [[Acme]]\n- [ ] Other\n";
		const projects: { name: string; path: string; link: string }[] = [];
		const context: DoorContext = { tasks: text, nowMs: NOW, projects };
		expect(callDoor("tasks.normalize", [], context, cache)).toEqual(callDoor("tasks.normalize", [], context, null));
		projects.push({ name: "Acme", path: "Clients/Acme.md", link: "Acme" });
		const answer = callDoor("tasks.normalize", [], context, cache);
		expect(answer).toEqual(callDoor("tasks.normalize", [], context, null));
		expect((answer as Ok).tasks).toContain("- Acme [[Acme]]");
	});

	it("moves the file to projects once the host's notes are complete, over the same text", () => {
		const cache = new ReadingCache();
		const text = "## Inbox\n- [ ] Call 🗂️ [[Acme]]\n- [ ] Other\n";
		const projects = [{ name: "Acme", path: "Clients/Acme.md", link: "Acme" }];
		for (const projectsReady of [false, true, false, true]) {
			const context: DoorContext = { tasks: text, nowMs: NOW, projects, projectsReady };
			expect(callDoor("tasks.normalize", [], context, cache)).toEqual(callDoor("tasks.normalize", [], context, null));
		}
	});

	it("reads ids a host changed in place between two calls as they now are", () => {
		const cache = new ReadingCache();
		const text = bigTasksFile(DAY);
		const first = callDoor("tasks.normalize", [], { tasks: text, nowMs: NOW }, cache) as Ok;
		const ids = JSON.parse(JSON.stringify(first.ids)) as { next: number; lines: { id: string }[] };
		const context: DoorContext = { tasks: first.tasks ?? text, nowMs: NOW, ids: ids as never };
		expect(callDoor("tasks.screen", [DAY], context, cache)).toEqual(callDoor("tasks.screen", [DAY], context, null));
		for (const line of ids.lines) line.id = `${line.id}x`;
		const answer = callDoor("tasks.screen", [DAY], context, cache);
		expect(JSON.stringify(answer)).toMatch(/"id":"t\d+x"/);
		expect(answer).toEqual(callDoor("tasks.screen", [DAY], context, null));
	});

	it("never lets a caller change what it keeps: an answer changed in place leaves the next answer as it would be", () => {
		const cache = new ReadingCache();
		const text = bigTasksFile(DAY);
		const tidy = callDoor("tasks.normalize", [], { tasks: text, nowMs: NOW }, cache) as Ok;
		const context: DoorContext = { tasks: tidy.tasks ?? text, nowMs: NOW, ids: tidy.ids };
		const spoil = (value: unknown, depth = 0): void => {
			if (depth > 6 || value === null || typeof value !== "object") return;
			try {
				if (Array.isArray(value)) value.push("spoilt");
				else (value as Record<string, unknown>).spoilt = true;
			} catch {
				// frozen: it cannot be changed, which is as good
			}
			for (const v of Object.values(value)) spoil(v, depth + 1);
		};
		for (const method of ["tasks.screen", "tasks.funnelView", "tasks.projectsScreen", "screenSettings.get", "settings.form"]) {
			const args = method === "tasks.screen" ? [DAY] : [];
			spoil(callDoor(method, args, context, cache));
			expect({ method, answer: callDoor(method, args, context, cache) }).toEqual({ method, answer: callDoor(method, args, context, null) });
		}
		const screen = (callDoor("tasks.screen", [DAY], context, cache) as Ok).result as ScreenView;
		spoil(callDoor("tasks.setStatus", [screen.inbox[0].key, "done"], context, cache));
		expect(callDoor("tasks.screen", [DAY], context, cache)).toEqual(callDoor("tasks.screen", [DAY], context, null));
	});

	it("freezes copies of the settings, never the defaults every read shares", () => {
		new ReadingCache().settings("");
		expect(Object.isFrozen(DEFAULT_SETTINGS.priorities)).toBe(false);
		expect(Object.isFrozen(DEFAULT_SETTINGS.labels)).toBe(false);
		expect(Object.isFrozen(DEFAULT_SETTINGS.groups.presets)).toBe(false);
		expect(Object.isFrozen(DEFAULT_SETTINGS.google.calendarIds)).toBe(false);
		expect(DEFAULT_ZOOM_LEVELS.some((level) => Object.isFrozen(level))).toBe(false);
	});

	it("keeps a task's id as the door without it does through every call", () => {
		const ids = (answers: unknown[]) => answers.map((a) => (a as { answer: Ok }).answer.ids ?? null);
		expect(ids(answersOf(new ReadingCache()))).toEqual(ids(without));
	});
});
