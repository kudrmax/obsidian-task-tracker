import { describe, expect, it } from "vitest";
import { callDoor, type DoorAnswer, type DoorContext } from "../../core/application/PhoneCalls";
import { ReadingCache } from "../../core/application/ReadingCache";
import { bigTasksFile } from "../application/bigTasksFile";
import { DAY, harness, itemOf, ok } from "../runtime/harness";

/**
 * The runtime's own share on top of the door (the replica's context, a key found by its id, the answer taken, the call
 * logged): a view, a read naming a task, a step of a carry and a write over a 30 KB file, warm, against the door's target;
 * the gate fails only far past it. The write's persistence runs after, outside the event. A write over a text that changes
 * with every call costs the door about as much as the target itself; the runtime's own share on top of it is measured apart.
 */
const BUDGET_MS = 1;
const GATE_MS = 3 * BUDGET_MS;

function fastestMs(call: () => DoorAnswer): number {
	for (let i = 0; i < 20; i++) call();
	const rounds: number[] = [];
	for (let round = 0; round < 9; round++) {
		const start = performance.now();
		for (let i = 0; i < 30; i++) if (!call().ok) throw new Error("the call failed");
		rounds.push((performance.now() - start) / 30);
	}
	return Math.min(...rounds);
}

describe("a call through the runtime on a 30 KB tasks file, warm", async () => {
	const { runtime } = await harness({ file: bigTasksFile(DAY) });
	const item = itemOf(runtime, "Inbox idea number 3 about something to sort later");
	ok(runtime.call("tasks.startCarry", [{ keys: [item.key] }, false]).answer);
	const written = itemOf(runtime, "Inbox idea number 5 about something to sort later");
	let done = false;
	const write = () => runtime.call("tasks.setStatus", [written.key, (done = !done) ? "inProgress" : "todo"]).answer;

	for (const [name, call] of [
		["tasks.screen", () => runtime.read("tasks.screen", [DAY])],
		["tasks.fullTree", () => runtime.read("tasks.fullTree", [item])],
		["tasks.carryAt", () => runtime.call("tasks.carryAt", [{ edge: true, node: null }, 1000]).answer],
		["tasks.setStatus", write],
	] as const) {
		it(`${name}: target ${BUDGET_MS} ms, fails past ${GATE_MS} ms`, () => {
			const ms = fastestMs(call);
			console.log(`runtime ${name}: ${ms.toFixed(3)} ms (target ${BUDGET_MS} ms${ms < BUDGET_MS ? "" : ", MISSED"})`);
			expect(ms, `${name} took ${ms.toFixed(3)} ms`).toBeLessThan(GATE_MS);
		});
	}

	it("tasks.setStatus: the runtime's own share on top of the door making the same writes is small", () => {
		const cache = new ReadingCache();
		let context: DoorContext = runtime.replica.context(new Date(2026, 10, 15, 12, 0).getTime());
		let on = false;
		const doorOnly = (): DoorAnswer => {
			const answer = callDoor("tasks.setStatus", [written.key, (on = !on) ? "inProgress" : "todo"], context, cache);
			if (answer.ok) context = { ...context, tasks: answer.tasks ?? context.tasks, history: answer.history ?? context.history, ids: answer.ids ?? context.ids };
			return answer;
		};
		const door = fastestMs(doorOnly);
		const through = fastestMs(write);
		console.log(`setStatus over a text that changes each call: door ${door.toFixed(3)} ms, through the runtime ${through.toFixed(3)} ms`);
		expect(through - door, "the runtime's own share").toBeLessThan(BUDGET_MS / 2);
	});
});
