import { describe, expect, it } from "vitest";
import { shortRef as refOf } from "../../core/application/agent/agentWire";
import { settingsFrom } from "../../core/settings";
import { CorePort } from "../../obsidian/adapters/CorePort";
import { memoryCore } from "../../obsidian/memoryCore";
import type { ListId, ScreenData } from "../../obsidian/ui/engine/port";
import { makeVault, NOW, run, SETTINGS, T, TASKS } from "./vault";

/**
 * What `CorePort` gives the engine is what the agents' program reads (the plan's step 5): each list the screen draws is
 * the program's list of that place, section by section, card by card, and each day's calendar its timeline.
 */

type Wired = { readonly ref: string };
type WiredSection = { readonly tasks: readonly Wired[] };

async function engineScreen() {
	const { core, clock } = memoryCore(TASKS, { now: () => NOW }, settingsFrom(JSON.parse(SETTINGS)));
	const port = await CorePort.open({ ...core, clock, onError: (error) => {
		throw error;
	} });
	const reader = await core.tasks.reader(null);
	const refOfId = (id: string) => refOf(reader.item(id)!.key);
	return { port, refOfId };
}

/** A list's tasks of the top level, section by section, as the engine draws them. */
function sectionsOf(data: ScreenData, list: ListId, refOfId: (id: string) => string): string[][] {
	const groups: string[][] = [];
	for (const row of data.lists[list].rows) {
		if (row.kind === "section" || groups.length === 0) groups.push([]);
		if (row.kind === "task" && row.depth === 0) groups[groups.length - 1].push(refOfId(row.id));
	}
	return groups;
}

const wired = (sections: readonly WiredSection[]) => sections.map((s) => s.tasks.map((t) => t.ref));

describe("CorePort gives the engine what the agents' program reads", () => {
	it("Inbox, Soon and each day's list and calendar: the same sections, the same tasks, in the same order", async () => {
		const { port, refOfId } = await engineScreen();
		const vault = makeVault();
		const today = port.read(0);
		expect(today.lists.soon.rows.length * today.lists.day.rows.length * today.day.blocks.length).toBeGreaterThan(0);
		for (const list of ["inbox", "soon"] as const) expect({ list, sections: sectionsOf(today, list, refOfId) }).toEqual({ list, sections: wired((await run(vault, [list])).answer.sections) });
		for (const [offset, date] of [[0, T], [1, "2026-11-19"], [2, "2026-11-20"], [3, "2026-11-21"], [4, "2026-11-22"]] as const) {
			const data = port.read(offset);
			const day = (await run(vault, ["day", date])).answer;
			expect({ date, list: sectionsOf(data, "day", refOfId) }).toEqual({ date, list: wired(day.list.sections) });
			expect({ date, timeline: data.day.blocks.map((b) => refOfId(b.id)) }).toEqual({ date, timeline: day.timeline.map((t: Wired) => t.ref) });
		}
	});
});
