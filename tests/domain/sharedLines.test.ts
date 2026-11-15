import { describe, expect, it } from "vitest";
import { sharedLines } from "../../core/domain/TextPatch";

/** The table of common runs as it was first written: the pairs every undo step of the file was ever made by. */
function tableLines(b: readonly string[], a: readonly string[]): (readonly [number, number])[] {
	const width = a.length + 1;
	const common = new Uint16Array((b.length + 1) * width);
	for (let i = b.length - 1; i >= 0; i--) {
		for (let j = a.length - 1; j >= 0; j--) {
			common[i * width + j] = b[i] === a[j] ? common[(i + 1) * width + j + 1] + 1 : Math.max(common[(i + 1) * width + j], common[i * width + j + 1]);
		}
	}
	const pairs: (readonly [number, number])[] = [];
	let i = 0;
	let j = 0;
	while (i < b.length || j < a.length) {
		if (i < b.length && j < a.length && b[i] === a[j]) pairs.push([i++, j++]);
		else if (j < a.length && (i === b.length || common[i * width + j + 1] >= common[(i + 1) * width + j])) j++;
		else i++;
	}
	return pairs;
}

/** A small generator of the same numbers every run. */
function numbers(seed: number): () => number {
	let s = seed;
	return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
}

describe("the lines two texts share", () => {
	it("are the pairs the table of common runs found, for every shape of change and every width of text", () => {
		const next = numbers(7);
		for (let round = 0; round < 3000; round++) {
			const alphabet = 1 + Math.floor(next() * 12);
			const length = Math.floor(next() * (round % 10 === 0 ? 140 : 40));
			const before = Array.from({ length }, () => `line ${Math.floor(next() * alphabet)}`);
			const after = [...before];
			for (let edits = Math.floor(next() * 6); edits > 0; edits--) {
				const at = Math.floor(next() * (after.length + 1));
				const kind = next();
				if (kind < 0.35) after.splice(at, 0, `line ${Math.floor(next() * alphabet)}`);
				else if (kind < 0.7) after.splice(at, 1);
				else {
					const [moved] = after.splice(at, 1);
					if (moved !== undefined) after.splice(Math.floor(next() * (after.length + 1)), 0, moved);
				}
			}
			const sides = round % 2 === 0 ? ([before, after] as const) : ([after, before] as const);
			expect(sharedLines(...sides)).toEqual(tableLines(...sides));
		}
	});

	it("are the table's for a task moved across a long file, word lengths past one machine word", () => {
		const file = Array.from({ length: 700 }, (_, i) => `- [ ] Task ${i % 97}`);
		const moved = [...file.slice(0, 30), ...file.slice(31, 600), "- [x] Task 30", ...file.slice(600)];
		expect(sharedLines(file, moved)).toEqual(tableLines(file, moved));
		expect(sharedLines(moved, file)).toEqual(tableLines(moved, file));
	});
});
