import { describe, expect, it } from "vitest";
import { FramePass, type Frames } from "../../obsidian/ui/FramePass";

function manualFrames() {
	const queue = new Map<number, () => void>();
	let next = 1;
	const frames: Frames = {
		request: (run) => {
			queue.set(next, run);
			return next++;
		},
		cancel: (id) => queue.delete(id),
	};
	const runFrames = () => {
		const due = [...queue.values()];
		queue.clear();
		due.forEach((run) => run());
	};
	return { frames, queue, runFrames };
}

describe("FramePass", () => {
	it("runs once in the next frame however often it is asked", () => {
		const { frames, queue, runFrames } = manualFrames();
		let runs = 0;
		const pass = new FramePass(() => runs++, frames);
		for (let i = 0; i < 10; i++) pass.ask();
		expect(queue.size).toBe(1);
		expect(runs).toBe(0);
		runFrames();
		expect(runs).toBe(1);
		pass.ask();
		expect(queue.size).toBe(1);
	});

	it("now runs at once and drops the frame asked", () => {
		const { frames, queue, runFrames } = manualFrames();
		let runs = 0;
		const pass = new FramePass(() => runs++, frames);
		pass.ask();
		pass.now();
		expect(runs).toBe(1);
		expect(queue.size).toBe(0);
		runFrames();
		expect(runs).toBe(1);
		pass.ask();
		expect(queue.size).toBe(1);
	});

	it("cancel drops the frame", () => {
		const { frames, queue, runFrames } = manualFrames();
		let runs = 0;
		const pass = new FramePass(() => runs++, frames);
		pass.ask();
		pass.cancel();
		expect(queue.size).toBe(0);
		runFrames();
		expect(runs).toBe(0);
		pass.ask();
		expect(queue.size).toBe(1);
	});
});
