import { describe, expect, it } from "vitest";
import type { ScreenView } from "../../core/application/contracts";
import { callDoor, type DoorAnswer, type DoorContext } from "../../core/application/PhoneCalls";
import { ReadingCache } from "../../core/application/ReadingCache";
import { bigTasksFile } from "../application/bigTasksFile";

/**
 * A plugin runtime calls the door inside a user's event, so a call over a text and settings it saw before costs under a
 * millisecond on a 30 KB tasks file: a view, a write, a step of a carry. Each measure is reported against that target;
 * the gate fails only far past it, so a release never stops on a busy machine.
 */

const DAY = "2026-11-15";
const NOW = new Date(2026, 10, 15, 9, 30).getTime();
/** The target: what a call takes on a quiet machine, reported with each measure. */
const BUDGET_MS = 1;
/** What fails the gate: well past the target, never a busy machine's noise (a parallel test run more than doubles a call). */
const GATE_MS = 3 * BUDGET_MS;

type Ok = Extract<DoorAnswer, { ok: true }>;

/** The fastest of several rounds' average: load and the collector only ever slow a round down. */
function averageMs(call: () => DoorAnswer): number {
	for (let i = 0; i < 20; i++) call();
	const rounds: number[] = [];
	for (let round = 0; round < 9; round++) {
		const start = performance.now();
		for (let i = 0; i < 30; i++) if (!call().ok) throw new Error("the call failed");
		rounds.push((performance.now() - start) / 30);
	}
	return Math.min(...rounds);
}

describe("a door call on a 30 KB tasks file, warm", () => {
	const text = bigTasksFile(DAY);
	const cache = new ReadingCache();
	const tidy = callDoor("tasks.normalize", [], { tasks: text, nowMs: NOW }, cache) as Ok;
	const base: DoorContext = { tasks: tidy.tasks ?? text, nowMs: NOW, ids: tidy.ids };
	const screen = (callDoor("tasks.screen", [DAY], base, cache) as Ok).result as ScreenView;
	const key = screen.inbox[3].key;
	const carrying: DoorContext = { ...base, projectsScreen: (callDoor("tasks.startCarry", [{ keys: [key] }, false], base, cache) as Ok).projectsScreen };

	it("is a file of about 30 KB", () => {
		expect(text.length).toBeGreaterThan(28_000);
		expect(text.length).toBeLessThan(34_000);
	});

	for (const [method, args, context] of [
		["tasks.funnelView", [true], base],
		["tasks.screen", [DAY], base],
		["tasks.setStatus", [key, "done"], base],
		["tasks.carryAt", [{ edge: true, node: null }, 1000], carrying],
		["tasks.endCarry", ["cancelled"], carrying],
	] as const) {
		it(`${method}: target ${BUDGET_MS} ms, fails past ${GATE_MS} ms`, () => {
			const ms = averageMs(() => callDoor(method, [...args], context, cache));
			console.log(`${method}: ${ms.toFixed(3)} ms (target ${BUDGET_MS} ms${ms < BUDGET_MS ? "" : ", MISSED"})`);
			expect(ms, `${method} took ${ms.toFixed(3)} ms`).toBeLessThan(GATE_MS);
		});
	}
});
