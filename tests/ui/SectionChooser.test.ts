// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { sectionChooser } from "../../src/ui/menu/SectionChooser";

afterEach(() => document.body.replaceChildren());

const choice = { names: ["Work", "Home"], current: "Home", ungrouped: "No section" };
const rows = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLElement>("button")].map((row) => [row.className, row.textContent, row.querySelector("svg") !== null]);

describe("sectionChooser", () => {
	it("the way back, the sections with the current checked, then the tasks outside any, quiet", () => {
		const panel = document.body.appendChild(document.createElement("div"));
		sectionChooser(panel, { choice, checked: (name) => name === "Home", onBack: () => undefined, onPick: () => undefined });
		expect(rows(panel)).toEqual([
			["tc-btn tc-menu-back", "Section", true],
			["tc-btn tc-menu-row is-choice", "Work", false],
			["tc-btn tc-menu-row is-choice", "Home", true],
			["tc-btn tc-menu-row is-choice is-quiet", "No section", false],
		]);
		expect(panel.querySelector(".tc-menu-group")?.children.length).toBe(3);
	});

	it("New section last, apart, when it can be asked for", () => {
		const panel = document.body.appendChild(document.createElement("div"));
		let added = 0;
		sectionChooser(panel, { choice, checked: () => false, onBack: () => undefined, onPick: () => undefined, onNew: () => added++ });
		const last = panel.lastElementChild as HTMLElement;
		expect([last.className, last.textContent]).toEqual(["tc-btn tc-menu-row is-tall is-apart is-add", "New section"]);
		last.click();
		expect(added).toBe(1);
	});

	it("a row picks its section, the last one null; the way back goes back", () => {
		const panel = document.body.appendChild(document.createElement("div"));
		const picked: (string | null)[] = [];
		let back = 0;
		sectionChooser(panel, { choice, checked: () => false, onBack: () => back++, onPick: (name) => picked.push(name) });
		panel.querySelectorAll<HTMLElement>("button").forEach((row) => row.click());
		expect([back, picked]).toEqual([1, ["Work", "Home", null]]);
	});
});
