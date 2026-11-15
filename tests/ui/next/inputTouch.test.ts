// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { Input } from "../../../obsidian/ui/next/drivers/input";

/** A finger's tap the press recognizer reads (the plus, a card) ends with no click after it: what the tap put under the finger is never clicked. */
describe("the input driver's touch end", () => {
	const setUp = () => {
		const root = document.body.appendChild(document.createElement("div"));
		const plus = root.appendChild(document.createElement("button"));
		plus.dataset.nAct = "plus";
		const input = new Input();
		input.presses(root, () => undefined, () => false);
		return { root, plus, input };
	};
	const pointer = (type: string, pointerType: string) => new PointerEvent(type, { bubbles: true, isPrimary: true, button: 0, pointerId: 1, pointerType });
	const touchEnd = () => new Event("touchend", { bubbles: true, cancelable: true });

	it("is cancelled after a finger pressed what the recognizer reads", () => {
		const { root, plus, input } = setUp();
		plus.dispatchEvent(pointer("pointerdown", "touch"));
		plus.dispatchEvent(pointer("pointerup", "touch"));
		const end = touchEnd();
		plus.dispatchEvent(end);
		expect(end.defaultPrevented).toBe(true);
		input.dispose();
		root.remove();
	});

	it("is left alone after a finger pressed anything else", () => {
		const { root, input } = setUp();
		const other = root.appendChild(document.createElement("div"));
		other.dispatchEvent(pointer("pointerdown", "touch"));
		const end = touchEnd();
		other.dispatchEvent(end);
		expect(end.defaultPrevented).toBe(false);
		input.dispose();
		root.remove();
	});
});
