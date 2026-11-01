import { LAYOUT } from "./design";
import { PointerSpeed } from "./PointerSpeed";

/**
 * Whether a drag is careful: its finger has gone slower than `LAYOUT.slowSpeed` for `LAYOUT.carefulMs` on end. Once it
 * has, the drag stays careful however fast the finger goes after; a quick swipe never is.
 */
export class CarefulPace {
	private readonly speed: PointerSpeed;
	private slowSince: number | null = null;
	private x: number;
	private lastMove: number;
	private reached = false;

	constructor(x: number, time: number) {
		this.speed = new PointerSpeed(x, time);
		this.x = x;
		this.lastMove = time;
	}

	get careful(): boolean {
		return this.reached;
	}

	update(x: number, time: number): void {
		const moved = x !== this.x;
		this.speed.update(x, time);
		if (this.speed.value >= LAYOUT.slowSpeed) this.slowSince = null;
		else {
			// A finger that stood still before letting go has been slow since it stopped.
			this.slowSince ??= moved ? time : this.lastMove;
			if (time - this.slowSince >= LAYOUT.carefulMs) this.reached = true;
		}
		if (moved) this.lastMove = time;
		this.x = x;
	}
}
