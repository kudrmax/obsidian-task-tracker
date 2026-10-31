import { describe, expect, it } from "vitest";
import { PresetEdits } from "../../src/ui/presetEdits";

function setup(start: string[]) {
	let presets: readonly string[] = start;
	const edits = new PresetEdits(() => presets, async (next) => void (presets = next));
	return { edits, now: () => presets };
}

describe("PresetEdits", () => {
	it("move reorders", async () => {
		const { edits, now } = setup(["Morning", "Afternoon", "Evening"]);
		await edits.move(2, 0);
		expect(now()).toEqual(["Evening", "Morning", "Afternoon"]);
		await edits.move(0, 2);
		expect(now()).toEqual(["Morning", "Afternoon", "Evening"]);
	});

	it("add appends an empty preset", async () => {
		const { edits, now } = setup(["Morning"]);
		await edits.add();
		expect(now()).toEqual(["Morning", ""]);
	});

	it("remove drops one", async () => {
		const { edits, now } = setup(["Morning", "Afternoon"]);
		await edits.remove(0);
		expect(now()).toEqual(["Afternoon"]);
	});

	it("rename trims and keeps the others", async () => {
		const { edits, now } = setup(["Morning", "Afternoon"]);
		await edits.rename(1, " Вечер ");
		expect(now()).toEqual(["Morning", "Вечер"]);
	});
});
