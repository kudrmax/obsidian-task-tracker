import { describe, expect, it } from "vitest";
import { undoNotice } from "../../core/application/contracts";

describe("undoNotice", () => {
	it("says a step the file changed under, and nothing for a step done or none to take", () => {
		expect(undoNotice("undo", "conflict")).toBe("Can’t undo: the tasks file changed");
		expect(undoNotice("redo", "conflict")).toBe("Can’t redo: the tasks file changed");
		for (const step of ["undo", "redo"] as const) for (const outcome of ["done", "nothing"] as const) expect(undoNotice(step, outcome)).toBeNull();
	});
});
