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
	const answers: (() => void)[] = [];
	const polling = new CalendarPolling({
		refresh: () => new Promise<void>((resolve) => answers.push(resolve)),
		intervalMs: () => interval,
		hidden: () => hidden,
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
});
