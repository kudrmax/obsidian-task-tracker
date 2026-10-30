// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Divider } from "../../src/ui/Divider";

function pointer(type: string, clientX: number): PointerEvent {
	return new PointerEvent(type, { clientX, clientY: 300, pointerId: 1, isPrimary: true, button: 0, bubbles: true });
}

describe("Divider", () => {
	it("moves the list's edge with the pointer, within its bounds, and reports the width on release", () => {
		const el = document.createElement("div");
		const widths: number[] = [];
		const released: number[] = [];
		new Divider(el, { width: () => 187, onWidth: (w) => widths.push(w), onRelease: (w) => released.push(w), min: 110, max: () => 280 });
		el.dispatchEvent(pointer("pointerdown", 200));
		el.dispatchEvent(pointer("pointermove", 230));
		el.dispatchEvent(pointer("pointermove", 400));
		el.dispatchEvent(pointer("pointermove", 100));
		expect(widths).toEqual([217, 280, 110]);
		expect(released).toEqual([]);
		el.dispatchEvent(pointer("pointerup", 100));
		expect(released).toEqual([110]);
	});

	it("ignores moves while nothing is pressed", () => {
		const el = document.createElement("div");
		const widths: number[] = [];
		new Divider(el, { width: () => 187, onWidth: (w) => widths.push(w), onRelease: () => {}, min: 110, max: () => 280 });
		el.dispatchEvent(pointer("pointermove", 230));
		expect(widths).toEqual([]);
	});
});
