import { describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "../../core/application/contracts";
import { AppleCalendar, calshowUrl, SHOW_EVENT_SCRIPT, showEventArgs } from "../../obsidian/infrastructure/AppleCalendar";

const event: CalendarEvent = {
	id: "x",
	title: "Работа",
	start: new Date(2026, 10, 3, 18, 30),
	end: new Date(2026, 10, 3, 21, 15),
	allDay: false,
	calendar: "Авито",
	color: "#FFE29A",
	source: "work",
	account: null,
	calendarId: null,
};

describe("Apple's Calendar at an event", () => {
	it("gives the phone the start in seconds since 2001-01-01 UTC", () => {
		expect(calshowUrl(new Date(Date.UTC(2001, 0, 1, 0, 0, 10)))).toBe("calshow:10");
	});

	it("gives the Mac's script the title, the calendar and the start in local time", () => {
		expect(showEventArgs(event)).toEqual(["Работа", "Авито", "2026", "11", "3", String(18 * 3600 + 30 * 60)]);
	});

	it("opens the URL on the phone and runs the script on the Mac", () => {
		const phone = { isPhone: true, open: vi.fn(), runScript: vi.fn() };
		new AppleCalendar(phone).open(event);
		expect(phone.open).toHaveBeenCalledWith(calshowUrl(event.start));
		expect(phone.runScript).not.toHaveBeenCalled();
		const mac = { isPhone: false, open: vi.fn(), runScript: vi.fn() };
		new AppleCalendar(mac).open(event);
		expect(mac.runScript).toHaveBeenCalledWith(SHOW_EVENT_SCRIPT, showEventArgs(event));
		expect(mac.open).not.toHaveBeenCalled();
	});
});
