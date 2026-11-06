import { describe, expect, it } from "vitest";
import type { CalendarFile } from "../../core/application/calendarFile";
import { PhoneCalendarRefresh } from "../../obsidian/infrastructure/PhoneCalendarRefresh";
import { FakeTimers } from "../fakes/FakeTimers";

const NOW = new Date(2026, 10, 5, 12);

function phone(file: Partial<CalendarFile> | null, isPhone = true) {
	const opened: string[] = [];
	let shortcuts = 0;
	const timers = new FakeTimers();
	let current: CalendarFile | null = file && { events: [], calendars: [], exportedAt: new Date(NOW.getTime() - 3600_000), device: null, from: null, to: null, validUntil: null, ...file };
	const refresh = new PhoneCalendarRefresh({
		host: { isPhone, vaultName: "Main", open: (url) => opened.push(url) },
		readIphone: async () => current,
		shortcut: { run: () => shortcuts++ },
		clock: { now: () => NOW },
		timers,
	});
	return {
		refresh,
		opened,
		timers,
		shortcuts: () => shortcuts,
		write: () => (current = { ...current!, exportedAt: new Date(NOW.getTime() + 5_000) }),
		settle: () => new Promise((r) => setTimeout(r, 0)),
	};
}

const SIGNED = { validUntil: new Date(2026, 10, 10) };

describe("PhoneCalendarRefresh", () => {
	it("opens the app while it is signed", async () => {
		const p = phone(SIGNED);
		p.refresh.export();
		await p.settle();
		expect(p.opened).toEqual(["taskcalendar://refresh?vault=Main"]);
		expect(p.shortcuts()).toBe(0);
	});

	it("runs Scriptable when the app's signature ran out", async () => {
		const p = phone({ validUntil: new Date(2026, 10, 1) });
		p.refresh.export();
		await p.settle();
		expect(p.opened).toEqual([]);
		expect(p.shortcuts()).toBe(1);
	});

	it("runs Scriptable when there is no app file", async () => {
		const p = phone(null);
		p.refresh.export();
		await p.settle();
		expect(p.shortcuts()).toBe(1);
	});

	it("runs Scriptable when the app came back without writing", async () => {
		const p = phone(SIGNED);
		p.refresh.export();
		await p.settle();
		expect(p.timers.delays).toEqual([20_000]);
		p.timers.fire();
		await p.settle();
		expect(p.shortcuts()).toBe(1);
	});

	it("leaves Scriptable alone when the app wrote its file", async () => {
		const p = phone(SIGNED);
		p.refresh.export();
		await p.settle();
		p.write();
		p.timers.fire();
		await p.settle();
		expect(p.shortcuts()).toBe(0);
	});

	it("does nothing on the Mac", async () => {
		const p = phone(SIGNED, false);
		p.refresh.export();
		await p.settle();
		expect([p.opened, p.shortcuts()]).toEqual([[], 0]);
	});
});
