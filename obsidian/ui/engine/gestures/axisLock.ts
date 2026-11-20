/** A stroke's first movement this long, px, decides its axis. */
const AXIS_PX = 4;
/** Sideways only when clearly so: its sideways movement at least this many times its vertical one (within about 27° of the level). */
const SIDEWAYS = 2;

export type Axis = "x" | "y";

/**
 * One stroke, one axis (Max, 2026-11-20: «Во время горизонтального скролла НЕ запрещен вертикальный — это не ок»): the
 * first `AXIS_PX` of a stroke's movement decide it; sideways only when clearly sideways, so a stroke that starts up or
 * down scrolls the lists as before. Decided, it holds until the stroke ends.
 */
export class AxisLock {
	private axis: Axis | null = null;
	private x = 0;
	private y = 0;

	/** The axis after this movement; null while still undecided. */
	feed(dx: number, dy: number): Axis | null {
		if (this.axis) return this.axis;
		this.x += Math.abs(dx);
		this.y += Math.abs(dy);
		if (this.x + this.y >= AXIS_PX) this.axis = this.x >= SIDEWAYS * this.y ? "x" : "y";
		return this.axis;
	}
}
