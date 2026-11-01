// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { GestureArbiter } from "../../src/ui/gestures";
import { PlusButton } from "../../src/ui/quick/PlusButton";

function pointer(type: string, x: number, y: number, init: PointerEventInit = {}): PointerEvent {
	return new PointerEvent(type, { clientX: x, clientY: y, pointerId: 3, isPrimary: true, button: 0, bubbles: true, pointerType: "touch", ...init });
}

function setUp() {
	const parent = document.createElement("div");
	const arbiter = new GestureArbiter();
	const log: string[] = [];
	const drags: { event: PointerEvent; source: HTMLElement }[] = [];
	const plus = new PlusButton(parent, {
		onTap: () => log.push("tap"),
		onDrag: (event, source) => {
			log.push("drag");
			drags.push({ event, source });
		},
		arbiter,
	});
	const button = parent.querySelector<HTMLElement>(".tc-plus")!;
	return { plus, button, arbiter, log, drags };
}

describe("PlusButton", () => {
	it("is a tap when the finger lifts where it came down", () => {
		const { button, log } = setUp();
		button.dispatchEvent(pointer("pointerdown", 10, 10));
		button.dispatchEvent(pointer("pointerup", 12, 11));
		expect(log).toEqual(["tap"]);
	});

	it("is a drag, once, with the move that passed the tolerance, and no tap after it", () => {
		const { button, log, drags } = setUp();
		button.dispatchEvent(pointer("pointerdown", 10, 10));
		button.dispatchEvent(pointer("pointermove", 10, 15));
		expect(log).toEqual([]);
		const far = pointer("pointermove", 10, 30);
		button.dispatchEvent(far);
		button.dispatchEvent(pointer("pointermove", 10, 60));
		button.dispatchEvent(pointer("pointerup", 10, 60));
		expect(log).toEqual(["drag"]);
		expect(drags[0].event).toBe(far);
		expect(drags[0].source).toBe(button);
	});

	it("does nothing when the pointer is cancelled", () => {
		const { button, log } = setUp();
		button.dispatchEvent(pointer("pointerdown", 10, 10));
		button.dispatchEvent(pointer("pointercancel", 10, 10));
		button.dispatchEvent(pointer("pointerup", 10, 10));
		expect(log).toEqual([]);
	});

	it("takes only the primary button and waits while another gesture holds the screen", () => {
		const { button, arbiter, log } = setUp();
		button.dispatchEvent(pointer("pointerdown", 10, 10, { button: 2 }));
		button.dispatchEvent(pointer("pointerup", 10, 10, { button: 2 }));
		button.dispatchEvent(pointer("pointerdown", 10, 10, { isPrimary: false }));
		button.dispatchEvent(pointer("pointerup", 10, 10, { isPrimary: false }));
		arbiter.claim("drag");
		button.dispatchEvent(pointer("pointerdown", 10, 10));
		button.dispatchEvent(pointer("pointerup", 10, 10));
		expect(log).toEqual([]);
	});

	it("hidden, is out of sight and ignores pointers", () => {
		const { plus, button, log } = setUp();
		plus.hidden = true;
		expect(button.classList.contains("is-hidden")).toBe(true);
		button.dispatchEvent(pointer("pointerdown", 10, 10));
		button.dispatchEvent(pointer("pointerup", 10, 10));
		expect(log).toEqual([]);
		plus.hidden = false;
		expect(button.classList.contains("is-hidden")).toBe(false);
		button.dispatchEvent(pointer("pointerdown", 10, 10));
		button.dispatchEvent(pointer("pointerup", 10, 10));
		expect(log).toEqual(["tap"]);
	});

	it("drops a press that is under way when it is hidden", () => {
		const { plus, button, log } = setUp();
		button.dispatchEvent(pointer("pointerdown", 10, 10));
		plus.hidden = true;
		button.dispatchEvent(pointer("pointerup", 10, 10));
		expect(log).toEqual([]);
	});

	it("a key press on it is a tap", () => {
		const { button, log } = setUp();
		button.click();
		expect(log).toEqual(["tap"]);
	});
});
