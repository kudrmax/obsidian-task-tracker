// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Divider, type DividerOptions } from "../../src/ui/Divider";

function pointer(type: string, clientX: number): PointerEvent {
	return new PointerEvent(type, { clientX, clientY: 300, pointerId: 1, isPrimary: true, button: 0, bubbles: true });
}

function divider(el: HTMLElement, opts: Partial<DividerOptions>): Divider {
	return new Divider(el, { width: () => 187, onWidth: () => {}, onRelease: () => {}, min: 110, max: () => 280, center: () => 160, onSnap: () => {}, ...opts });
}

describe("Divider", () => {
	it("moves the list's edge with the pointer, within its bounds, and reports the width on release", () => {
		const el = document.createElement("div");
		const widths: number[] = [];
		const released: number[] = [];
		divider(el, { onWidth: (w) => widths.push(w), onRelease: (w) => released.push(w), center: () => 500 });
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
		divider(el, { onWidth: (w) => widths.push(w) });
		el.dispatchEvent(pointer("pointermove", 230));
		expect(widths).toEqual([]);
	});

	it("pulls the line onto the centre when it comes within a few pixels of it", () => {
		const el = document.createElement("div");
		const widths: number[] = [];
		const released: number[] = [];
		divider(el, { onWidth: (w) => widths.push(w), onRelease: (w) => released.push(w), center: () => 160.5 });
		el.dispatchEvent(pointer("pointerdown", 200));
		el.dispatchEvent(pointer("pointermove", 165));
		el.dispatchEvent(pointer("pointermove", 179));
		el.dispatchEvent(pointer("pointermove", 182));
		el.dispatchEvent(pointer("pointermove", 164));
		el.dispatchEvent(pointer("pointerup", 168));
		expect(widths).toEqual([152, 160.5, 169, 151, 160.5]);
		expect(released).toEqual([160.5]);
	});

	it("ticks once each time the line lands on the centre", () => {
		const el = document.createElement("div");
		let snaps = 0;
		divider(el, { center: () => 160, onSnap: () => snaps++ });
		el.dispatchEvent(pointer("pointerdown", 200));
		el.dispatchEvent(pointer("pointermove", 175));
		el.dispatchEvent(pointer("pointermove", 172));
		el.dispatchEvent(pointer("pointermove", 168));
		expect(snaps).toBe(1);
		el.dispatchEvent(pointer("pointermove", 150));
		el.dispatchEvent(pointer("pointermove", 174));
		expect(snaps).toBe(2);
	});

	it("keeps a centre the list may not reach within its bounds", () => {
		const el = document.createElement("div");
		const widths: number[] = [];
		divider(el, { onWidth: (w) => widths.push(w), center: () => 285 });
		el.dispatchEvent(pointer("pointerdown", 200));
		el.dispatchEvent(pointer("pointermove", 295));
		expect(widths).toEqual([280]);
	});
});
