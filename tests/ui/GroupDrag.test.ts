import { describe, expect, it } from "vitest";
import { liftedPlace, nearestSlot } from "../../src/ui/drag/GroupDrag";

const GROUPS = [null, "Morning", "Экскурсия"];

describe("a lifted section", () => {
	it("a drop between Morning and Экскурсия moves the group before Экскурсия", () => {
		expect(liftedPlace(GROUPS, 0, 2)).toEqual({ before: "Экскурсия" });
	});

	it("a drop after the last group is end", () => {
		expect(liftedPlace(GROUPS, 1, 3)).toBe("end");
	});

	it("the ungrouped group moves too, and others go above it", () => {
		expect(liftedPlace(GROUPS, 0, 3)).toBe("end");
		expect(liftedPlace(GROUPS, 2, 0)).toEqual({ before: null });
	});

	it("its own place moves nothing", () => {
		expect(liftedPlace(GROUPS, 1, 1)).toBeNull();
		expect(liftedPlace(GROUPS, 1, 2)).toBeNull();
	});

	it("nearestSlot takes the slot whose place is closest to the finger", () => {
		expect(nearestSlot([100, 200, 300, 400], 240)).toBe(1);
		expect(nearestSlot([100, 200, 300, 400], 900)).toBe(3);
	});
});
