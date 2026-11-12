// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { SubprojectsOption, ViewMode, ViewModeOption } from "../../core/application/contracts";
import { ViewMenu } from "../../obsidian/ui/menu/ViewMenu";

const MODES: readonly ViewModeOption[] = [
	{ mode: "twoColumns", label: "Two columns", icon: "columns-2", checked: false },
	{ mode: "rows", label: "Rows", icon: "rows-3", checked: true },
	{ mode: "byProject", label: "By project", icon: "folder-tree", checked: false },
];

function open(subprojects: SubprojectsOption | null) {
	document.body.innerHTML = "";
	const anchor = document.body.appendChild(document.createElement("button"));
	const picked: string[] = [];
	ViewMenu.open({ anchor, modes: MODES, subprojects, onPick: (mode: ViewMode) => picked.push(mode), onSubprojects: () => picked.push("subprojects") });
	const groups = Array.from(document.querySelectorAll<HTMLElement>(".tc-panel .tc-menu-group"));
	const labels = (group: HTMLElement) => Array.from(group.querySelectorAll(".tc-menu-label")).map((l) => l.textContent);
	const checked = (group: HTMLElement) => Array.from(group.querySelectorAll(".tc-menu-row")).map((row) => row.querySelector("svg") !== null);
	return { groups, labels, checked, picked };
}

describe("ViewMenu", () => {
	it("draws the modes alone when the core offers no Subprojects row", () => {
		const { groups, labels } = open(null);
		expect(groups.map(labels)).toEqual([["Two columns", "Rows", "By project"]]);
	});

	it("draws the core's Subprojects row as its own group under the modes, checked as the core says", () => {
		const on = open({ label: "Subprojects", checked: true });
		expect(on.groups.map(on.labels)).toEqual([["Two columns", "Rows", "By project"], ["Subprojects"]]);
		expect(on.checked(on.groups[1])).toEqual([true]);
		const off = open({ label: "Subprojects", checked: false });
		expect(off.checked(off.groups[1])).toEqual([false]);
	});

	it("a tap on the row asks the core to toggle and closes the menu; it picks no mode", () => {
		const { groups, picked } = open({ label: "Subprojects", checked: true });
		groups[1].querySelector<HTMLButtonElement>(".tc-menu-row")?.click();
		expect(picked).toEqual(["subprojects"]);
		expect(document.querySelector(".tc-panel")?.classList.contains("is-closing")).toBe(true);
	});
});

describe("where the View menu stands", () => {
	it("measures the button when it is placed, not a place kept from before: a layout settling as it opens moves the menu with the button", async () => {
		document.body.innerHTML = "";
		const anchor = document.body.appendChild(document.createElement("button"));
		anchor.className = "tc-view-btn";
		let rect = new DOMRect(800, 900, 44, 44);
		anchor.getBoundingClientRect = () => rect;
		ViewMenu.open({ anchor, modes: MODES, subprojects: null, onPick: () => undefined, onSubprojects: () => undefined });
		const copy = document.querySelector<HTMLElement>(".tc-control-copy")!;
		expect(copy.style.top).toBe("900px");
		rect = new DOMRect(800, 700, 44, 44);
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(copy.style.top).toBe("700px");
	});
});
