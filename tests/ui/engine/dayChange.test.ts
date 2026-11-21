import { describe, expect, it } from "vitest";
import { changeOffsets, type DayChange, retarget } from "../../../obsidian/ui/engine/gestures/dayChange";

const on: DayChange = { from: 0, to: 1, outWay: -1, inWay: 1 };

describe("the calendar's day change on the list's landing (Decision 127)", () => {
	it("takes the old day out in the first half and brings the new one in in the second, never both in sight", () => {
		expect(changeOffsets(on, 0)).toEqual({ from: -0, to: 1 });
		expect(changeOffsets(on, 0.25)).toEqual({ from: -0.5, to: 1 });
		expect(changeOffsets(on, 0.5)).toEqual({ from: -1, to: 1 });
		expect(changeOffsets(on, 0.75)).toEqual({ from: -1, to: 0.5 });
		expect(changeOffsets(on, 1)).toEqual({ from: -1, to: 0 });
		for (let p = 0; p <= 1; p += 0.01) {
			const { from, to } = changeOffsets(on, p);
			expect(Math.abs(from) === 1 || Math.abs(to) === 1).toBe(true);
		}
	});

	it("starts a change only to another day: the old day leaves the way the list went, the new one comes from the other side", () => {
		expect(retarget(null, 1, 3, 3)).toEqual({ change: null, progress: 1 });
		expect(retarget(null, 1, 0, 1)).toEqual({ change: on, progress: 0 });
		expect(retarget(null, 1, 2, 1)).toEqual({ change: { from: 2, to: 1, outWay: 1, inWay: -1 }, progress: 0 });
	});

	it("keeps what is in sight where it stands when a landing takes the list on mid-change", () => {
		const same = retarget(on, 0.3, 0, 1);
		expect(same).toEqual({ change: on, progress: 0.3 });
		for (const p of [0.2, 0.7]) {
			const before = changeOffsets(on, p);
			const back = retarget(on, p, 0, 0);
			const after = changeOffsets(back.change!, back.progress);
			expect(after.to).toBeCloseTo(before.from);
			expect(after.from).toBeCloseTo(before.to);
			const third = retarget(on, p, 0, 2);
			const now = changeOffsets(third.change!, third.progress);
			const shown = p < 0.5 ? before.from : before.to;
			expect(now.from).toBeCloseTo(shown);
			expect(Math.abs(now.to)).toBe(1);
			expect(third.change!.to).toBe(2);
		}
	});
});
