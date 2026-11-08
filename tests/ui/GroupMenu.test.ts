// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { GroupMenu } from "../../obsidian/ui/menu/GroupMenu";

function open() {
	document.body.innerHTML = "";
	const head = document.createElement("div");
	head.className = "tc-group-head";
	head.textContent = "Экскурсия";
	document.body.appendChild(head);
	const picked: string[] = [];
	GroupMenu.open(head, { name: "Экскурсия", onRename: () => picked.push("rename"), onRemove: () => picked.push("remove") });
	const rows = Array.from(document.querySelectorAll<HTMLButtonElement>(".tc-panel .tc-menu-row"));
	return { rows, picked };
}

describe("GroupMenu", () => {
	it("opens in the window of the header it belongs to, a popout's too", () => {
		const popout = document.implementation.createHTMLDocument("popout");
		const head = popout.body.appendChild(popout.createElement("div"));
		GroupMenu.open(head, { name: "Экскурсия", onRename: () => {} });
		expect(popout.querySelector(".tc-backdrop")).not.toBeNull();
	});

	it("two rows, Rename and Remove section, in that order", () => {
		expect(open().rows.map((r) => r.querySelector(".tc-menu-label")?.textContent)).toEqual(["Rename", "Remove section"]);
	});

	it("offers only what the group may be given: no row for an action it has none for", () => {
		document.body.innerHTML = "";
		const head = document.body.appendChild(document.createElement("div"));
		GroupMenu.open(head, { name: "Экскурсия", onRename: () => {} });
		expect(Array.from(document.querySelectorAll(".tc-panel .tc-menu-row .tc-menu-label")).map((l) => l.textContent)).toEqual(["Rename"]);
	});

	it("a row does its action and the menu closes", () => {
		const { rows, picked } = open();
		rows[1].click();
		expect(picked).toEqual(["remove"]);
		expect(document.querySelector(".tc-panel")?.classList.contains("is-closing")).toBe(true);
	});

	it("keeps the header's copy over the blur", () => {
		open();
		expect(document.querySelector(".tc-lifted.is-head")?.textContent).toBe("Экскурсия");
	});
});
