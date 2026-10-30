import { describe, expect, it } from "vitest";
import { WorkCalendarShortcut } from "../../src/infrastructure/WorkCalendarShortcut";

function shortcut(isPhone: boolean) {
	const opened: string[] = [];
	return { opened, shortcut: new WorkCalendarShortcut({ isPhone, vaultName: "My Vault", open: (url) => opened.push(url) }) };
}

describe("WorkCalendarShortcut", () => {
	it("runs the export shortcut on the phone and comes back to the vault", () => {
		const { opened, shortcut: s } = shortcut(true);
		s.run();
		expect(opened).toHaveLength(1);
		const url = new URL(opened[0]);
		expect(`${url.protocol}//${url.host}${url.pathname}`).toBe("shortcuts://x-callback-url/run-shortcut");
		expect(url.searchParams.get("name")).toBe("Export Work Calendar");
		expect(url.searchParams.get("x-success")).toBe("obsidian://open?vault=My%20Vault");
	});

	it("does nothing off the phone: the work file comes there through Sync", () => {
		const { opened, shortcut: s } = shortcut(false);
		s.run();
		expect(opened).toEqual([]);
	});
});
