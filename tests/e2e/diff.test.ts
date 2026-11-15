import { describe, expect, it } from "vitest";
import { diffImages } from "../../scripts/e2e/diff";
import { decodePng, encodePng, type Image } from "../../scripts/e2e/png";
import { REST } from "../../scripts/e2e/driver";
import { budgetTasks } from "../../scripts/e2e/main";

const image = (width: number, height: number, paint: (x: number, y: number) => [number, number, number]): Image => {
	const data = new Uint8Array(width * height * 4);
	for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set([...paint(x, y), 255], (y * width + x) * 4);
	return { width, height, data };
};

describe("the shots' PNG and diff", () => {
	it("reads back what it writes", () => {
		const a = image(7, 5, (x, y) => [x * 30, y * 40, (x + y) * 10]);
		expect(decodePng(encodePng(a))).toEqual(a);
	});

	it("fails a region past its tolerance, passes one within, and ignores the masks", () => {
		const base = image(10, 10, () => [0, 0, 0]);
		const moved = image(10, 10, (x, y) => (x < 2 && y < 2 ? [255, 255, 255] : [0, 0, 0]));
		const rest = { channel: 16, share: 0.01 };
		expect(diffImages(base, moved, { regions: [], rest, masks: [] }).failed).toBe(true);
		expect(diffImages(base, moved, { regions: [{ name: "corner", rect: { x: 0, y: 0, w: 5, h: 5 }, channel: 16, share: 0.2 }], rest, masks: [] }).failed).toBe(false);
		expect(diffImages(base, moved, { regions: [], rest, masks: [{ x: 0, y: 0, w: 2, h: 2 }] }).failed).toBe(false);
		expect(diffImages(base, image(10, 10, () => [10, 10, 10]), { regions: [], rest, masks: [] }).failed).toBe(false);
		expect(diffImages(base, image(9, 10, () => [0, 0, 0]), { regions: [], rest, masks: [] }).sizeDiffers).toBe(true);
	});

	it("catches a text one pixel off sideways at the shots' own tolerance, and lets the GPU's rounding pass", () => {
		/** Glyph-like strokes: short bright bars over a dark ground, about a tenth of the image. */
		const glyphs = (shift: number) => image(300, 60, (x, y) => ((x - shift) % 7 < 2 && y % 20 > 4 && y % 20 < 15 && x > 10 && x < 290 ? [230, 230, 230] : [20, 20, 22]));
		expect(diffImages(glyphs(0), glyphs(1), { regions: [], rest: REST, masks: [] }).failed).toBe(true);
		const noisy = image(300, 60, (x, y) => {
			const base = x % 7 < 2 && y % 20 > 4 && y % 20 < 15 && x > 10 && x < 290 ? [230, 230, 230] : [20, 20, 22];
			const n = ((x * 7 + y * 13) % 7) - 3;
			return [base[0] + n, base[1] + n, base[2] + n] as [number, number, number];
		});
		expect(diffImages(glyphs(0), noisy, { regions: [], rest: REST, masks: [] }).failed).toBe(false);
	});

	it("loads the budget run with 300 tasks", () => {
		const text = budgetTasks("## Inbox\n\n- [ ] One\n\n## Backlog\n\n- [ ] Two\n");
		expect(text.match(/^- \[ \] /gm)).toHaveLength(300);
	});
});
