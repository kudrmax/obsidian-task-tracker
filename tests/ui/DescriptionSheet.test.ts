// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DescriptionSheet, keptDescription } from "../../src/ui/sheet/DescriptionSheet";

function fakeSurface() {
	const editor = { value: "", focus: vi.fn(), destroy: vi.fn() };
	const surface = {
		editor,
		escape: null as (() => void) | null,
		render: vi.fn(async (el: HTMLElement, markdown: string) => {
			el.innerHTML = `<p>${markdown} <a href="x">link</a></p>`;
		}),
		edit: vi.fn((el: HTMLElement, markdown: string, onEscape: () => void) => {
			editor.value = markdown;
			surface.escape = onEscape;
			el.appendChild(document.createElement("textarea"));
			return editor;
		}),
	};
	return surface;
}

describe("the description screen", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	const open = (markdown: string | null, editing = false) => {
		const surface = fakeSurface();
		const onSave = vi.fn(async () => {});
		const root = document.body.appendChild(document.createElement("div"));
		const sheet = DescriptionSheet.open(root, { title: "Купить билеты", markdown, editing, surface, onSave });
		const bar = () => [...sheet.el.querySelectorAll(".tc-sheet-bar button")].map((b) => b.textContent);
		const button = (label: string) => [...sheet.el.querySelectorAll<HTMLElement>(".tc-sheet-bar button")].find((b) => b.textContent === label)!;
		return { sheet, surface, onSave, bar, button };
	};

	it("reads: Close and Edit, the title, the description as the surface draws it", () => {
		const { sheet, surface, bar } = open("- note");
		expect(bar()).toEqual(["Close", "Edit"]);
		expect(sheet.el.querySelector(".tc-desc-title")?.textContent).toBe("Купить билеты");
		expect(surface.render).toHaveBeenCalledWith(sheet.el.querySelector(".tc-desc-text"), "- note");
		expect(surface.edit).not.toHaveBeenCalled();
	});

	it("puts the editor in on Edit, with Cancel and Save", () => {
		const { surface, bar, button } = open("- note");
		button("Edit").click();
		expect(bar()).toEqual(["Cancel", "Save"]);
		expect(surface.edit.mock.calls[0][1]).toBe("- note");
		expect(surface.editor.focus).toHaveBeenCalled();
	});

	it("edits on a tap on the text, but leaves a tapped link to open by itself", () => {
		const { sheet, surface } = open("- note");
		(sheet.el.querySelector(".tc-desc-text a") as HTMLElement).click();
		expect(surface.edit).not.toHaveBeenCalled();
		(sheet.el.querySelector(".tc-desc-text p") as HTMLElement).click();
		expect(surface.edit).toHaveBeenCalled();
	});

	it("saves what the editor holds and closes", async () => {
		const { surface, onSave, button } = open("- note");
		button("Edit").click();
		surface.editor.value = "- note\n- more";
		button("Save").click();
		await Promise.resolve();
		expect(onSave).toHaveBeenCalledWith("- note\n- more");
		expect(surface.editor.destroy).toHaveBeenCalled();
	});

	it("closes without saving on Cancel and on Escape", () => {
		const first = open("- note");
		first.button("Edit").click();
		first.button("Cancel").click();
		expect(first.onSave).not.toHaveBeenCalled();
		expect(first.sheet.el.classList.contains("is-shown")).toBe(false);
		const second = open("- note", true);
		second.surface.escape?.();
		expect(second.onSave).not.toHaveBeenCalled();
		expect(second.surface.editor.destroy).toHaveBeenCalled();
	});

	it("opens Add description straight in the editor, on one empty point", () => {
		const { surface, bar } = open(null, true);
		expect(bar()).toEqual(["Cancel", "Save"]);
		expect(surface.edit.mock.calls[0][1]).toBe("- ");
	});

	it("keeps a lone empty point as no description", () => {
		expect(keptDescription("- ")).toBe("");
		expect(keptDescription("  -  \n")).toBe("");
		expect(keptDescription("- a")).toBe("- a");
	});
});
