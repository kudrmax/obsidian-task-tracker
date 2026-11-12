// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ColumnHeaders } from "../../obsidian/ui/ColumnHeaders";
import { DayNav } from "../../obsidian/ui/DayNav";

describe("ColumnHeaders: the ribbon's titles", () => {
	it("heads Done, Inbox and Soon with the names of their sections, and follows them renamed", () => {
		const names = { inbox: "Inbox", soon: "Soon" };
		const root = document.createElement("div");
		const headers = new ColumnHeaders(root, { inboxName: () => names.inbox, soonName: () => names.soon, doneName: () => "Done" });
		const text = (selector: string) => root.querySelector(`${selector} .tc-head-title`)!.textContent;
		expect([text(".tc-head.is-done"), text(".tc-head.is-inbox"), text(".tc-head.is-soon")]).toEqual(["Done", "Inbox", "Soon"]);
		names.inbox = "Входящие";
		names.soon = "Скоро";
		headers.render();
		expect([text(".tc-head.is-inbox"), text(".tc-head.is-soon")]).toEqual(["Входящие", "Скоро"]);
		expect(headers.titleOf("inbox").textContent).toBe("Входящие");
	});
});

describe("DayNav: the day's title between its arrows", () => {
	it("names the day, follows another, steps back and forth, and goes back to today from the name", () => {
		let title = "Today";
		const steps: number[] = [];
		let todays = 0;
		const root = document.createElement("div");
		const nav = new DayNav(root, { title: () => title, onStep: (days) => steps.push(days), onToday: () => todays++ });
		expect(nav.titleEl.textContent).toBe("Today");
		title = "Wed, 4 Nov";
		nav.render();
		expect(nav.titleEl.textContent).toBe("Wed, 4 Nov");
		const button = (label: string) => root.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
		button("Previous day").click();
		button("Next day").click();
		button("Back to today").click();
		expect(steps).toEqual([-1, 1]);
		expect(todays).toBe(1);
	});
});
