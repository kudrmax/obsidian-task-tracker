import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../../src/settings";

const SCRIPT = "scriptable/Task Notifications.js";
const committed = readFileSync(SCRIPT, "utf8");

interface FakeNotification {
	identifier: string;
	threadIdentifier: string;
	title: string;
	body: string;
	sound: string;
	openURL: string;
	at?: Date;
}

/** Scriptable's globals, with a vault holding one tasks file and one notification from an earlier run pending. */
function fakeScriptable(tasks: string) {
	const pending: FakeNotification[] = [{ identifier: "earlier", threadIdentifier: "task-calendar", title: "", body: "", sound: "", openURL: "" }];
	class Notification {
		identifier = "";
		threadIdentifier = "";
		title = "";
		body = "";
		sound = "";
		openURL = "";
		private at?: Date;
		static allPending = async () => [...pending];
		static removePending = async (ids: string[]) => {
			for (const id of ids) pending.splice(pending.findIndex((n) => n.identifier === id), 1);
		};
		setTriggerDate(at: Date) {
			this.at = at;
		}
		async schedule() {
			pending.push({ ...this, at: this.at });
		}
	}
	const files: Record<string, string> = { "/vaults/My Vault/TODOs Tasks.md": tasks };
	const fm = {
		bookmarkExists: (name: string) => name === "ObsidianVault",
		bookmarkedPath: () => "/vaults/My Vault",
		fileExists: (path: string) => path in files,
		isFileStoredIniCloud: () => false,
		downloadFileFromiCloud: async () => {},
		readString: (path: string) => files[path],
	};
	let completed = false;
	const globals = {
		Notification,
		FileManager: { local: () => fm },
		Alert: class {},
		config: { runsInApp: false },
		Script: { complete: () => (completed = true) },
	};
	return { globals, pending, completed: () => completed };
}

/** Scriptable runs a script as the body of an async function. */
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor as new (body: string) => () => Promise<void>;
const installed: string[] = [];

afterEach(() => {
	for (const name of installed.splice(0)) delete (globalThis as Record<string, unknown>)[name];
});

describe(SCRIPT, () => {
	it("is the build of src/scriptable: run `node scriptable/build.mjs` after changing it", () => {
		expect(execFileSync("node", ["scriptable/build.mjs", "--stdout"], { encoding: "utf8" })).toBe(committed);
	});

	it("starts with the plugin's default settings", () => {
		const { tasksFile, sections, dueDateMarker, slotMarker } = DEFAULT_SETTINGS;
		for (const line of [
			`tasksFile: ${JSON.stringify(tasksFile)},`,
			`sections: { now: ${JSON.stringify(sections.now)}, soon: ${JSON.stringify(sections.soon)}, done: ${JSON.stringify(sections.done)} },`,
			`markers: { dueDate: ${JSON.stringify(dueDateMarker)}, slot: ${JSON.stringify(slotMarker)} },`,
		]) {
			expect(committed).toContain(line);
		}
	});

	it("runs in Scriptable: replaces the earlier notifications with the tasks still ahead", async () => {
		const ahead = new Date(Date.now() + 3_600_000);
		const pad = (n: number) => String(n).padStart(2, "0");
		const slot = `${ahead.getFullYear()}-${pad(ahead.getMonth() + 1)}-${pad(ahead.getDate())} ${pad(ahead.getHours())}:${pad(ahead.getMinutes())}`;
		const scriptable = fakeScriptable(["## Now", `- [ ] Call the doctor ⏰ ${slot}`, "## Soon", "## Done", ""].join("\n"));
		Object.assign(globalThis, scriptable.globals);
		installed.push(...Object.keys(scriptable.globals));

		await new AsyncFunction(committed)();

		expect(scriptable.pending).toHaveLength(1);
		expect(scriptable.pending[0]).toMatchObject({ title: "Call the doctor", sound: "alert", openURL: "obsidian://open?vault=My%20Vault" });
		expect(scriptable.completed()).toBe(true);
	});
});
