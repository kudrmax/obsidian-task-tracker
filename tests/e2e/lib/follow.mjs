import { FollowPager, landingAt, landingVelocity } from "../../../obsidian/ui/engine/gestures/followPager.ts";
import { WheelFollow } from "../../../obsidian/ui/engine/gestures/wheelFollow.ts";

/**
 * A person's wheel events through the trackpad's cues (`WheelFollow`) and the gallery's rule (`FollowPager`), offline, as
 * the ribbon of the stand's step 7 runs them: from `start`, between 0 and `last` (unbounded by default), `width` px a place.
 * Answers each landing as a step from the place before (a lift the same stroke takes back is taken out), the furthest any
 * landing lay from the place its stroke began at, how many moves came between a lift and the next stroke, and each landing
 * (where it began, its place, its starting speed).
 */
/**
 * `ended`: after which events the page's wheel gesture ended by its own clock (@use-gesture's 140 ms timer, `FollowRibbon`'s
 * `onWheel` with `last`), when known: the fingers let go there, as on the page. Without it the events' own times are the
 * only clock (a person's events reach the page as they are made).
 */
export function followSteps(wheels, width, { start = 1000, last = 2000, ended = null } = {}) {
	const fingers = new WheelFollow();
	const pager = new FollowPager(start, last);
	let at = start;
	let landing = null;
	let origin = start;
	let furthest = 0;
	let movedInMomentum = 0;
	const steps = [];
	const landings = [];
	const stand = (t) => (landing ? landingAt(landing.from, landing.to, landing.velocity, t - landing.t) : at);
	const apply = (cues) => {
		for (const cue of cues) {
			if (cue.kind === "begin") {
				at = stand(cue.t);
				landing = null;
				if (cue.fresh) origin = pager.stop;
				else if (pager.stop !== origin) steps.pop();
				pager.begin(at, cue.fresh);
			} else if (cue.kind === "move") {
				if (!pager.following) movedInMomentum++;
				at = pager.move(cue.dx, width);
			} else {
				const was = pager.stop;
				const to = pager.release(at, cue.speed, width);
				if (to !== was) steps.push(to - was);
				furthest = Math.max(furthest, Math.abs(to - origin));
				landing = { from: at, to, t: cue.t, velocity: landingVelocity(at, to, cue.speed, width) };
				landings.push({ t: cue.t, ...landing });
			}
		}
	};
	wheels.forEach((e, i) => {
		if (ended && i > 0 && ended[i - 1]) apply(fingers.tick(Infinity));
		apply(fingers.tick(e.t));
		apply(fingers.feed(e));
	});
	apply(fingers.tick(Infinity));
	return { steps, furthest, movedInMomentum, landings };
}
