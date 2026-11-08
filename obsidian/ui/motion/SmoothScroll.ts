import { DURATION, EASING, tokenMs } from "../design";
import { easingOf } from "../easing";
import { ScrollGlide } from "../quick/ScrollGlide";

const GLIDES = new WeakMap<HTMLElement, ScrollGlide>();

/**
 * The one scroll the plugin makes by itself: `scroller` glides to `top` in the list's motion tokens, one glide per
 * scroller at a time (a new one takes over from where the last stands); at once where nothing moves (a test). `done` runs
 * once it stands there. Answers how to stop it where it is.
 */
export function scrollSmoothly(scroller: HTMLElement, top: number, done: () => void = () => undefined): () => void {
	const glide = GLIDES.get(scroller) ?? new ScrollGlide();
	GLIDES.set(scroller, glide);
	const ms = tokenMs(scroller, DURATION.collapse);
	const to = Math.max(0, Math.min(top, scroller.scrollHeight - scroller.clientHeight));
	if (ms <= 0 || Math.abs(to - scroller.scrollTop) < 1) {
		glide.stop();
		scroller.scrollTop = to;
		done();
		return () => undefined;
	}
	glide.start(scroller, to, { ms, ease: easingOf(getComputedStyle(scroller).getPropertyValue(EASING.out)), rise: 0 }, (at) => {
		if (Math.abs(at - to) < 1) done();
	});
	return () => glide.stop();
}
