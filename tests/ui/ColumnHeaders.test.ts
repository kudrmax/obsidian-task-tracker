// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ColumnHeaders } from "../../src/ui/ColumnHeaders";

function setUp() {
	const names = { inbox: "Inbox", soon: "Soon" };
	let title = "Today";
	const steps: number[] = [];
	let todays = 0;
	const root = document.createElement("div");
	const headers = new ColumnHeaders(root, {
		title: () => title,
		onStep: (days) => steps.push(days),
		onToday: () => todays++,
		inboxName: () => names.inbox,
		soonName: () => names.soon,
	});
	const text = (selector: string) => root.querySelector(`${selector} .tc-head-title`)!.textContent;
	const button = (label: string) => root.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
	return {
		names,
		setTitle: (next: string) => (title = next),
		headers,
		steps,
		todays: () => todays,
		text,
		button,
	};
}

describe("ColumnHeaders", () => {
	it("heads Inbox and Soon with the names of their sections, and Now with the day", () => {
		const s = setUp();
		expect(s.text(".tc-head.is-inbox")).toBe("Inbox");
		expect(s.text(".tc-head.is-soon")).toBe("Soon");
		expect(s.text(".tc-day-nav")).toBe("Today");
	});

	it("follows sections renamed in the settings and another day", () => {
		const s = setUp();
		s.names.inbox = "Входящие";
		s.names.soon = "Скоро";
		s.setTitle("Wed, 4 Nov");
		s.headers.render();
		expect(s.text(".tc-head.is-inbox")).toBe("Входящие");
		expect(s.text(".tc-head.is-soon")).toBe("Скоро");
		expect(s.text(".tc-day-nav")).toBe("Wed, 4 Nov");
	});

	it("steps a day back and forth with the arrows, and goes back to today from the day's name", () => {
		const s = setUp();
		s.button("Previous day").click();
		s.button("Next day").click();
		s.button("Back to today").click();
		expect(s.steps).toEqual([-1, 1]);
		expect(s.todays()).toBe(1);
	});
});
