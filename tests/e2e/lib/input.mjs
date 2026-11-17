import { sleep } from "./cdp.mjs";

/**
 * Real input over CDP at a human's pace: the mouse, the trackpad's wheel strokes (a finger phase, then the momentum tail
 * macOS sends after the fingers lift), touches. Every gesture goes through the browser's input pipeline, as a person's does.
 */
export class Input {
	/** @param {import("./cdp.mjs").Cdp} cdp */
	constructor(cdp) {
		this.cdp = cdp;
	}

	async move(x, y, buttons = 0) {
		await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons, button: buttons ? "left" : "none" });
	}

	async click(x, y) {
		await this.move(x, y);
		await this.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
		await sleep(60);
		await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
	}

	/** A mouse drag from `from` to `to` in `steps` moves `stepMs` apart: a hand's pace by default. */
	async drag(from, to, { steps = 24, stepMs = 16, holdMs = 0 } = {}) {
		await this.move(from.x, from.y);
		await this.cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: from.x, y: from.y, button: "left", buttons: 1, clickCount: 1 });
		if (holdMs) await sleep(holdMs);
		for (let i = 1; i <= steps; i++) {
			await this.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps, 1);
			await sleep(stepMs);
		}
		await this.cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: to.x, y: to.y, button: "left", buttons: 0, clickCount: 1 });
	}

	wheel(x, y, dx, dy, ctrl = false) {
		return this.cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: dx, deltaY: dy, modifiers: ctrl ? 2 : 0 });
	}

	/**
	 * A two-finger trackpad swipe at (x, y): the fingers' push, rising deltas every 8 ms, then (unless `tail` is 0) the
	 * momentum tail decaying by `decay` an event until it is under a pixel. `dir` 1 swipes on (the content moves left), -1 back.
	 */
	async stroke(x, y, dir, { push = [2, 8, 20, 40, 54, 60], tail = 1, decay = 0.035, stepMs = 8 } = {}) {
		for (const d of push) {
			void this.wheel(x, y, dir * d, 0);
			await sleep(stepMs);
		}
		if (!tail) return;
		let d = push[push.length - 1] * tail;
		while (d >= 1) {
			d *= 1 - decay;
			void this.wheel(x, y, dir * d, 0);
			await sleep(stepMs);
		}
	}

	async touchOn() {
		await this.cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
	}

	touch(type, points) {
		return this.cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })) });
	}

	/** A finger from `from` to `to`: `steps` moves `stepMs` apart, held `holdMs` at the start (a long press), lifted at once or after `restMs`. */
	async swipe(from, to, { steps = 10, stepMs = 16, holdMs = 0, restMs = 0 } = {}) {
		await this.touch("touchStart", [from]);
		if (holdMs) await sleep(holdMs);
		for (let i = 1; i <= steps; i++) {
			await this.touch("touchMove", [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }]);
			await sleep(stepMs);
		}
		if (restMs) await sleep(restMs);
		await this.touch("touchEnd", []);
	}

	async tap(x, y) {
		await this.touch("touchStart", [{ x, y }]);
		await sleep(70);
		await this.touch("touchEnd", []);
	}
}
