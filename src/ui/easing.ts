/** The share of the way gone at a share of the time, both from 0 to 1. */
export type Easing = (t: number) => number;

const linear: Easing = (t) => t;

/** CSS's cubic-bezier(x1, y1, x2, y2): the curve's x is time, solved for `t` by Newton's steps, then bisection where they stall. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Easing {
	const at = (p1: number, p2: number, s: number) => 3 * p1 * s * (1 - s) ** 2 + 3 * p2 * s ** 2 * (1 - s) + s ** 3;
	const slope = (p1: number, p2: number, s: number) => 3 * p1 * (1 - s) ** 2 + 6 * (p2 - p1) * s * (1 - s) + 3 * (1 - p2) * s ** 2;
	const solve = (t: number): number => {
		let s = t;
		for (let i = 0; i < 8; i++) {
			const error = at(x1, x2, s) - t;
			if (Math.abs(error) < 1e-6) return s;
			const d = slope(x1, x2, s);
			if (Math.abs(d) < 1e-6) break;
			s -= error / d;
		}
		let low = 0;
		let high = 1;
		s = t;
		while (high - low > 1e-6) {
			if (at(x1, x2, s) < t) low = s;
			else high = s;
			s = (low + high) / 2;
		}
		return s;
	};
	return (t) => (t <= 0 ? 0 : t >= 1 ? 1 : at(y1, y2, solve(t)));
}

/** An easing as a stylesheet token gives it: a cubic-bezier(…) is that curve, anything else runs evenly. */
export function easingOf(css: string): Easing {
	const match = /cubic-bezier\(([^)]*)\)/.exec(css);
	const points = match?.[1].split(",").map(Number) ?? [];
	return points.length === 4 && points.every(Number.isFinite) ? cubicBezier(points[0], points[1], points[2], points[3]) : linear;
}
