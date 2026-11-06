import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const BUNDLE = "phone/task-calendar-phone.js";
const committed = readFileSync(BUNDLE, "utf8");

interface Phone {
	reminders(text: string, settingsJson: string, nowMs: number): { id: string; kind: string; startMs: number; dayEndMs: number }[];
	complete(text: string, settingsJson: string, id: string, nowMs: number): { changed: boolean; text?: string };
	silence(text: string, settingsJson: string, id: string, nowMs: number): { changed: boolean; text?: string };
	snooze(text: string, settingsJson: string, id: string, minutes: number, nowMs: number): { changed: boolean; text?: string };
	calendarFiles(settingsJson: string): string[];
	meetings(settingsJson: string, texts: (string | null)[], fromMs: number, toMs: number, nowMs: number): { title: string; startMs: number; endMs: number }[];
	capture(text: string, settingsJson: string, list: string, title: string, nowMs: number): { changed: boolean; text?: string };
}

describe(BUNDLE, () => {
	it("is the build of src/phone: run `node phone/build.mjs` after changing it", () => {
		expect(execFileSync("node", ["phone/build.mjs", "--stdout"], { encoding: "utf8" })).toBe(committed);
	});

	it("needs nothing but the language: no modules, no Obsidian", () => {
		expect(committed).not.toMatch(/\brequire\(|^import |from "obsidian"/m);
		expect(committed).not.toMatch(/\b(setTimeout|clearTimeout|setInterval|clearInterval|requestAnimationFrame|fetch)\(|\b(window|document)\./);
	});

	it("every function runs on its own, with nothing of the host: no timers, no window, no fetch", () => {
		const sandbox: { TaskCalendarPhone?: Phone } = {};
		runInNewContext(committed, sandbox);
		const phone = sandbox.TaskCalendarPhone!;
		expect(Object.keys(phone).sort()).toEqual(["calendarFiles", "capture", "complete", "meetings", "reminders", "silence", "snooze"]);
		const line = "- [ ] A 🚨 2026-11-04 10:00";
		const text = `## Now\n\n${line}\n`;
		const now = new Date(2026, 10, 4, 9).getTime();
		const [r] = phone.reminders(text, "", now);
		expect(r).toMatchObject({ id: line, kind: "alarm", startMs: new Date(2026, 10, 4, 10).getTime() });
		expect(phone.complete(text, "", line, now).text).toContain("- [x] A");
		expect(phone.silence(text, "", line, now).text).not.toContain("🚨");
		expect(phone.snooze(text, "", line, 15, now).text).toContain("- [ ] A 🚨 2026-11-04 09:15");
		expect(phone.capture(text, "", "inbox", "B", now).text).toMatch(/## Inbox\n+- \[ \] B/);
		expect(phone.calendarFiles("")).toEqual(["calendar/google.json", "calendar/iphone.json", "calendar/work.json"]);
		const at = (hour: number) => new Date(2026, 10, 4, hour).toISOString();
		const work = JSON.stringify({ exportedAt: at(8), events: [{ id: "s", title: "Standup", start: at(10), end: at(11), allDay: false, calendar: "Work" }] });
		expect(phone.meetings("", [null, null, work], now, new Date(2026, 10, 4, 18).getTime(), now)).toEqual([
			{ title: "Standup", startMs: new Date(2026, 10, 4, 10).getTime(), endMs: new Date(2026, 10, 4, 11).getTime() },
		]);
	});
});
