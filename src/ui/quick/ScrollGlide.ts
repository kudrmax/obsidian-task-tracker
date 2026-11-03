import type { Glide } from "../Keyboard";

interface Run {
	readonly scroller: HTMLElement;
	readonly from: number;
	readonly to: number;
	readonly glide: Glide;
	readonly onStep: (top: number) => void;
	start: number | null;
	frame: number;
	/** Stands it anyway once its time is up: a page out of sight draws no frames. */
	timer: number;
}

/** How long past its time a run waits for its last frame before it stands anyway. */
const FRAME_SLACK_MS = 100;

/**
 * A list scrolled along with the keyboard: frame by frame from where it stands to `to`, in the keyboard's time and easing,
 * so the field rides just over the keyboard as it comes. `onStep` hears where each frame left it. One run at a time.
 */
export class ScrollGlide {
	private run: Run | null = null;

	get running(): boolean {
		return this.run !== null;
	}

	start(scroller: HTMLElement, to: number, glide: Glide, onStep: (top: number) => void): void {
		this.stop();
		const win = scroller.ownerDocument.defaultView ?? window;
		const run: Run = { scroller, from: scroller.scrollTop, to, glide, onStep, start: null, frame: 0, timer: 0 };
		this.run = run;
		run.frame = win.requestAnimationFrame((now) => this.step(run, now));
		run.timer = win.setTimeout(() => this.land(run), glide.ms + FRAME_SLACK_MS);
	}

	/** It stops where it is: a finger took the list, or the list scrolls another way at once. */
	stop(): void {
		const run = this.run;
		if (!run) return;
		const win = run.scroller.ownerDocument.defaultView ?? window;
		win.cancelAnimationFrame(run.frame);
		win.clearTimeout(run.timer);
		this.run = null;
	}

	private step(run: Run, now: number): void {
		if (this.run !== run) return;
		run.start ??= now;
		const t = run.glide.ms > 0 ? (now - run.start) / run.glide.ms : 1;
		if (t >= 1) return this.land(run);
		this.scrollTo(run, run.from + (run.to - run.from) * run.glide.ease(t));
		run.frame = (run.scroller.ownerDocument.defaultView ?? window).requestAnimationFrame((next) => this.step(run, next));
	}

	private land(run: Run): void {
		if (this.run !== run) return;
		this.stop();
		this.scrollTo(run, run.to);
	}

	private scrollTo(run: Run, top: number): void {
		run.scroller.scrollTop = top;
		run.onStep(run.scroller.scrollTop);
	}
}
