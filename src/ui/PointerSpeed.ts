/** The pace so far fades over about this long, so one jerk of the finger doesn't swing it, and a pause wipes it. */
const SMOOTHING_MS = 30;

/** How fast a pointer travels along one axis, in px per ms, smoothed over its last moves. */
export class PointerSpeed {
	private current = 0;

	constructor(
		private x: number,
		private time: number,
	) {}

	get value(): number {
		return this.current;
	}

	update(x: number, time: number): void {
		const elapsed = time - this.time;
		if (elapsed <= 0) return;
		const weight = 1 - Math.exp(-elapsed / SMOOTHING_MS);
		this.current = weight * (Math.abs(x - this.x) / elapsed) + (1 - weight) * this.current;
		this.x = x;
		this.time = time;
	}
}
