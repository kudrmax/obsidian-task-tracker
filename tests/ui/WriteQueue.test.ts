import { describe, expect, it } from "vitest";
import { WriteQueue } from "../../obsidian/ui/quick/WriteQueue";

function deferred(): { promise: Promise<void>; resolve(): void } {
	let resolve!: () => void;
	const promise = new Promise<void>((r) => (resolve = r));
	return { promise, resolve };
}

describe("WriteQueue", () => {
	it("runs one job at a time, in order, past a failing one", async () => {
		const errors: unknown[] = [];
		const queue = new WriteQueue((e) => errors.push(e));
		const log: string[] = [];
		const first = deferred();
		queue.push(async () => {
			log.push("1 start");
			await first.promise;
			log.push("1 end");
		});
		queue.push(async () => {
			throw new Error("2");
		});
		queue.push(async () => {
			log.push("3");
		});
		await Promise.resolve();
		expect(log).toEqual(["1 start"]);
		first.resolve();
		await queue.idle();
		expect(log).toEqual(["1 start", "1 end", "3"]);
		expect(errors).toHaveLength(1);
	});

	it("goes on when the error handler itself throws", async () => {
		const queue = new WriteQueue(() => {
			throw new Error("handler");
		});
		const log: string[] = [];
		queue.push(async () => {
			throw new Error("job");
		});
		queue.push(async () => {
			log.push("next");
		});
		await queue.idle();
		expect(log).toEqual(["next"]);
	});
});
