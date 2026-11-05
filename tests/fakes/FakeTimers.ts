import type { Timers } from "../../src/application/ports";

/** Timers fired by hand: `delays` lists the pending ones, `fire` runs the first. */
export class FakeTimers implements Timers {
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
