import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const BUNDLE = "phone/task-calendar-phone.js";
const committed = readFileSync(BUNDLE, "utf8");

interface Phone {
	reminders(text: string, settingsJson: string, nowMs: number): { id: string; kind: string; startMs: number; dayEndMs: number }[];
	snooze(text: string, settingsJson: string, id: string, minutes: number, nowMs: number): { changed: boolean; text?: string };
	capture(text: string, settingsJson: string, list: string, title: string, nowMs: number): { changed: boolean; text?: string };
}

describe(BUNDLE, () => {
	it("is the build of src/phone: run `node phone/build.mjs` after changing it", () => {
		expect(execFileSync("node", ["phone/build.mjs", "--stdout"], { encoding: "utf8" })).toBe(committed);
	});

	it("needs nothing but the language: no modules, no Obsidian", () => {
		expect(committed).not.toMatch(/\brequire\(|^import |from "obsidian"/m);
	});

	it("runs on its own and answers in milliseconds", () => {
		const sandbox: { TaskCalendarPhone?: Phone } = {};
		runInNewContext(committed, sandbox);
		const phone = sandbox.TaskCalendarPhone!;
		const line = "- [ ] A 🚨 2026-11-04 10:00";
		const text = `## Now\n\n${line}\n`;
		const now = new Date(2026, 10, 4, 9).getTime();
		const [r] = phone.reminders(text, "", now);
		expect(r).toMatchObject({ id: line, kind: "alarm", startMs: new Date(2026, 10, 4, 10).getTime() });
		expect(phone.snooze(text, "", line, 15, now).text).toContain("- [ ] A 🚨 2026-11-04 09:15");
		expect(phone.capture(text, "", "inbox", "B", now).text).toMatch(/## Inbox\n+- \[ \] B/);
	});
});
