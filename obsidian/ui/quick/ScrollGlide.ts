import type { Glide } from "../Keyboard";

/** How a glide ended, exactly one of these for each: it got there, its content ended short of it, another glide took over, it was stopped, or a finger took the scroller. */
export type GlideEnd = "arrived" | "blocked" | "interrupted" | "stopped" | "finger";

interface Run {
	readonly scroller: HTMLElement;
	readonly from: number;
	readonly to: number;
	readonly glide: Glide;
	readonly onStep: (top: number) => void;
	readonly onEnd: (how: GlideEnd) => void;
	start: number | null;
	frame: number;
	/** Stands it anyway once its time is up: a page out of sight draws no frames. */
	timer: number;
}

/** How long past its time a run waits for its last frame before it stands anyway. */
const FRAME_SLACK_MS = 100;

/**
 * A scroller moved by the plugin: frame by frame from where it stands to `to`, in the glide's time and easing (the
 * keyboard's, or the list's motion tokens). `onStep` hears where each frame left it; `onEnd` hears once how it ended.
 * One run at a time: a new one ends the last as interrupted.
 */
export class ScrollGlide {
	private run: Run | null = null;

	get running(): boolean {
		return this.run !== null;
	}

	start(scroller: HTMLElement, to: number, glide: Glide, onStep: (top: number) => void, onEnd: (how: GlideEnd) => void = () => undefined): void {
		this.end("interrupted");
		const win = scroller.ownerDocument.defaultView ?? window;
		const run: Run = { scroller, from: scroller.scrollTop, to, glide, onStep, onEnd, start: null, frame: 0, timer: 0 };
		this.run = run;
		run.frame = win.requestAnimationFrame((now) => this.step(run, now));
		run.timer = win.setTimeout(() => this.land(run), glide.ms + FRAME_SLACK_MS);
	}

	/** It stops where it is: a finger took the list (`finger`), or whoever started it called it off. */
	stop(how: "stopped" | "finger" = "stopped"): void {
		this.end(how);
	}

	private end(how: GlideEnd): void {
		const run = this.run;
		if (!run) return;
		const win = run.scroller.ownerDocument.defaultView ?? window;
		win.cancelAnimationFrame(run.frame);
		win.clearTimeout(run.timer);
		this.run = null;
		run.onEnd(how);
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
		this.scrollTo(run, run.to);
		this.end(Math.abs(run.scroller.scrollTop - run.to) < 1 ? "arrived" : "blocked");
	}

	private scrollTo(run: Run, top: number): void {
		run.scroller.scrollTop = top;
		run.onStep(run.scroller.scrollTop);
	}
}
