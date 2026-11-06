import { describe, expect, it } from "vitest";
import { StaleTaskError, TasksFileMissingError } from "../../core/application/contracts";
import { failureText } from "../../obsidian/ui/failureText";

describe("failureText", () => {
	it("says a task changed under the screen in the screen's words", () => {
		expect(failureText(new StaleTaskError())).toBe("The task changed in the file; the view was refreshed");
	});

	it("says a missing tasks file by its path, any other failure by its own text", () => {
		expect(failureText(new TasksFileMissingError("TODOs Tasks.md"))).toBe("Tasks file not found: TODOs Tasks.md");
		expect(failureText(new Error("disk full"))).toBe("disk full");
		expect(failureText("odd")).toBe("odd");
	});
});
