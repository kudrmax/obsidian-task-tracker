import { describe, expect, it } from "vitest";
import { type ScreenPart, ScreenParts } from "../../src/ui/ScreenParts";

function setup() {
	let busy = false;
	const drawn: ScreenPart[][] = [];
	const parts = new ScreenParts({ busy: () => busy, draw: (shown) => drawn.push([...shown].sort()) });
	return { parts, drawn, hold: (on: boolean) => (busy = on) };
}

describe("ScreenParts", () => {
	it("draws a part at once while nothing holds the screen", () => {
		const { parts, drawn } = setup();
		parts.request("events");
		expect(drawn).toEqual([["events"]]);
	});

	it("keeps the parts asked for while a gesture holds the screen, and draws them all once when it lets go", () => {
		const { parts, drawn, hold } = setup();
		hold(true);
		parts.request("tasks");
		parts.request("events");
		parts.request("tasks");
		expect(drawn).toEqual([]);
		hold(false);
		parts.flush();
		expect(drawn).toEqual([["events", "tasks"]]);
		parts.flush();
		expect(drawn).toEqual([["events", "tasks"]]);
	});

	it("draws nothing for nothing asked", () => {
		const { parts, drawn } = setup();
		parts.request();
		parts.flush();
		expect(drawn).toEqual([]);
	});
});
