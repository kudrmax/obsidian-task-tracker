import { describe, expect, it } from "vitest";
import type { PriorityLevel } from "../../src/settings";
import { LevelEdits } from "../../src/ui/priorityLevels";

function edits(start: readonly PriorityLevel[]) {
	let levels = start;
	return { edits: new LevelEdits(() => levels, async (next) => void (levels = next)), levels: () => levels };
}

describe("editing the priority levels", () => {
	const DEFAULT: readonly PriorityLevel[] = [
		{ prefix: "p1", color: "red" },
		{ prefix: "p2", color: "orange" },
	];

	it("keeps a prefix just typed when a level is added or removed right after", async () => {
		const added = edits(DEFAULT);
		await added.edits.rename(0, " high ");
		await added.edits.add();
		expect(added.levels().map((l) => l.prefix)).toEqual(["high", "p2", "p3"]);
		const removed = edits(DEFAULT);
		await removed.edits.rename(0, "high");
		await removed.edits.remove(1);
		expect(removed.levels()).toEqual([{ prefix: "high", color: "red" }]);
	});

	it("adds the next free prefix in the first unused colour, and recolours a level", async () => {
		const e = edits([{ prefix: "p3", color: "red" }]);
		await e.edits.add();
		expect(e.levels()[1]).toEqual({ prefix: "p2", color: "orange" });
		await e.edits.recolour(1, "blue");
		expect(e.levels()[1].color).toBe("blue");
	});
});
