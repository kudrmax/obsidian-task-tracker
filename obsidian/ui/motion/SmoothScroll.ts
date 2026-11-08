import { DURATION, EASING, tokenMs } from "../design";
import { easingOf } from "../easing";
import { type GlideEnd, ScrollGlide } from "../quick/ScrollGlide";

const GLIDES = new WeakMap<HTMLElement, ScrollGlide>();
/** What takes a scroller from the plugin: a finger or a wheel on it. */
const FINGER = ["pointerdown", "wheel", "touchstart"] as const;

/**
 * The one scroll the plugin makes by itself: `scroller` glides to `top` in the list's motion tokens, one glide per
 * scroller at a time. `done` hears exactly once how it ended: it got there, its content ended short of it, another glide
 * took over, it was called off, or a finger or a wheel took the scroller (it yields at once). At once where nothing moves
 * (a test). Answers how to call it off.
 */
export function scrollSmoothly(scroller: HTMLElement, top: number, done: (how: GlideEnd) => void = () => undefined): () => void {
	const glide = GLIDES.get(scroller) ?? new ScrollGlide();
	GLIDES.set(scroller, glide);
	const ms = tokenMs(scroller, DURATION.collapse);
	const to = Math.max(0, Math.min(top, scroller.scrollHeight - scroller.clientHeight));
	if (ms <= 0 || Math.abs(to - scroller.scrollTop) < 1) {
		glide.stop();
		scroller.scrollTop = to;
		done(Math.abs(scroller.scrollTop - top) < 1 ? "arrived" : "blocked");
		return () => undefined;
	}
	const finger = () => glide.stop("finger");
	for (const type of FINGER) scroller.addEventListener(type, finger, { passive: true });
	glide.start(scroller, to, { ms, ease: easingOf(getComputedStyle(scroller).getPropertyValue(EASING.out)), rise: 0 }, () => undefined, (how) => {
		for (const type of FINGER) scroller.removeEventListener(type, finger);
		done(how === "arrived" && Math.abs(to - top) >= 1 ? "blocked" : how);
	});
	let running = true;
	return () => {
		if (!running) return;
		running = false;
		glide.stop();
	};
}
