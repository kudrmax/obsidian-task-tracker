import { describe, expect, it } from "vitest";
import { CorePort } from "../../obsidian/adapters/CorePort";
import { memoryCore } from "../../obsidian/memoryCore";

/** 2026-11-25, two in the afternoon: the day runs from 05:00 to 05:00 of the 26th (Day starts at). */
const NOW = new Date(2026, 10, 25, 14, 0);
const FILE = ["## Inbox", "", "## Now", "", "- [ ] Ночной созвон ⏰ 2026-11-26 01:00-01:30", "- [ ] Утренний бег ⏰ 2026-11-26 07:00-07:30", "", "## Soon", "", "## Backlog", "", "## Done", ""].join("\n");

describe("a slot after midnight stands on its night (F315, master 0.4.216)", () => {
	it("a task written for 01:00 of the next date is on tonight's calendar, after midnight; 07:00 of that date is tomorrow's", async () => {
		const made = memoryCore(FILE, { now: () => NOW });
		const port = await CorePort.open({ ...made.core, clock: made.clock, tasksFile: () => made.settings.get().tasksFile, onError: (error) => {
			throw error;
		} });
		const titles = (offset: number) => {
			const data = port.read(offset);
			return data.day.blocks.map((block) => [data.cards[block.id].title, block.start]);
		};
		expect(titles(0)).toEqual([["Ночной созвон", 20 * 60]]);
		expect(titles(1)).toEqual([["Утренний бег", 2 * 60]]);
	});
});
