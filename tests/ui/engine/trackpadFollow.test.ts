import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FLICK_SPEED, FollowPager, landingAt, landingVelocity } from "../../../obsidian/ui/engine/gestures/followPager";
import { type FingerSignal, TrackpadFollow } from "../../../obsidian/ui/engine/gestures/trackpadFollow";
import type { WheelCue } from "../../../obsidian/ui/engine/gestures/wheelFollow";

type Heard =
	| { readonly heard: number; readonly type: "wheel"; readonly t: number; readonly dx: number; readonly dy: number }
	| { readonly heard: number; readonly type: "down"; readonly t: number }
	| { readonly heard: number; readonly type: "up"; readonly t: number; readonly lastMove: number | null }
	| { readonly heard: number; readonly type: "momentumBegan"; readonly t: number }
	| { readonly heard: number; readonly type: "momentumEnded"; readonly t: number; readonly last: number };

/** Max's probe session (2026-11-20): the native module's signals and the page's wheel events, in the order the page heard them (scripts/trackpad-fixture.mjs). */
const SESSION = (JSON.parse(readFileSync(join(__dirname, "..", "..", "e2e", "recordings", "max-2026-11-20-trackpad-phases.json"), "utf8")) as { events: Heard[] }).events;

/** @use-gesture's wheel end: this long after the last wheel event the page heard. */
const WHEEL_END_MS = 140;
const WIDTH = 300;
const SETTLED = 0.002;

interface Stroke {
	readonly began: number;
	readonly beganHeard: number;
	readonly origin: number;
	moved: number;
	readonly movedAt: number[];
	released?: { readonly heard: number; readonly speed: number; readonly to: number };
}

/** The session through `TrackpadFollow` and the gallery's rule, as the ribbon of step 7 runs them: the columns `WIDTH` px a place, the landing's spring solved. */
function replay(events: readonly Heard[]) {
	const follow = new TrackpadFollow();
	const pager = new FollowPager(1000, 2000);
	let at = 1000;
	let landing: { from: number; to: number; velocity: number; heard: number } | null = null;
	const strokes: Stroke[] = [];
	const stand = (now: number) => (landing ? landingAt(landing.from, landing.to, landing.velocity, now - landing.heard) : at);
	const moving = (now: number) => !!landing && Math.abs(stand(now) - landing.to) > SETTLED;
	const apply = (cues: readonly WheelCue[], now: number) => {
		for (const cue of cues) {
			if (cue.kind === "begin") {
				at = stand(now);
				landing = null;
				pager.begin(at, true);
				strokes.push({ began: cue.t, beganHeard: now, origin: pager.stop, moved: 0, movedAt: [] });
			} else if (cue.kind === "move") {
				const stroke = strokes[strokes.length - 1];
				expect(pager.following).toBe(true);
				stroke.moved += cue.dx;
				stroke.movedAt.push(cue.t);
				at = pager.move(cue.dx, WIDTH);
			} else {
				const to = pager.release(at, cue.speed, WIDTH);
				landing = { from: at, to, velocity: landingVelocity(at, to, cue.speed, WIDTH), heard: now };
				strokes[strokes.length - 1].released = { heard: now, speed: cue.speed, to };
			}
		}
	};
	let lastWheel = -Infinity;
	let ended = true;
	for (const e of events) {
		if (!ended && e.heard > lastWheel + WHEEL_END_MS) {
			apply(follow.tick(), lastWheel + WHEEL_END_MS);
			ended = true;
		}
		if (e.type === "wheel") {
			lastWheel = e.heard;
			ended = false;
			apply(follow.feed({ dx: e.dx, dy: e.dy, t: e.t }), e.heard);
		} else if (e.type !== "momentumBegan") {
			const signal: FingerSignal = e.type === "down" ? { kind: "down", t: e.t } : e.type === "up" ? { kind: "up", t: e.t, lastMove: e.lastMove } : { kind: "momentumEnded", t: e.t, last: e.last };
			apply(follow.signal(signal, moving(e.heard)), e.heard);
		}
	}
	if (!ended) apply(follow.tick(), lastWheel + WHEEL_END_MS);
	return strokes;
}

/** The touches of the session: from a down to its up, the wheel events of the fingers between them, and the momentum after. */
function touches(events: readonly Heard[]) {
	const byTime = [...events].sort((a, b) => a.t - b.t);
	const out: { down: number; up: number; heardUp: number; fingers: number; lastFingerHeard: number; osSpeed: number | null }[] = [];
	let down: number | null = null;
	for (const e of byTime) {
		if (e.type === "down" && down === null) down = e.t;
		if (e.type === "up" && down !== null) {
			const from = down;
			const fingers = byTime.filter((w): w is Extract<Heard, { type: "wheel" }> => w.type === "wheel" && w.t >= from - 0.5 && w.t <= e.t);
			const momentum = byTime.find((m) => m.type === "momentumBegan" && m.t > e.t && m.t - e.t < 60);
			const first = momentum ? byTime.find((w): w is Extract<Heard, { type: "wheel" }> => w.type === "wheel" && w.t >= momentum.t - 0.5) : undefined;
			out.push({ down: from, up: e.t, heardUp: e.heard, fingers: fingers.reduce((s, w) => s + w.dx, 0), lastFingerHeard: Math.max(-Infinity, ...fingers.map((w) => w.heard)), osSpeed: first ? first.dx / (1000 / 120) : null });
			down = null;
		}
	}
	return out;
}

const momentumWheels = (events: readonly Heard[]) => {
	const byTime = [...events].sort((a, b) => a.t - b.t);
	const spans: [number, number][] = [];
	let from: number | null = null;
	for (const e of byTime) {
		if (e.type === "momentumBegan") from = e.t;
		if (e.type === "momentumEnded" && from !== null) {
			spans.push([from, e.t]);
			from = null;
		}
	}
	return byTime.filter((e) => e.type === "wheel" && (e.dx !== 0 || e.dy !== 0) && spans.some(([a, b]) => e.t >= a && e.t <= b)).map((e) => e.t);
};

describe("TrackpadFollow on Max's probe session (Decision 126)", () => {
	const strokes = replay(SESSION);
	const lifts = touches(SESSION);

	it("lets every stroke land at most one place from where it began, and never stands between places", () => {
		expect(strokes.length).toBeGreaterThan(40);
		for (const s of strokes) {
			expect(s.released).toBeDefined();
			expect(Math.abs(s.released!.to - s.origin)).toBeLessThanOrEqual(1);
			expect(Number.isInteger(s.released!.to)).toBe(true);
		}
	});

	it("moves the columns by no delta of the momentum", () => {
		const moved = new Set(strokes.flatMap((s) => s.movedAt));
		expect(momentumWheels(SESSION).filter((t) => moved.has(t))).toEqual([]);
	});

	it("moves the columns by every delta of the fingers, those that reach the page after the lift too", () => {
		const sideways = lifts.filter((l) => Math.abs(l.fingers) > 0);
		for (const lift of sideways) {
			const stroke = strokes.find((s) => s.began <= lift.up && s.began >= lift.down - 100 && s.released && s.released.heard >= lift.heardUp);
			if (!stroke) continue;
			expect(stroke.moved).toBe(lift.fingers);
			expect(stroke.released!.heard).toBeGreaterThanOrEqual(lift.lastFingerHeard);
		}
		expect(sideways.length).toBeGreaterThan(40);
	});

	it("stops the landing columns when the fingers catch them, before macOS says they touched", () => {
		const cuts = SESSION.filter((e): e is Extract<Heard, { type: "momentumEnded" }> => e.type === "momentumEnded" && e.last >= 3);
		const caught = cuts.filter((c) => strokes.some((s) => s.began === c.t));
		const caughtEarly = caught.filter((c) => {
			const touch = SESSION.find((e) => e.type === "down" && e.t > c.t);
			return touch && touch.t - c.t >= 20;
		});
		expect(caught.length).toBeGreaterThan(5);
		expect(caughtEarly.length).toBe(caught.length);
	});

	it("lets go at the speed the OS starts its momentum at: the same flicks, one place on, as by the momentum's first frame", () => {
		const withMomentum = lifts.filter((l) => l.osSpeed !== null && Math.abs(l.fingers) > 0);
		const disagree = withMomentum.filter((l) => {
			const stroke = strokes.find((s) => s.released && s.released.heard >= l.heardUp && s.began <= l.up && s.began >= l.down - 100);
			return stroke && Math.abs(stroke.released!.speed) >= FLICK_SPEED !== Math.abs(l.osSpeed!) >= FLICK_SPEED;
		});
		expect(withMomentum.length).toBeGreaterThan(40);
		expect(disagree).toEqual([]);
	});

	it("lets go within one frame of the lift: on the lift's own signal, or with the fingers' last delta still on its way", () => {
		const waits = lifts
			.map((l) => strokes.find((s) => s.released && s.released.heard >= l.heardUp && s.began <= l.up && s.began >= l.down - 100))
			.filter((s): s is Stroke => !!s)
			.map((s) => s.released!.heard - lifts.find((l) => s.released!.heard >= l.heardUp && s.began <= l.up && s.began >= l.down - 100)!.heardUp);
		expect(Math.max(...waits)).toBeLessThanOrEqual(20);
	});
});

describe("TrackpadFollow's rule", () => {
	const wheel = (t: number, dx: number, dy = 0) => ({ t, dx, dy });

	it("follows the fingers 1:1 from the touch and lets go on the lift at their speed", () => {
		const f = new TrackpadFollow();
		expect(f.signal({ kind: "down", t: 0 }, false)).toEqual([]);
		expect(f.feed(wheel(0, 5))).toEqual([
			{ kind: "begin", t: 0, fresh: true },
			{ kind: "move", t: 0, dx: 5 },
		]);
		expect(f.feed(wheel(8, 10))).toEqual([{ kind: "move", t: 8, dx: 10 }]);
		expect(f.feed(wheel(16, 10))).toEqual([{ kind: "move", t: 16, dx: 10 }]);
		expect(f.signal({ kind: "up", t: 17, lastMove: 16 }, false)).toEqual([{ kind: "release", t: 17, speed: 20 / 16 }]);
		expect(f.feed(wheel(30, 9))).toEqual([]);
	});

	it("waits for the fingers' deltas still on their way after the lift, and no longer", () => {
		const f = new TrackpadFollow();
		f.signal({ kind: "down", t: 0 }, false);
		f.feed(wheel(0, 6));
		expect(f.signal({ kind: "up", t: 17, lastMove: 16.5 }, false)).toEqual([]);
		expect(f.feed(wheel(8, 6))).toEqual([{ kind: "move", t: 8, dx: 6 }]);
		expect(f.feed(wheel(16.5, 6))).toEqual([
			{ kind: "move", t: 16.5, dx: 6 },
			{ kind: "release", t: 17, speed: 12 / 16.5 },
		]);
	});

	it("takes the fingers' last delta as seen within the clocks' parting", () => {
		const f = new TrackpadFollow();
		f.signal({ kind: "down", t: 0 }, false);
		f.feed(wheel(0, 6));
		expect(f.signal({ kind: "up", t: 8, lastMove: 0.2 }, false)).toEqual([{ kind: "release", t: 8, speed: 6 / (1000 / 120) }]);
	});

	it("lets go a lift whose last delta never comes at the next momentum delta, or at the wheel's quiet", () => {
		const a = new TrackpadFollow();
		a.signal({ kind: "down", t: 0 }, false);
		a.feed(wheel(0, 6));
		a.signal({ kind: "up", t: 17, lastMove: 16 }, false);
		expect(a.feed(wheel(25, 30))).toEqual([{ kind: "release", t: 17, speed: 0 }]);
		const b = new TrackpadFollow();
		b.signal({ kind: "down", t: 0 }, false);
		b.feed(wheel(0, 6));
		b.signal({ kind: "up", t: 17, lastMove: 16 }, false);
		expect(b.tick()).toEqual([{ kind: "release", t: 17, speed: 0 }]);
	});

	it("never lets the fingers go while they rest, however long", () => {
		const f = new TrackpadFollow();
		f.signal({ kind: "down", t: 0 }, true);
		expect(f.tick()).toEqual([]);
		expect(f.holding).toBe(true);
		expect(f.signal({ kind: "up", t: 2000, lastMove: null }, false)).toEqual([{ kind: "release", t: 2000, speed: 0 }]);
	});

	it("stops moving columns at the momentum's cut, takes the touch that follows as the same, and lets go at its lift", () => {
		const f = new TrackpadFollow();
		expect(f.signal({ kind: "momentumEnded", t: 100, last: 40 }, true)).toEqual([{ kind: "begin", t: 100, fresh: true }]);
		expect(f.feed(wheel(95, 41))).toEqual([]);
		expect(f.signal({ kind: "down", t: 160 }, true)).toEqual([]);
		expect(f.tick()).toEqual([]);
		expect(f.signal({ kind: "up", t: 400, lastMove: null }, false)).toEqual([{ kind: "release", t: 400, speed: 0 }]);
	});

	it("takes a momentum's natural end, or a cut over standing columns, as no touch", () => {
		const f = new TrackpadFollow();
		expect(f.signal({ kind: "momentumEnded", t: 100, last: 2 }, true)).toEqual([]);
		expect(f.signal({ kind: "momentumEnded", t: 200, last: 40 }, false)).toEqual([]);
		expect(f.holding).toBe(false);
	});

	it("lets go a cut no touch followed at the wheel's quiet", () => {
		const f = new TrackpadFollow();
		f.signal({ kind: "momentumEnded", t: 100, last: 40 }, true);
		expect(f.tick()).toEqual([{ kind: "release", t: 100, speed: 0 }]);
	});

	it("leaves a touch that first moves up or down, or pinches, to the lists", () => {
		const f = new TrackpadFollow();
		f.signal({ kind: "down", t: 0 }, false);
		expect(f.feed(wheel(0, 1, 6))).toEqual([]);
		expect(f.feed(wheel(8, 20, 2))).toEqual([]);
		expect(f.signal({ kind: "up", t: 20, lastMove: 8 }, false)).toEqual([]);
		const g = new TrackpadFollow();
		g.signal({ kind: "down", t: 0 }, false);
		expect(g.feed({ t: 0, dx: 4, dy: 0, ctrl: true })).toEqual([]);
	});

	it("takes a wheel event that reached the page before its touch's signal", () => {
		const f = new TrackpadFollow();
		expect(f.feed(wheel(0, 5))).toEqual([]);
		expect(f.signal({ kind: "down", t: 0 }, false)).toEqual([
			{ kind: "begin", t: 0, fresh: true },
			{ kind: "move", t: 0, dx: 5 },
		]);
	});

	it("lets the previous touch go when a touch comes without the lift before it", () => {
		const f = new TrackpadFollow();
		f.signal({ kind: "down", t: 0 }, false);
		f.feed(wheel(0, 5));
		expect(f.signal({ kind: "down", t: 500 }, false)).toEqual([{ kind: "release", t: 0, speed: 5 / (1000 / 120) }]);
	});
});
