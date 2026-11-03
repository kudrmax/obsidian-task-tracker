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

	it("runs the hooks right before applying the value fetched after them", async () => {
		const order: string[] = [];
		let n = 0;
		const reload = new Reload(async () => ++n, (v) => order.push(`apply:${v}`));
		await reload.request(() => order.push("hook"));
		expect(order).toEqual(["hook", "apply:1"]);
	});

	it("a hook given during a fetch waits for the fetch after it", async () => {
		const fetches = [deferred<string>(), deferred<string>()];
		let n = 0;
		const applied: string[] = [];
		const seen: string[][] = [];
		let hooks = 0;
		const reload = new Reload(() => fetches[n++].promise, (v) => applied.push(v));
		const first = reload.request();
		const second = reload.request(() => {
			hooks++;
			seen.push([...applied]);
		});
		fetches[0].resolve("stale");
		await Promise.resolve();
		expect(hooks).toBe(0);
		fetches[1].resolve("fresh");
		await Promise.all([first, second]);
		expect(hooks).toBe(1);
		expect(seen).toEqual([[]]);
		expect(applied).toEqual(["fresh"]);
	});

	it("serves a request made while the last value is applied with a fetch of its own, its hook with it", async () => {
		let n = 0;
		const applied: number[] = [];
		const order: string[] = [];
		let late: Promise<void> | null = null;
		const reload: Reload<number> = new Reload(async () => ++n, (v) => {
			applied.push(v);
			late ??= reload.request(() => order.push("late hook"));
		});
		await reload.request();
		await late;
		expect(applied).toEqual([1, 2]);
		expect(order).toEqual(["late hook"]);
	});

	it("drops the hooks of a fetch that failed", async () => {
		let fail = true;
		let hooks = 0;
		const applied: string[] = [];
		const reload = new Reload(async () => {
			if (fail) throw new Error("boom");
			return "ok";
		}, (v) => applied.push(v));
		await expect(reload.request(() => hooks++)).rejects.toThrow("boom");
		expect(hooks).toBe(0);
		fail = false;
		await reload.request();
		expect(applied).toEqual(["ok"]);
		expect(hooks).toBe(0);
	});
});

