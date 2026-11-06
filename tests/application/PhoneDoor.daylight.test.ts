import { describe, expect, it } from "vitest";
import { callDoor, type DoorAnswer, type DoorContext } from "../../core/application/PhoneCalls";

/**
 * Days that are 23 and 25 hours long where the clocks change (America/New_York: 2026-03-08 springs forward at 02:00,
 * 2026-11-01 falls back at 02:00). The core reads the clock's readings, so a day ends at its next midnight by the clock,
 * not 24 hours after it began. Run in every zone the door's tests run in.
 */

const HOUR_MS = 3_600_000;
const local = (month: number, day: number, h: number, m = 0) => new Date(2026, month - 1, day, h, m).getTime();
const result = (method: string, args: unknown[], context: DoorContext): unknown => {
	const answer = callDoor(method, args, context) as DoorAnswer;
	if (!answer.ok) throw new Error(answer.error.message);
	return answer.result;
};
const MIDNIGHT = JSON.stringify({ dayStartHour: 0 });
const FILE = ["## Now", "", "- [ ] Spring ⏰ 2026-03-08 01:30-03:30", "- [ ] Fall ⏰ 2026-11-01 00:00-03:00", "", "## Soon", "", "## Done", ""].join("\n");

describe("the door across a change of the clocks", () => {
	it("runs where the clocks change, in New York", () => {
		if (process.env.TZ !== "America/New_York") return;
		expect(local(3, 9, 0) - local(3, 8, 0)).toBe(23 * HOUR_MS);
		expect(local(11, 2, 0) - local(11, 1, 0)).toBe(25 * HOUR_MS);
	});

	it("rings a task from its start by the clock until the day's next midnight by the clock", () => {
		const spring = result("reminders.list", [], { tasks: FILE, settings: MIDNIGHT, nowMs: local(3, 8, 0, 10) }) as { title: string; body: string; startMs: number; dayEndMs: number }[];
		expect(spring.find((r) => r.title === "Spring")).toMatchObject({ body: "01:30–03:30", startMs: local(3, 8, 1, 30), dayEndMs: local(3, 9, 0) });
		const fall = result("reminders.list", [], { tasks: FILE, settings: MIDNIGHT, nowMs: local(10, 31, 23) }) as { title: string; startMs: number; dayEndMs: number }[];
		const task = fall.find((r) => r.title === "Fall")!;
		expect(task.dayEndMs - task.startMs).toBe(local(11, 2, 0) - local(11, 1, 0));
	});

	it("places moments on the day by the clock's readings", () => {
		const context = { tasks: FILE, settings: MIDNIGHT, nowMs: local(3, 8, 12) };
		expect(result("boundary.offsetOf", ["2026-03-08", local(3, 8, 3, 30)], context)).toBe(210);
		expect(result("boundary.clipToDay", ["2026-11-01", local(11, 1, 0, 30), local(11, 1, 3)], context)).toEqual({ start: 30, end: 180 });
		expect(result("boundary.dayOf", [local(11, 1, 23, 30)], context)).toBe("2026-11-01");
	});

	it("keeps the day's start hour on either side of the change", () => {
		const late = JSON.stringify({ dayStartHour: 4 });
		expect(result("days.today", [], { tasks: FILE, settings: late, nowMs: local(3, 8, 3, 30) })).toBe("2026-03-07");
		expect(result("days.today", [], { tasks: FILE, settings: late, nowMs: local(3, 8, 4, 30) })).toBe("2026-03-08");
		expect(result("days.today", [], { tasks: FILE, settings: late, nowMs: local(11, 1, 3, 30) })).toBe("2026-10-31");
	});

	it("shows a task on the day the clocks change, and the day's meetings", () => {
		const screen = result("tasks.screen", ["2026-03-08"], { tasks: FILE, settings: MIDNIGHT, nowMs: local(3, 8, 0, 10) }) as { day: { slotted: { title: string }[] } };
		expect(screen.day.slotted.map((t) => t.title)).toContain("Spring");
		const iso = (month: number, day: number, h: number, m = 0) => new Date(local(month, day, h, m)).toISOString();
		const google = JSON.stringify({
			exportedAt: iso(11, 1, 0),
			events: [{ id: "n", title: "Night", start: iso(11, 1, 0, 30), end: iso(11, 1, 3), allDay: false, calendar: "Personal" }],
		});
		const meetings = result("calendars.meetings", [local(11, 1, 0), local(11, 2, 0)], { tasks: null, settings: MIDNIGHT, nowMs: local(11, 1, 0), calendars: { google } });
		expect(meetings).toEqual([{ title: "Night", startMs: local(11, 1, 0, 30), endMs: local(11, 1, 3) }]);
	});
});
