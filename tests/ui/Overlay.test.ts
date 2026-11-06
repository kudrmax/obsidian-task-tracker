// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Overlay } from "../../obsidian/ui/menu/Overlay";

const open = () => {
	const overlay = new Overlay(() => overlay.close());
	const copy = overlay.add(document.createElement("div"));
	const panel = overlay.add(document.createElement("div"));
	return { overlay, copy, panel, sheet: document.querySelector<HTMLElement>(".tc-backdrop")! };
};

afterEach(() => {
	vi.useRealTimers();
	document.body.innerHTML = "";
});

describe("Overlay", () => {
	it("stands the parts put on its level in one holder, so they cast one shadow, and takes it away with them", () => {
		vi.useFakeTimers();
		const overlay = new Overlay(() => overlay.close());
		const copy = overlay.add(document.createElement("div"), true);
		const panel = overlay.add(document.createElement("div"), true);
		const level = document.querySelector(".tc-level")!;
		expect([copy.parentElement, panel.parentElement]).toEqual([level, level]);
		overlay.close();
		expect(copy.classList.contains("is-closing")).toBe(true);
		vi.runAllTimers();
		expect([level.isConnected, copy.isConnected]).toEqual([false, false]);
	});

	it("starts fading the sheet, the copy and the panel in the same moment", () => {
		const { overlay, copy, panel, sheet } = open();
		overlay.close();
		expect([sheet, copy, panel].map((part) => part.classList.contains("is-closing"))).toEqual([true, true, true]);
	});

	it("takes them all off the page together when the fade ends", () => {
		vi.useFakeTimers();
		const { overlay, copy, panel, sheet } = open();
		overlay.close();
		expect([sheet, copy, panel].map((part) => part.isConnected)).toEqual([true, true, true]);
		vi.runAllTimers();
		expect([sheet, copy, panel].map((part) => part.isConnected)).toEqual([false, false, false]);
	});

	it("closes on a tap on the sheet, and only once", () => {
		const { overlay, sheet } = open();
		sheet.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		expect(sheet.classList.contains("is-closing")).toBe(true);
		expect(overlay.close()).toBe(false);
	});

	it("says how it was closed: by Escape, or by a tap on the sheet", () => {
		const heard: string[] = [];
		new Overlay((how) => heard.push(how));
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		document.querySelector<HTMLElement>(".tc-backdrop")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		expect(heard).toEqual(["escape", "away"]);
	});
});
