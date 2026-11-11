// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { ProjectMenu } from "../../obsidian/ui/menu/GroupMenu";

const DELETE = { label: "Delete project", title: "Delete “Сербия”?", message: "Its tasks stay; they just lose this project.", confirm: "Delete", cancel: "Cancel", destructive: true } as const;

type Folder = { readonly label: string; readonly on: boolean; readonly disabled: boolean; readonly reason: string | null };
const OFF: Folder = { label: "Folder", on: false, disabled: false, reason: null };

function open(folder: Folder = OFF) {
	document.body.innerHTML = "";
	const title = document.body.appendChild(document.createElement("div"));
	const picked: string[] = [];
	ProjectMenu.open(title, {
		title: "Сербия",
		renameLabel: "Rename",
		note: null,
		attachLabel: "Attach note…",
		detachLabel: "Detach",
		folder,
		onFolder: (on) => picked.push(`folder:${on}`),
		delete: DELETE,
		onRename: () => picked.push("rename"),
		onAttach: () => picked.push("attach"),
		onOpenNote: () => picked.push("open"),
		onDetach: () => picked.push("detach"),
		onDelete: () => picked.push("delete"),
	});
	const row = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>(".tc-panel .tc-menu-row")).find((r) => r.textContent === label)!;
	const button = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>(".tc-panel .tc-menu-ask button")).find((b) => b.textContent?.trim() === label)!;
	return { picked, row, button };
}

describe("the project menu's Delete project (spec «Projects order» 7)", () => {
	it("stands apart at the foot, in the danger colour, with the core's label", () => {
		open();
		const groups = Array.from(document.querySelectorAll(".tc-panel .tc-menu-group"));
		const last = groups[groups.length - 1].querySelector(".tc-menu-row")!;
		expect(groups.length).toBe(2);
		expect(last.textContent).toBe("Delete project");
		expect(last.classList.contains("is-danger")).toBe(true);
	});

	it("asks first in its own place, in the core's words, and writes nothing until confirmed", () => {
		const { picked, row } = open();
		row("Delete project").click();
		const ask = document.querySelector(".tc-panel .tc-menu-ask")!;
		expect(ask.querySelector(".tc-menu-ask-question")?.textContent).toBe("Delete “Сербия”?");
		expect(ask.querySelector(".tc-menu-ask-message")?.textContent).toBe("Its tasks stay; they just lose this project.");
		expect(Array.from(ask.querySelectorAll("button")).map((b) => b.textContent?.trim())).toEqual(["Cancel", "Delete"]);
		expect(ask.querySelectorAll("button")[1].classList.contains("is-danger")).toBe(true);
		expect(picked).toEqual([]);
	});

	it("Delete deletes and the menu closes", () => {
		const { picked, row, button } = open();
		row("Delete project").click();
		button("Delete").click();
		expect(picked).toEqual(["delete"]);
		expect(document.querySelector(".tc-panel")?.classList.contains("is-closing")).toBe(true);
	});

	it("Cancel gives the row back, nothing written", () => {
		const { picked, row, button } = open();
		row("Delete project").click();
		button("Cancel").click();
		expect(document.querySelector(".tc-panel .tc-menu-ask")).toBeNull();
		expect(row("Delete project")).toBeDefined();
		expect(picked).toEqual([]);
	});
});

describe("the project menu's Folder (spec «Project folders» 1)", () => {
	const folderRow = () => document.querySelector<HTMLButtonElement>(".tc-panel .tc-menu-row.is-switch")!;

	it("a switch row right under Rename, in the first group, off as the core says", () => {
		open();
		const rows = Array.from(document.querySelectorAll(".tc-panel .tc-menu-group")[0].querySelectorAll(".tc-menu-row"));
		expect(rows.map((r) => r.textContent)).toEqual(["Rename", "Folder", "Attach note…"]);
		expect(folderRow().getAttribute("role")).toBe("switch");
		expect(folderRow().getAttribute("aria-checked")).toBe("false");
		expect(folderRow().querySelector(".tc-menu-switch")?.classList.contains("is-on")).toBe(false);
	});

	it("a tap slides it on, writes the opposite of the core's value and closes the menu", () => {
		const { picked } = open();
		folderRow().click();
		expect(folderRow().querySelector(".tc-menu-switch")?.classList.contains("is-on")).toBe(true);
		expect(picked).toEqual(["folder:true"]);
		expect(document.querySelector(".tc-panel")?.classList.contains("is-closing")).toBe(true);
	});

	it("on, a tap turns it off", () => {
		const { picked } = open({ ...OFF, on: true });
		expect(folderRow().getAttribute("aria-checked")).toBe("true");
		folderRow().click();
		expect(picked).toEqual(["folder:false"]);
	});

	it("disabled: not pressed, the core's reason under the label", () => {
		const { picked } = open({ ...OFF, disabled: true, reason: "Has tasks of its own" });
		expect(folderRow().disabled).toBe(true);
		expect(folderRow().querySelector(".tc-menu-switch-label")?.textContent).toBe("Folder");
		expect(folderRow().querySelector(".tc-menu-switch-reason")?.textContent).toBe("Has tasks of its own");
		folderRow().click();
		expect(picked).toEqual([]);
	});

	it("no reason line while it can be turned", () => {
		open();
		expect(folderRow().querySelector(".tc-menu-switch-reason")).toBeNull();
	});
});
