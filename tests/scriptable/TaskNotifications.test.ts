import { describe, expect, it } from "vitest";
import type { NotificationCenter, PendingNotification, ScheduledNotification, VaultFiles } from "../../src/scriptable/Scriptable";
import { TaskNotifications } from "../../src/scriptable/TaskNotifications";

const SETTINGS = {
	bookmark: "ObsidianVault",
	tasksFile: "TODOs Tasks.md",
	sections: { now: "Now", soon: "Soon", done: "Done" },
	markers: { dueDate: "📅", slot: "⏰" },
};
const NOW = new Date(2026, 9, 30, 12, 0);
const TEXT = ["## Now", "- [ ] Call the doctor ⏰ 2026-10-30 14:30-15:30", "## Soon", "## Done", ""].join("\n");

class FakeFiles implements VaultFiles {
	constructor(private readonly files: Record<string, string>) {}
	vaultPath(bookmark: string): string | null {
		return bookmark === "ObsidianVault" ? "/vaults/Main" : null;
	}
	read(path: string): Promise<string | null> {
		return Promise.resolve(this.files[path] ?? null);
	}
}

class FakeCenter implements NotificationCenter {
	readonly scheduled: ScheduledNotification[] = [];
	constructor(public pending: PendingNotification[]) {}
	allPending(): Promise<PendingNotification[]> {
		return Promise.resolve(this.pending);
	}
	removePending(ids: string[]): Promise<void> {
		this.pending = this.pending.filter((n) => !ids.includes(n.identifier));
		return Promise.resolve();
	}
	schedule(n: ScheduledNotification): Promise<void> {
		this.scheduled.push(n);
		return Promise.resolve();
	}
}

const run = (files: VaultFiles, center: FakeCenter) => new TaskNotifications(SETTINGS, files, center).run(NOW);

describe("TaskNotifications", () => {
	it("replaces its own pending notifications with the file's and leaves other scripts' alone", async () => {
		const center = new FakeCenter([
			{ identifier: "old", threadIdentifier: "task-calendar" },
			{ identifier: "other", threadIdentifier: "weather" },
		]);
		const count = await run(new FakeFiles({ "/vaults/Main/TODOs Tasks.md": TEXT }), center);
		expect(count).toBe(1);
		expect(center.pending.map((n) => n.identifier)).toEqual(["other"]);
		expect(center.scheduled).toEqual([
			{
				identifier: "task-calendar 2026-10-30 14:30 Call the doctor",
				threadIdentifier: "task-calendar",
				title: "Call the doctor",
				body: "14:30–15:30",
				sound: "alert",
				openURL: "obsidian://open?vault=Main",
				at: new Date(2026, 9, 30, 14, 30),
			},
		]);
	});

	it("without the vault bookmark it fails before touching anything", async () => {
		const center = new FakeCenter([{ identifier: "old", threadIdentifier: "task-calendar" }]);
		await expect(new TaskNotifications({ ...SETTINGS, bookmark: "Missing" }, new FakeFiles({}), center).run(NOW)).rejects.toThrow(/Missing/);
		expect(center.pending).toHaveLength(1);
	});

	it("without the tasks file it fails before touching anything", async () => {
		const center = new FakeCenter([{ identifier: "old", threadIdentifier: "task-calendar" }]);
		await expect(run(new FakeFiles({}), center)).rejects.toThrow(/TODOs Tasks\.md/);
		expect(center.pending).toHaveLength(1);
	});
});
