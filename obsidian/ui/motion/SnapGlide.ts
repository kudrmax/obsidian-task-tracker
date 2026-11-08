import { DURATION, EASING, tokenMs } from "../design";
import { type Easing, easingOf } from "../easing";

interface Run {
	readonly from: number;
	to: number;
	start: number | null;
	frame: number;
}

/**
 * A value a finger sets that holds to a snap: while it follows the finger it is shown as it comes, but the step into or
 * out of the snap glides from what is shown to where it is going, in the snap token's time and on the list's curve, so
 * nothing jumps by the snap's distance in a frame. A value set while it glides becomes where it goes.
 */
export class SnapGlide {
	private shown: number | null = null;
	private run: Run | null = null;
	private ended: (() => void)[] = [];

	constructor(
		private readonly el: HTMLElement,
		private readonly show: (value: number) => void,
	) {}

	/** `value` is where it is now; `glide` steps into or out of the snap. */
	set(value: number, glide: boolean): void {
		if (this.run) {
			this.run.to = value;
			return;
		}
		const ms = tokenMs(this.el, DURATION.snap);
		if (!glide || this.shown === null || ms <= 0 || Math.abs(value - this.shown) < 1) return this.draw(value);
		const win = this.el.ownerDocument.defaultView ?? window;
		const ease = easingOf(getComputedStyle(this.el).getPropertyValue(EASING.out));
		const run: Run = { from: this.shown, to: value, start: null, frame: 0 };
		this.run = run;
		const step = (now: number) => {
			if (this.run !== run) return;
			run.start ??= now;
			const t = (now - run.start) / ms;
			if (t >= 1) return this.land();
			this.draw(run.from + (run.to - run.from) * (ease as Easing)(t));
			run.frame = win.requestAnimationFrame(step);
		};
		run.frame = win.requestAnimationFrame(step);
	}

	/** `then` runs once no glide runs, what it ends on shown: at once when none does. */
	whenSettled(then: () => void): void {
		if (this.run) this.ended.push(then);
		else then();
	}

	/** It starts again from nothing shown: the next value is shown as it comes. */
	reset(): void {
		this.land();
		this.shown = null;
	}

	private land(): void {
		const run = this.run;
		if (!run) return;
		this.run = null;
		(this.el.ownerDocument.defaultView ?? window).cancelAnimationFrame(run.frame);
		this.draw(run.to);
		this.ended.splice(0).forEach((resolve) => resolve());
	}

	private draw(value: number): void {
		this.shown = value;
		this.show(value);
	}
}
