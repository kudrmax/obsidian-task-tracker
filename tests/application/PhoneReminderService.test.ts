import { describe, expect, it } from "vitest";
import { PhoneReminderService } from "../../src/application/PhoneReminderService";

const at = (day: number, h: number, m = 0) => new Date(2026, 10, day, h, m);
const file = (...now: string[]) => ["## Now", "", ...now, "", "## Soon", "", "## Done", ""].join("\n");
const phone = new PhoneReminderService("");

describe("PhoneReminderService.reminders", () => {
	it("lists open slotted tasks with their kind", () => {
		const text = file(
			"- [ ] p1 Call [[Mom]] ⏰ 2026-11-04 10:00-11:00",
			"- [ ] Wake 🚨 2026-11-04 12:00",
			"- [ ] Quiet 🔕 2026-11-04 13:00",
			"- [x] Closed ⏰ 2026-11-04 14:00",
		);
		const list = phone.reminders(text, at(4, 9));
		expect(list.map((r) => [r.title, r.body, r.kind, r.date])).toEqual([
			["Call Mom", "10:00–11:00", "notification", "2026-11-04"],
			["Wake", "12:00", "alarm", "2026-11-04"],
		]);
		expect(list[0].start).toEqual(at(4, 10));
		expect(list[0].id).toBe("- [ ] p1 Call [[Mom]] ⏰ 2026-11-04 10:00-11:00");
	});

	it("keeps a passed reminder until the end of its day", () => {
		const text = file("- [ ] A ⏰ 2026-11-04 10:00");
		expect(phone.reminders(text, at(4, 15))).toHaveLength(1);
		expect(phone.reminders(text, at(5, 6))).toHaveLength(0);
	});

	it("dayEnd follows dayStartHour", () => {
		const r = new PhoneReminderService(JSON.stringify({ dayStartHour: 4 })).reminders(file("- [ ] A ⏰ 2026-11-04 23:00"), at(4, 9))[0];
		expect(r.dayEnd).toEqual(at(5, 4));
	});

	it("reads custom markers and sections from settings json", () => {
		const custom = new PhoneReminderService(JSON.stringify({ sections: { now: "Today" }, alarmSlotMarker: "ring:" }));
		const list = custom.reminders("## Today\n\n- [ ] A ring: 2026-11-04 10:00\n", at(4, 9));
		expect(list.map((r) => [r.title, r.kind])).toEqual([["A", "alarm"]]);
	});

	it("empty settings json means defaults", () => {
		expect(new PhoneReminderService("").reminders(file("- [ ] A 🚨 2026-11-04 10:00"), at(4, 9))[0].kind).toBe("alarm");
	});
});

describe("PhoneReminderService actions", () => {
	const line = "- [ ] A 🚨 2026-11-04 10:00-11:00";

	it("complete marks the task done", () => {
		const result = phone.complete(file(line), line, at(4, 10, 5));
		expect(result.changed && result.text).toContain("- [x] A 🚨 2026-11-04 10:00-11:00");
	});

	it("Done on a reminder left from yesterday still closes the task", () => {
		const late = "- [ ] B ⏰ 2026-11-04 23:30";
		const result = phone.complete(file(late), late, at(5, 7, 30));
		expect(result.changed && result.text).toMatch(/- \[x\] B/);
	});

	it("complete of a changed line is stale", () => {
		expect(phone.complete(file(line), "- [ ] A 🚨 2026-11-04 09:00", at(4, 10))).toEqual({ changed: false, reason: "stale" });
	});

	it("two identical lines: complete closes one", () => {
		const result = phone.complete(file(line, line), line, at(4, 10));
		if (!result.changed) throw new Error("stale");
		expect(phone.reminders(result.text, at(4, 10)).map((r) => r.id)).toEqual([line]);
	});

	it("snooze moves the slot from now keeping the duration", () => {
		const result = phone.snooze(file(line), line, 30, at(4, 10, 7));
		expect(result.changed && result.text).toContain("- [ ] A 🚨 2026-11-04 10:37-11:37");
	});

	it("snooze across midnight", () => {
		const late = "- [ ] B ⏰ 2026-11-04 23:30-00:30";
		const result = phone.snooze(file(late), late, 60, at(4, 23, 50));
		expect(result.changed && result.text).toContain("- [ ] B ⏰ 2026-11-05 00:50-01:50");
	});
});

describe("PhoneReminderService.silence", () => {
	it("turns the task's reminder off and keeps its time", () => {
		const id = "- [ ] Wake 🚨 2026-11-04 12:00";
		const done = phone.silence(file(id), id, at(4, 12, 1));
		if (!done.changed) throw new Error("expected a change");
		expect(done.text).toContain("- [ ] Wake 🔕 2026-11-04 12:00");
		expect(done.text).not.toContain("🚨");
		expect(phone.reminders(done.text, at(4, 12, 1))).toEqual([]);
	});

	it("is stale when the task changed", () => {
		expect(phone.silence(file("- [ ] Wake 🚨 2026-11-04 13:00"), "- [ ] Wake 🚨 2026-11-04 12:00", at(4, 12, 1))).toEqual({ changed: false, reason: "stale" });
	});
});

describe("PhoneReminderService and a repeating task", () => {
	const line = "- [ ] Gym 🚨 2026-11-04 07:00 🔁 every day";

	it("reminds of it by its name, without the rule", () => {
		expect(phone.reminders(file(line), at(4, 6)).map((r) => [r.title, r.kind])).toEqual([["Gym", "alarm"]]);
	});

	it("Done writes the next copy, with no time and no reminder", () => {
		const result = phone.complete(file(line), line, at(4, 7, 1));
		if (!result.changed) throw new Error("expected a change");
		expect(result.text).toContain("- [ ] Gym 📅 2026-11-05 🔁 every day");
		expect(result.text).toContain("- [x] Gym 🚨 2026-11-04 07:00");
		expect(phone.reminders(result.text, at(4, 7, 1))).toEqual([]);
	});
});
