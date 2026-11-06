import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const BUNDLE = "core/task-calendar-phone.js";
const committed = readFileSync(BUNDLE, "utf8");

interface Phone {
	reminders(text: string, settingsJson: string, nowMs: number): { id: string; kind: string; startMs: number; dayEndMs: number }[];
	complete(text: string, settingsJson: string, id: string, nowMs: number): { changed: boolean; text?: string };
	silence(text: string, settingsJson: string, id: string, nowMs: number): { changed: boolean; text?: string };
	snooze(text: string, settingsJson: string, id: string, minutes: number, nowMs: number): { changed: boolean; text?: string };
	calendarFiles(settingsJson: string): string[];
	meetings(settingsJson: string, texts: (string | null)[], fromMs: number, toMs: number, nowMs: number): { title: string; startMs: number; endMs: number }[];
	capture(text: string, settingsJson: string, list: string, title: string, nowMs: number): { changed: boolean; text?: string };
	call(method: string, argsJson: string, contextJson: string): string;
	methods(): string[];
	tasksFile(settingsJson: string): string | null;
	iphoneCalendarFile(): string;
	iphoneCalendarText(exportJson: string): string;
	iphoneCalendarAdds(newText: string, oldText: string | null, nowMs: number): boolean;
	settingsFile(): string;
	oneLine(text: string): string;
}

describe(BUNDLE, () => {
	it("is the build of core/phone: run `node core/build.mjs` after changing it", () => {
		expect(execFileSync("node", ["core/build.mjs", "--stdout"], { encoding: "utf8" })).toBe(committed);
	});

	it("needs nothing but the language: no modules, no Obsidian", () => {
		expect(committed).not.toMatch(/\brequire\(|^import |from "obsidian"/m);
		expect(committed).not.toMatch(/\b(setTimeout|clearTimeout|setInterval|clearInterval|requestAnimationFrame|fetch)\(|\b(window|document)\./);
	});

	it("every function runs on its own, with nothing of the host: no timers, no window, no fetch", () => {
		const sandbox: { TaskCalendarPhone?: Phone } = {};
		runInNewContext(committed, sandbox);
		const phone = sandbox.TaskCalendarPhone!;
		expect(Object.keys(phone).sort()).toEqual(["calendarFiles", "call", "capture", "complete", "iphoneCalendarAdds", "iphoneCalendarFile", "iphoneCalendarText", "meetings", "methods", "oneLine", "reminders", "settingsFile", "silence", "snooze", "tasksFile"]);
		const line = "- [ ] A 🚨 2026-11-04 10:00";
		const text = `## Now\n\n${line}\n`;
		const now = new Date(2026, 10, 4, 9).getTime();
		const [r] = phone.reminders(text, "", now);
		expect(r).toMatchObject({ id: line, kind: "alarm", startMs: new Date(2026, 10, 4, 10).getTime() });
		expect(phone.complete(text, "", line, now).text).toContain("- [x] A");
		expect(phone.silence(text, "", line, now).text).not.toContain("🚨");
		expect(phone.snooze(text, "", line, 15, now).text).toContain("- [ ] A 🚨 2026-11-04 09:15");
		expect(phone.capture(text, "", "inbox", "B", now).text).toMatch(/## Inbox\n+- \[ \] B/);
		expect(phone.settingsFile()).toBe(".obsidian/plugins/task-calendar/data.json");
		expect(phone.calendarFiles("")).toEqual(["calendar/google.json", "calendar/iphone.json", "calendar/work.json"]);
		const at = (hour: number) => new Date(2026, 10, 4, hour).toISOString();
		const work = JSON.stringify({ exportedAt: at(8), events: [{ id: "s", title: "Standup", start: at(10), end: at(11), allDay: false, calendar: "Work" }] });
		expect(phone.meetings("", [null, null, work], now, new Date(2026, 10, 4, 18).getTime(), now)).toEqual([
			{ title: "Standup", startMs: new Date(2026, 10, 4, 10).getTime(), endMs: new Date(2026, 10, 4, 11).getTime() },
		]);
	});

	it("captures a title with a line break as one task line", () => {
		const sandbox: { TaskCalendarPhone?: Phone } = {};
		runInNewContext(committed, sandbox);
		const now = new Date(2026, 10, 4, 9).getTime();
		const written = sandbox.TaskCalendarPhone!.capture("## Inbox\n\n## Now\n", "", "inbox", "Купить\r\nмолоко\u2028и хлеб", now).text!;
		expect(written).toMatch(/## Inbox\n+- \[ \] Купить молоко и хлеб\n/);
	});

	it("answers every service call through one door, in JSON: a read, a write with the text to write back, an error by its code", () => {
		const sandbox: { TaskCalendarPhone?: Phone } = {};
		runInNewContext(committed, sandbox);
		const phone = sandbox.TaskCalendarPhone!;
		const now = new Date(2026, 10, 4, 9).getTime();
		const context = (tasks: string | null) => JSON.stringify({ tasks, settings: "", nowMs: now });
		const text = "## Now\n\n- [ ] A\n";
		const screen = JSON.parse(phone.call("tasks.screen", '["2026-11-04"]', context(text)));
		expect(screen).toMatchObject({ ok: true, result: { day: { list: [{ text: "A" }] }, missing: false } });
		expect(screen.tasks).toBeUndefined();
		const key = screen.result.day.list[0].key;
		const done = JSON.parse(phone.call("tasks.setStatus", JSON.stringify([key, "done"]), context(text)));
		expect(done).toMatchObject({ ok: true, result: null, step: true, tasks: expect.stringContaining("- [x] A") });
		expect(JSON.parse(phone.call("tasks.setStatus", JSON.stringify([key, "done"]), context(null)))).toMatchObject({ ok: false, error: { code: "tasksFileMissing" } });
		expect(JSON.parse(phone.call("tasks.nothing", "[]", context(text)))).toMatchObject({ ok: false, error: { code: "unknownMethod" } });
		expect(phone.methods()).toContain("entry.enter");
	});

	it("says where the host's files are, writes the phone's calendars and keeps a title on one line", () => {
		const sandbox: { TaskCalendarPhone?: Phone } = {};
		runInNewContext(committed, sandbox);
		const phone = sandbox.TaskCalendarPhone!;
		expect(phone.tasksFile("")).toBe("TODOs Tasks.md");
		expect(phone.tasksFile(JSON.stringify({ tasksFile: "Work/Tasks.md" }))).toBe("Work/Tasks.md");
		expect(phone.tasksFile(JSON.stringify({ tasksFile: " " }))).toBeNull();
		expect(phone.iphoneCalendarFile()).toBe("calendar/iphone.json");
		const at = (h: number) => new Date(Date.UTC(2026, 10, 4, h)).getTime();
		const file = JSON.parse(
			phone.iphoneCalendarText(
				JSON.stringify({
					calendars: [{ title: "Personal", calendarId: "ek-p", account: "Gmail", color: "#FF0000", sourceId: "s1" }],
					events: [{ id: "e", title: "Lunch", startMs: at(12), endMs: at(13), allDay: false, calendarId: "ek-p" }],
					fromMs: at(0),
					toMs: at(24),
					exportedAtMs: at(8),
					device: "iPhone",
					validUntilMs: null,
				}),
			),
		);
		expect(file).toEqual({
			exportedAt: "2026-11-04T08:00:00.000Z",
			device: "iPhone",
			from: "2026-11-04T00:00:00.000Z",
			to: "2026-11-05T00:00:00.000Z",
			validUntil: null,
			calendars: [{ calendar: "Personal", calendarId: "ek-p", account: "Gmail", color: "#FF0000", sourceId: "s1" }],
			events: [{ id: "e", title: "Lunch", start: "2026-11-04T12:00:00.000Z", end: "2026-11-04T13:00:00.000Z", allDay: false, calendar: "Personal", calendarId: "ek-p", account: "Gmail", color: "#FF0000" }],
		});
		expect(phone.oneLine("Купить\r\nмолоко")).toBe("Купить молоко");
	});
});
