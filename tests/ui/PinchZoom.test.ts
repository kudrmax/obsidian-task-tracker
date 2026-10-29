// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GestureArbiter } from "../../src/ui/gestures";
import { PinchZoom } from "../../src/ui/PinchZoom";

function pointer(type: string, id: number, x: number, y: number): PointerEvent {
	return new PointerEvent(type, { clientX: x, clientY: y, pointerId: id, isPrimary: id === 1, button: 0, bubbles: true, pointerType: "touch" });
}

describe("PinchZoom", () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it("scales the hour with the distance between two fingers and settles on release", () => {
		const el = document.createElement("div");
		const arbiter = new GestureArbiter();
		const scales: number[] = [];
		const released: number[] = [];
		let hour = 56;
		new PinchZoom(el, {
			hourPx: () => hour,
			min: 28,
			max: 224,
			arbiter,
			minutesAt: (y) => y,
			onScale: (h) => {
				hour = h;
				scales.push(h);
			},
			onRelease: (h) => released.push(h),
		});
		el.dispatchEvent(pointer("pointerdown", 1, 100, 100));
		expect(arbiter.busy).toBe(false);
		el.dispatchEvent(pointer("pointerdown", 2, 100, 200));
		expect(arbiter.busy).toBe(true);
		el.dispatchEvent(pointer("pointermove", 2, 100, 300));
		expect(scales).toEqual([112]);
		el.dispatchEvent(pointer("pointermove", 1, 100, 150));
		expect(scales).toEqual([112, 84]);
		el.dispatchEvent(pointer("pointerup", 2, 100, 300));
		expect(released).toEqual([84]);
		expect(arbiter.busy).toBe(false);
	});

	it("keeps within its bounds", () => {
		const el = document.createElement("div");
		const scales: number[] = [];
		new PinchZoom(el, { hourPx: () => 56, min: 28, max: 224, arbiter: new GestureArbiter(), minutesAt: (y) => y, onScale: (h) => scales.push(h), onRelease: () => {} });
		el.dispatchEvent(pointer("pointerdown", 1, 100, 100));
		el.dispatchEvent(pointer("pointerdown", 2, 100, 110));
		el.dispatchEvent(pointer("pointermove", 2, 100, 700));
		el.dispatchEvent(pointer("pointermove", 2, 100, 101));
		expect(scales).toEqual([224, 28]);
	});

	it("zooms with the wheel and a modifier on a computer, settling after the wheel stops", () => {
		const el = document.createElement("div");
		const scales: number[] = [];
		const released: number[] = [];
		let hour = 56;
		new PinchZoom(el, { hourPx: () => hour, min: 28, max: 224, arbiter: new GestureArbiter(), minutesAt: (y) => y, onScale: (h) => { hour = h; scales.push(h); }, onRelease: (h) => released.push(h) });
		const zoomIn = new WheelEvent("wheel", { deltaY: -100, clientY: 300, bubbles: true, cancelable: true });
		Object.defineProperty(zoomIn, "ctrlKey", { value: true });
		el.dispatchEvent(zoomIn);
		expect(scales.length).toBe(1);
		expect(scales[0]).toBeGreaterThan(56);
		el.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }));
		expect(scales.length).toBe(1);
		vi.advanceTimersByTime(200);
		expect(released).toEqual([scales[0]]);
	});
});
