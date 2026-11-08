// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Overlay } from "../../obsidian/ui/menu/Overlay";

const open = () => {
	const overlay = new Overlay(() => void overlay.close());
	const copy = overlay.add(document.createElement("div"));
	const panel = overlay.add(document.createElement("div"));
	return { overlay, copy, panel, sheet: document.querySelector<HTMLElement>(".tc-backdrop")! };
};

afterEach(() => {
	vi.useRealTimers();
	document.body.innerHTML = "";
});

describe("Overlay", () => {
	it("hands its sheet, shown, to the window that replaces it: its own parts go, the sheet stays under the next one", () => {
		vi.useFakeTimers();
		const { overlay, copy, sheet } = open();
		sheet.classList.add("is-shown");
		const next = overlay.handOver(() => {});
		const panel = next.add(document.createElement("div"));
		vi.runAllTimers();
		expect([sheet.isConnected, sheet.classList.contains("is-shown"), copy.isConnected, panel.isConnected]).toEqual([true, true, false, true]);
		void next.close();
		vi.runAllTimers();
		expect(sheet.isConnected).toBe(false);
	});

	it("stands in the window of what it opens over", () => {
		const other = document.implementation.createHTMLDocument("popout");
		const source = other.body.appendChild(other.createElement("div"));
		new Overlay(() => {}, source);
		expect(other.querySelector(".tc-backdrop")).not.toBeNull();
	});

	it("stands the parts put on its level in one holder, so they cast one shadow, and takes it away with them", () => {
		vi.useFakeTimers();
		const overlay = new Overlay(() => void overlay.close());
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
		expect(overlay.isClosed).toBe(true);
		const again = new Promise((resolve) => setTimeout(resolve));
		expect(overlay.close()).toBe(overlay.close());
		return again;
	});

	it("says how it was closed: by Escape, or by a tap on the sheet", () => {
		const heard: string[] = [];
		new Overlay((how) => heard.push(how));
		document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
		document.querySelector<HTMLElement>(".tc-backdrop")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
		expect(heard).toEqual(["escape", "away"]);
	});
});

describe("a window's picks", () => {
	it("act once the window's close has ended, and a pick that types acts inside the tap", async () => {
		const { Picks } = await import("../../obsidian/ui/kit/Panel");
		let end: () => void = () => {};
		const closing = new Promise<void>((resolve) => (end = resolve));
		const acted: string[] = [];
		const picks = new Picks(() => acted.push("close"), () => closing);
		picks.pick(() => void acted.push("write"))();
		expect(acted).toEqual(["close"]);
		end();
		await closing;
		await Promise.resolve();
		expect(acted).toEqual(["close", "write"]);
		const typing = new Picks(() => acted.push("close2"), () => new Promise(() => {}));
		typing.pickNow(() => void acted.push("field"))();
		expect(acted.slice(2)).toEqual(["close2", "field"]);
	});
});
