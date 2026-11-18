/**
 * Where a ribbon let go after a finger's swipe goes, by the usual pager rule (spec, «Gestures that are not drag»): a flick
 * (@use-gesture's `swipe`, its own velocity and distance) goes one stop its way; otherwise one stop once the finger took it
 * past half the way, else back. Never two: one swipe is one stop (CLAUDE.md, «Behaviours Max had to ask for twice»).
 * `moved` and `flick` are signed the same way: positive on, negative back; `distance` is one stop's.
 */
export function swipeStep(moved: number, distance: number, flick: number): -1 | 0 | 1 {
	if (flick !== 0) return flick > 0 ? 1 : -1;
	if (distance <= 0 || Math.abs(moved) * 2 < distance) return 0;
	return moved > 0 ? 1 : -1;
}
