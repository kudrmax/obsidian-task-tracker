import { describe, expect, it } from "vitest";
import { isRef, RefBook, shortRef } from "../../core/application/agent/agentWire";
import type { TaskKey } from "../../core/application/contracts";
import { makeVault, run } from "./vault";

/** A ref is short (`t` and 8 hex digits), the same for the same task in every run, and never names two tasks of a file. */

const key = (raw: string, index = 0, path: number[] = []): TaskKey => ({ section: "now", index, path, raw });

/** Two keys of one file whose short refs are alike, found by trying lines until two hash alike. */
function twins(): [TaskKey, TaskKey] {
	const seen = new Map<string, TaskKey>();
	for (let i = 0; ; i++) {
		const k = key(`- [ ] Task ${i}`, i);
		const other = seen.get(shortRef(k));
		if (other) return [other, k];
		seen.set(shortRef(k), k);
	}
}

describe("refs", () => {
	it("round-trip: each task's ref resolves to its key, a ref of no task to none", () => {
		const keys = [key("- [ ] A"), key("- [ ] B", 1), key("\t- [ ] A", 0, [0]), { section: "soon" as const, index: 0, path: [], raw: "- [ ] A" }];
		const book = new RefBook(keys);
		for (const k of keys) {
			expect(book.refOf(k)).toMatch(/^t[0-9a-f]{8}$/);
			expect(book.keyOf(book.refOf(k))).toEqual(k);
		}
		expect(new Set(keys.map((k) => book.refOf(k))).size).toBe(keys.length);
		expect(book.keyOf("t00000000")).toBeNull();
		expect(book.refOf(key("- [ ] A"))).toBe(shortRef(key("- [ ] A")));
	});

	it("tasks of one file whose short refs are alike both get long ones, and each resolves to its own", () => {
		const [a, b] = twins();
		expect(shortRef(a)).toBe(shortRef(b));
		const book = new RefBook([a, b, key("- [ ] Other", 99999999)]);
		expect(book.refOf(a)).toMatch(/^t[0-9a-f]{16}$/);
		expect(book.refOf(b)).toMatch(/^t[0-9a-f]{16}$/);
		expect(book.refOf(a)).not.toBe(book.refOf(b));
		expect(book.keyOf(book.refOf(a))).toEqual(a);
		expect(book.keyOf(book.refOf(b))).toEqual(b);
		expect(book.keyOf(shortRef(a))).toBeNull();
		expect(book.refOf(key("- [ ] Other", 99999999))).toMatch(/^t[0-9a-f]{8}$/);
	});

	it("are of their shape and nothing else", () => {
		expect(isRef("t0123abcd")).toBe(true);
		expect(isRef("t0123abcd0123abcd")).toBe(true);
		for (const bad of ["0123abcd", "t0123abc", "t0123abcde", "t0123ABCD", "t0123abcg", "inbox"]) expect(isRef(bad)).toBe(false);
	});

	it("the same task has the same ref in every run; task <ref> reads it back", async () => {
		const vault = makeVault();
		const first = (await run(vault, ["all"])).answer.tasks;
		const second = (await run(vault, ["all"])).answer.tasks;
		expect(second.map((t: { ref: string }) => t.ref)).toEqual(first.map((t: { ref: string }) => t.ref));
		for (const task of first) expect((await run(vault, ["task", task.ref])).answer.task).toMatchObject({ ref: task.ref, title: task.title });
	});
});
