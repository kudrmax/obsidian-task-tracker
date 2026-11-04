import { describe, expect, it } from "vitest";
import type { TaskItem, TaskKey } from "../../src/application/contracts";
import { MenuTask } from "../../src/ui/menu/MenuTask";

const key = (raw: string): TaskKey => ({ section: "now", index: 0, path: [], raw });
const item = (raw: string): TaskItem => ({ key: key(raw), text: "A", status: "todo", dueDate: null, slot: null, repeat: null, priority: null, subtasks: [], progress: null, parentText: null, description: null, group: null });

describe("MenuTask", () => {
	it("hands the next change the task with the key the change before it gave", async () => {
		const task = new MenuTask(item("- [ ] A"));
		const seen: string[] = [];
		await task.run(async (current) => {
			seen.push(current.key.raw);
			return key("- [ ] A 🔁 every day");
		});
		await task.run(async (current) => {
			seen.push(current.key.raw);
		});
		expect(seen).toEqual(["- [ ] A", "- [ ] A 🔁 every day"]);
	});

	it("gives the task as the last change left it to an action that writes nothing", async () => {
		const task = new MenuTask(item("- [ ] A 🔁 every day"));
		await task.run(async () => key("- [ ] A"));
		expect(task.item.key.raw).toBe("- [ ] A");
		expect(task.item.text).toBe("A");
	});

	it("runs a change only after the one before it ends, even when both are asked at once", async () => {
		const task = new MenuTask(item("a"));
		const seen: string[] = [];
		let release: (() => void) | null = null;
		const first = task.run(async () => {
			await new Promise<void>((r) => (release = r));
			return key("b");
		});
		const second = task.run(async (current) => {
			seen.push(current.key.raw);
		});
		await new Promise((r) => setTimeout(r, 0));
		expect(seen).toEqual([]);
		release!();
		await Promise.all([first, second]);
		expect(seen).toEqual(["b"]);
	});

	it("goes on after a change that failed, with the task it had", async () => {
		const task = new MenuTask(item("a"));
		await expect(task.run(async () => Promise.reject(new Error("stale")))).rejects.toThrow("stale");
		const seen: string[] = [];
		await task.run(async (current) => {
			seen.push(current.key.raw);
		});
		expect(seen).toEqual(["a"]);
	});
});
