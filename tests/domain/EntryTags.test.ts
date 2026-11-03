import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryTags } from "../../src/domain/EntryTags";
import { TaskDocument, type TaskEntry } from "../../src/domain/TaskDocument";

const M = { dueDate: "📅", slot: "⏰" };
const SECTIONS = { inbox: "Inbox", now: "Now", soon: "Soon", done: "Done" };

function fifty(): string {
	const lines = ["## Now"];
	for (let i = 0; i < 40; i++) lines.push(`- [ ] Task ${i} 📅 2026-11-03`, ...(i % 10 === 0 ? [`\t- [ ] Sub ${i}`, `\t\t- [ ] Deep ${i}`] : []));
	lines.push("", "## Soon");
	for (let i = 0; i < 10; i++) lines.push(`- [/] Later ${i}`);
	lines.push("", "## Done", "- [x] Old");
	return lines.join("\n") + "\n";
}

function subtasksOf(entry: TaskEntry): TaskEntry[] {
	return entry.subtasks.flatMap((sub) => [sub, ...subtasksOf(sub)]);
}

describe("EntryTags", () => {
	afterEach(() => vi.restoreAllMocks());

	it("tags and untags 50 tasks with one rewrite of the document each", () => {
		const doc = TaskDocument.parse(fifty(), SECTIONS, M);
		const all = doc.allTasks().flatMap((e) => [e, ...subtasksOf(e)]);
		const chosen = all.slice(5, 55).reverse();
		expect(chosen).toHaveLength(50);
		const replace = vi.spyOn(TaskDocument.prototype, "replace");
		const replaceAll = vi.spyOn(TaskDocument.prototype, "replaceAll");
		const { doc: tagged, tags } = EntryTags.tag(doc, chosen);
		expect(replaceAll).toHaveBeenCalledTimes(1);
		chosen.forEach((entry, n) => {
			const found = tags.find(tagged, n)!;
			expect([found.section, found.index, found.path]).toEqual([entry.section, entry.index, entry.path]);
			expect(found.task.text.startsWith(entry.task.text)).toBe(true);
		});
		const clean = tags.untag(tagged);
		expect(replaceAll).toHaveBeenCalledTimes(2);
		expect(replace).not.toHaveBeenCalled();
		expect(clean.serialize()).toBe(doc.serialize());
	});

	it("untags a task that the operations dropped", () => {
		const doc = TaskDocument.parse(fifty(), SECTIONS, M);
		const [a, b] = doc.tasks("soon");
		const { doc: tagged, tags } = EntryTags.tag(doc, [a, b]);
		const without = tagged.removeEntry(tags.find(tagged, 0)!);
		expect(tags.untag(without).serialize()).toBe(doc.removeEntry(a).serialize());
	});
});
