import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { holdsPointer, TouchPresses } from "../../../obsidian/ui/engine/drag/sensors";

const DRAG = join(__dirname, "..", "..", "..", "obsidian", "ui", "engine", "drag");
const code = (file: string) => readFileSync(join(DRAG, file), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

describe("the drag's sensors, dnd-kit's custom sensors as its docs make them (review of part 1, finding 13)", () => {
	it("lift nothing while a pinch, a resize or the divider holds the pointer; a ribbon's swipe gives it up to the long press", () => {
		expect(["zoom", "resize", "divider"].every(holdsPointer)).toBe(true);
		expect(holdsPointer("ribbon")).toBe(false);
		expect(holdsPointer(null)).toBe(false);
	});

	it("forget a touch's long press when a second finger lands, and only then", () => {
		const presses = new TouchPresses();
		let forgotten = 0;
		presses.waiting = () => forgotten++;
		presses.fingerDown(1);
		expect(forgotten).toBe(0);
		presses.fingerDown(2);
		expect(forgotten).toBe(1);
	});

	it("reach nothing of dnd-kit's sensors past their public constructor and activators", () => {
		const reached = ["Drag.tsx", "sensors.ts"].flatMap((file) => [...code(file).matchAll(/\.(timeoutId|documentListeners|handleStart|handleCancel|initialCoordinates|activated)\b/g)].map((m) => `${file}: ${m[1]}`));
		expect(reached).toEqual([]);
	});
});
