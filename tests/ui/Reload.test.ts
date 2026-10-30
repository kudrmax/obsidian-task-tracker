import { describe, expect, it } from "vitest";
import { Reload } from "../../src/ui/Reload";

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((r) => (resolve = r));
	return { promise, resolve };
}

describe("Reload", () => {
	it("fetches and applies once per request when nothing overlaps", async () => {
		let n = 0;
		const applied: number[] = [];
		const reload = new Reload(async () => ++n, (v) => applied.push(v));
		await reload.request();
		await reload.request();
		expect(applied).toEqual([1, 2]);
	});

	it("folds requests made during a fetch into one more fetch, and applies only the freshest value", async () => {
		const fetches = [deferred<string>(), deferred<string>()];
		let n = 0;
		const applied: string[] = [];
		const reload = new Reload(() => fetches[n++].promise, (v) => applied.push(v));
		const first = reload.request();
		const second = reload.request();
		const third = reload.request();
		fetches[0].resolve("stale");
		await Promise.resolve();
		fetches[1].resolve("fresh");
		await Promise.all([first, second, third]);
		expect(n).toBe(2);
		expect(applied).toEqual(["fresh"]);
	});

	it("rejects with the fetch's error and serves the next request afresh", async () => {
		let fail = true;
		const applied: string[] = [];
		const reload = new Reload(async () => {
			if (fail) throw new Error("boom");
			return "ok";
		}, (v) => applied.push(v));
		await expect(reload.request()).rejects.toThrow("boom");
		fail = false;
		await reload.request();
		expect(applied).toEqual(["ok"]);
	});
});
