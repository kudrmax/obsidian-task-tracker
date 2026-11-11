// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import type { MenuProject } from "../../core/application/contracts";
import { projectChooser, sectionChooser } from "../../obsidian/ui/menu/SectionChooser";

afterEach(() => document.body.replaceChildren());

const choice = { names: ["Work", "Home"], current: "Home", ungrouped: "No section" };
const options = (checked: string | null | undefined) => [...choice.names, null].map((name) => ({ name, checked: name === checked }));
const sections = (checked?: string | null, create = false) => ({ choice, options: options(checked), create });
const rows = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLElement>("button")].map((row) => [row.className, row.textContent, row.querySelector("svg") !== null]);

describe("sectionChooser", () => {
	it("the way back, the sections with the one the model checks checked, then the tasks outside any, quiet", () => {
		const panel = document.body.appendChild(document.createElement("div"));
		sectionChooser(panel, { sections: sections("Home"), onBack: () => undefined, onPick: () => undefined });
		expect(rows(panel)).toEqual([
			["tc-btn tc-menu-back", "Section", true],
			["tc-btn tc-menu-row is-choice", "Work", false],
			["tc-btn tc-menu-row is-choice", "Home", true],
			["tc-btn tc-menu-row is-choice is-quiet", "No section", false],
		]);
		expect(panel.querySelector(".tc-menu-group")?.children.length).toBe(3);
	});

	it("New section last, apart, where the model offers it", () => {
		const none = document.body.appendChild(document.createElement("div"));
		sectionChooser(none, { sections: sections(undefined, false), onBack: () => undefined, onPick: () => undefined, onNew: () => undefined });
		expect(none.textContent).not.toContain("New section");
		const panel = document.body.appendChild(document.createElement("div"));
		let added = 0;
		sectionChooser(panel, { sections: sections(undefined, true), onBack: () => undefined, onPick: () => undefined, onNew: () => added++ });
		const last = panel.lastElementChild as HTMLElement;
		expect([last.className, last.textContent]).toEqual(["tc-btn tc-menu-row is-apart is-add", "New section"]);
		last.click();
		expect(added).toBe(1);
	});

	it("a row picks its section, the last one null; the way back goes back", () => {
		const panel = document.body.appendChild(document.createElement("div"));
		const picked: (string | null)[] = [];
		let back = 0;
		sectionChooser(panel, { sections: sections(), onBack: () => back++, onPick: (name) => picked.push(name) });
		panel.querySelectorAll<HTMLElement>("button").forEach((row) => row.click());
		expect([back, picked]).toEqual([1, ["Work", "Home", null]]);
	});
});

describe("projectChooser (spec «Project folders» 2)", () => {
	const ref = (name: string, path: string[], folder = false) => ({ name, path, note: null, canOpenNote: false, mark: true, folder });
	const project: MenuProject = {
		value: "",
		current: null,
		options: [
			{ project: ref("Работа", ["Работа"], true), checked: false, depth: 0, disabled: true },
			{ project: ref("Отчёт", ["Работа", "Отчёт"]), checked: false, depth: 1, disabled: false },
		],
		none: false,
		noneLabel: "No project",
		newLabel: "New project…",
		disabled: false,
	};

	it("a folder the model disables is shown but not pressed; its subproject under it is checkable", () => {
		const panel = document.body.appendChild(document.createElement("div"));
		const picked: (string | null)[] = [];
		projectChooser(panel, { project, onBack: () => undefined, onPick: (name) => picked.push(name), onNew: () => undefined });
		const [folder, sub] = [...panel.querySelectorAll<HTMLButtonElement>(".tc-project-option")];
		expect([folder.textContent, folder.disabled, sub.textContent, sub.disabled]).toEqual(["Работа", true, "Отчёт", false]);
		folder.click();
		sub.click();
		expect(picked).toEqual(["Отчёт"]);
	});
});
