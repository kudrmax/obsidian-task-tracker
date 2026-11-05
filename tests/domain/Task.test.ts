import { describe, expect, it } from "vitest";
import { canRemind, isOpen, nextProgress, nextReminder } from "../../src/domain/Task";

describe("an open task", () => {
	it("is one to do or in progress, not one done or given up", () => {
		expect((["todo", "inProgress", "done", "cancelled"] as const).map(isOpen)).toEqual([true, true, false, false]);
	});
});

describe("In progress and Stop progress", () => {
	it("puts a task in progress, and one in progress back to todo", () => {
		expect((["todo", "inProgress", "done", "cancelled"] as const).map((status) => nextProgress([status]))).toEqual(["inProgress", "todo", "inProgress", "inProgress"]);
	});

	it("stops the progress of several only when every one is in progress", () => {
		expect(nextProgress(["inProgress", "inProgress"])).toBe("todo");
		expect(nextProgress(["inProgress", "todo"])).toBe("inProgress");
		expect(nextProgress(["done", "inProgress"])).toBe("inProgress");
	});
});

describe("a reminder", () => {
	it("goes notification, alarm, off, and round", () => {
		expect([nextReminder("notification"), nextReminder("alarm"), nextReminder("live"), nextReminder("none")]).toEqual(["alarm", "live", "none", "notification"]);
	});

	it("is had only by a task on a time", () => {
		expect(canRemind({ date: "2026-11-05", start: 600, end: null })).toBe(true);
		expect(canRemind(null)).toBe(false);
	});
});
