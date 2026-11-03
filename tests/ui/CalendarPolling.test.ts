import { describe, expect, it } from "vitest";
import { CalendarPolling, type PollingTimers } from "../../src/ui/CalendarPolling";

class FakeTimers implements PollingTimers {
	private next = 1;
	readonly pending = new Map<number, { fn: () => void; ms: number }>();

	set(fn: () => void, ms: number): number {
		const id = this.next++;
		this.pending.set(id, { fn, ms });
		return id;
	}

	clear(id: number): void {
		this.pending.delete(id);
	}

	get delays(): number[] {
		return [...this.pending.values()].map((t) => t.ms);
	}

	fire(): void {
		const [[id, timer]] = this.pending;
		this.pending.delete(id);
		timer.fn();
	}
}

function setup(seconds = 60) {
	const timers = new FakeTimers();
	let interval = seconds * 1000;
	let hidden = false;
	let now = 1_000_000;
	const answers: (() => void)[] = [];
	const polling = new CalendarPolling({
		refresh: () => new Promise<void>((resolve) => answers.push(resolve)),
		intervalMs: () => interval,
		hidden: () => hidden,
		now: () => now,
		timers,
	});
	return {
		polling,
		timers,
		fetches: () => answers.length,
		answer: async () => {
			answers.forEach((a) => a());
			await Promise.resolve();
			await Promise.resolve();
		},
		setInterval: (s: number) => (interval = s * 1000),
		setHidden: (h: boolean) => (hidden = h),
		pass: (ms: number) => (now += ms),
	};
}

describe("CalendarPolling", () => {
	it("fetches once every interval, reading the interval afresh each time", async () => {
		const t = setup(60);
		t.polling.start();
		expect(t.timers.delays).toEqual([60_000]);
		t.timers.fire();
		expect(t.fetches()).toBe(1);
		await t.answer();
		t.setInterval(30);
		t.timers.fire();
		expect(t.fetches()).toBe(2);
		expect(t.timers.delays).toEqual([30_000]);
	});

	it("a fetch asked for restarts the interval", () => {
		const t = setup(60);
		t.polling.start();
		void t.polling.refresh();
		expect(t.fetches()).toBe(1);
		expect(t.timers.delays).toEqual([60_000]);
	});

	it("asked again while a fetch runs, waits for that fetch instead of starting one more", async () => {
		const t = setup();
		t.polling.start();
		const first = t.polling.refresh();
		const second = t.polling.refresh();
		expect(t.fetches()).toBe(1);
		await t.answer();
		await Promise.all([first, second]);
		void t.polling.refresh();
		expect(t.fetches()).toBe(2);
	});

	it("does not fetch for a hidden screen, and keeps the timer going", () => {
		const t = setup();
		t.polling.start();
		t.setHidden(true);
		t.timers.fire();
		expect(t.fetches()).toBe(0);
		expect(t.timers.delays).toEqual([60_000]);
	});

	it("has no timer with an interval of zero, and none after stop", () => {
		const off = setup(0);
		off.polling.start();
		expect(off.timers.delays).toEqual([]);
		const on = setup(60);
		on.polling.start();
		on.polling.stop();
		expect(on.timers.delays).toEqual([]);
		void on.polling.refresh();
		expect(on.timers.delays).toEqual([]);
	});

	it("a tick while the view is off screen fetches nothing; coming back fetches once", async () => {
		const t = setup();
		t.polling.start();
		t.setHidden(true);
		t.timers.fire();
		expect(t.fetches()).toBe(0);
		t.setHidden(false);
		t.polling.catchUp();
		expect(t.fetches()).toBe(1);
		await t.answer();
		t.polling.catchUp();
		expect(t.fetches()).toBe(1);
	});

	it("coming back without a missed tick fetches nothing", () => {
		const t = setup();
		t.polling.start();
		t.polling.catchUp();
		expect(t.fetches()).toBe(0);
	});

	it("coming back while still off screen fetches nothing and keeps the missed tick", () => {
		const t = setup();
		t.polling.start();
		t.setHidden(true);
		t.timers.fire();
		t.polling.catchUp();
		expect(t.fetches()).toBe(0);
		t.setHidden(false);
		t.polling.catchUp();
		expect(t.fetches()).toBe(1);
	});

	it("wake right after the view opened fetches nothing", () => {
		const t = setup();
		t.polling.start();
		t.polling.wake();
		expect(t.fetches()).toBe(0);
	});

	it("wake fetches once half the interval passed since the last fetch", async () => {
		const t = setup(60);
		t.polling.start();
		t.pass(29_000);
		t.polling.wake();
		expect(t.fetches()).toBe(0);
		t.pass(2_000);
		t.polling.wake();
		expect(t.fetches()).toBe(1);
		await t.answer();
		t.polling.wake();
		expect(t.fetches()).toBe(1);
	});

	it("wake fetches nothing for a view off screen, and coming back catches up", () => {
		const t = setup();
		t.polling.start();
		t.pass(60_000);
		t.setHidden(true);
		t.polling.wake();
		expect(t.fetches()).toBe(0);
		t.setHidden(false);
		t.polling.catchUp();
		expect(t.fetches()).toBe(1);
	});

	it("Refresh now fetches even right after another fetch", async () => {
		const t = setup();
		t.polling.start();
		void t.polling.refresh();
		await t.answer();
		void t.polling.refresh();
		expect(t.fetches()).toBe(2);
	});

	it("with the timer off, wake fetches at once", () => {
		const t = setup(0);
		t.polling.start();
		t.polling.wake();
		expect(t.fetches()).toBe(1);
	});
});
