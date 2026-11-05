import { describe, expect, it } from "vitest";
import { isOpen } from "../../src/domain/Task";

describe("an open task", () => {
	it("is one to do or in progress, not one done or given up", () => {
		expect((["todo", "inProgress", "done", "cancelled"] as const).map(isOpen)).toEqual([true, true, false, false]);
	});
});
