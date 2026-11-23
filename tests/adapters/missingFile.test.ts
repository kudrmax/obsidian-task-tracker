import { describe, expect, it } from "vitest";
import { CorePort } from "../../obsidian/adapters/CorePort";
import { memoryCore } from "../../obsidian/memoryCore";

const NOW = new Date(2026, 10, 22, 12, 0);

describe("no tasks file (F6)", () => {
	it("the screen says where it was looked for and offers to create it; created, the five sections are there and the screen reads them", async () => {
		const made = memoryCore(null, { now: () => NOW }, { tasksFile: "Задачи.md" });
		const port = await CorePort.open({ ...made.core, clock: made.clock, tasksFile: () => made.settings.get().tasksFile, opens: { line: () => undefined, event: () => undefined }, onError: (error) => {
			throw error;
		} });
		expect(port.read(0).missing).toEqual({ text: "No tasks file at Задачи.md", create: "Create file" });
		await port.createFile();
		expect(made.file.text).toMatch(/## Inbox[\s\S]*## Now[\s\S]*## Soon[\s\S]*## Backlog[\s\S]*## Done/);
		expect(port.read(0).missing).toBeNull();
	});
});
