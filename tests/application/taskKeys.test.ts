import { describe, expect, it } from "vitest";
import type { TaskKey } from "../../core/application/contracts";
import { keyId, sameLine, samePlace, sameTaskTree } from "../../core/application/taskKeys";

const key = (extra: Partial<TaskKey> = {}): TaskKey => ({ section: "now", index: 1, path: [], raw: "- [ ] A", ...extra });

describe("samePlace", () => {
	it("is the same section, index and path, whatever the line reads", () => {
		expect(samePlace(key(), key({ raw: "- [x] A changed" }))).toBe(true);
		expect(samePlace(key({ path: [1, 0] }), key({ path: [1, 0], raw: "" }))).toBe(true);
	});

	it("is another place for another section, index or path", () => {
		expect(samePlace(key(), key({ section: "soon" }))).toBe(false);
		expect(samePlace(key(), key({ index: 2 }))).toBe(false);
		expect(samePlace(key({ path: [1] }), key({ path: [2] }))).toBe(false);
		expect(samePlace(key({ path: [1] }), key({ path: [1, 0] }))).toBe(false);
		expect(samePlace(key({ path: [] }), key({ path: [0] }))).toBe(false);
	});
});

describe("sameLine", () => {
	it("is the same line as read, wherever it stands", () => {
		expect(sameLine(key(), key({ section: "soon", index: 4, path: [2] }))).toBe(true);
		expect(sameLine(key(), key({ raw: "- [ ] B" }))).toBe(false);
	});
});

describe("sameTaskTree", () => {
	it("is one task of a list with its subtasks", () => {
		expect(sameTaskTree(key(), key({ path: [0, 1], raw: "- [ ] A1" }))).toBe(true);
		expect(sameTaskTree(key({ path: [0] }), key({ path: [1] }))).toBe(true);
	});

	it("is another task for another section or index", () => {
		expect(sameTaskTree(key(), key({ section: "inbox" }))).toBe(false);
		expect(sameTaskTree(key(), key({ index: 0 }))).toBe(false);
	});
});

describe("keyId", () => {
	it("names the task as read: its place and its line", () => {
		expect(keyId(key({ path: [1, 0] }))).toBe("now:1:1.0:- [ ] A");
		expect(keyId(key())).toBe(keyId(key()));
	});

	it("differs for another line or another place", () => {
		expect(keyId(key({ raw: "- [ ] B" }))).not.toBe(keyId(key()));
		expect(keyId(key({ path: [0] }))).not.toBe(keyId(key()));
		expect(keyId(key({ index: 2 }))).not.toBe(keyId(key()));
		expect(keyId(key({ section: "soon" }))).not.toBe(keyId(key()));
	});
});
