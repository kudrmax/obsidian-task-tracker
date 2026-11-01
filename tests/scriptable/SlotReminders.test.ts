import { describe, expect, it } from "vitest";
import { SlotReminders } from "../../src/scriptable/SlotReminders";

const SETTINGS = { sections: { now: "Now", soon: "Soon", done: "Done" }, markers: { dueDate: "📅", slot: "⏰" } };
const NOW = new Date(2026, 9, 30, 12, 0);

const file = (...lines: string[]) => ["## Now", ...lines, "", "## Soon", "", "## Done", ""].join("\n");
const reminders = new SlotReminders(SETTINGS);

describe("SlotReminders", () => {
	it("one at the slot's start, titled by the task, with its time below", () => {
		expect(reminders.of(file("- [ ] Call the doctor ⏰ 2026-10-30 14:30-15:30"), NOW)).toEqual([
			{ id: "task-calendar 2026-10-30 14:30 Call the doctor", title: "Call the doctor", body: "14:30–15:30", at: new Date(2026, 9, 30, 14, 30) },
		]);
	});

	it("a slot without a duration shows its start alone", () => {
		expect(reminders.of(file("- [/] Write the report 📅 2026-11-02 ⏰ 2026-10-31 09:00"), NOW).map((r) => [r.title, r.body])).toEqual([["Write the report", "09:00"]]);
	});

	it("a link in the title shows its word", () => {
		expect(reminders.of(file("- [ ] Call [[People/Peter|Peter]] about [the deal](https://x.ru) ⏰ 2026-10-30 14:30"), NOW)[0].title).toBe("Call Peter about the deal");
	});

	it("a slot running past midnight shows its end as written", () => {
		expect(reminders.of(file("- [ ] Deploy ⏰ 2026-10-30 23:00-01:00"), NOW)[0].body).toBe("23:00–01:00");
	});

	it("only the slots still ahead, nearest first", () => {
		const text = file("- [ ] Later ⏰ 2026-10-31 08:00", "- [ ] Past ⏰ 2026-10-30 11:59", "- [ ] Now ⏰ 2026-10-30 12:00", "- [ ] Soon ⏰ 2026-10-30 12:01");
		expect(reminders.of(text, NOW).map((r) => r.title)).toEqual(["Soon", "Later"]);
	});

	it("nothing for a finished task, a due date alone or a task outside Now and Soon", () => {
		const text = ["## Inbox", "- [ ] Inbox ⏰ 2026-10-30 15:00", "## Now", "- [x] Done ⏰ 2026-10-30 15:00", "- [ ] Due 📅 2026-10-31"].join("\n");
		expect(reminders.of(text, NOW)).toEqual([]);
	});

	it("keeps the nearest ones under iOS's cap on pending notifications", () => {
		const lines = Array.from({ length: 70 }, (_, i) => `- [ ] Task ${i} ⏰ 2026-11-${String(1 + Math.floor(i / 10)).padStart(2, "0")} ${String(8 + (i % 10)).padStart(2, "0")}:00`);
		const kept = reminders.of(file(...lines), NOW);
		expect(kept).toHaveLength(SlotReminders.LIMIT);
		expect(kept[kept.length - 1].title).toBe(`Task ${SlotReminders.LIMIT - 1}`);
	});
});
