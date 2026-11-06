import { describe, expect, it } from "vitest";
import { TextPatch } from "../../core/domain/TextPatch";

const text = (...lines: string[]) => lines.join("\n");

const FILE = text("# Now", "- [ ] A", "- [ ] B", "- [ ] C", "", "# Soon", "- [ ] D", "- [ ] E", "", "# Done");

describe("TextPatch", () => {
	it("takes a changed line back", () => {
		const after = FILE.replace("- [ ] B", "- [x] B");
		expect(TextPatch.between(FILE, after).revert(after)).toBe(FILE);
	});

	it("puts a deleted line back and takes an added one away", () => {
		const deleted = FILE.replace("- [ ] C\n", "");
		expect(TextPatch.between(FILE, deleted).revert(deleted)).toBe(FILE);
		const added = FILE.replace("- [ ] E\n", "- [ ] E\n- [ ] F\n");
		expect(TextPatch.between(FILE, added).revert(added)).toBe(FILE);
	});

	it("takes back a line moved far down", () => {
		const moved = text("# Now", "- [ ] B", "- [ ] C", "", "# Soon", "- [ ] D", "- [ ] E", "", "# Done", "- [x] A");
		expect(TextPatch.between(FILE, moved).revert(moved)).toBe(FILE);
	});

	it("changes at the very start and end of the file", () => {
		const after = text("# Today", ...FILE.split("\n").slice(1), "- [x] Z");
		expect(TextPatch.between(FILE, after).revert(after)).toBe(FILE);
	});

	it("keeps an edit made since elsewhere in the file", () => {
		const after = FILE.replace("- [ ] B", "- [x] B");
		const edited = after.replace("- [ ] E", "- [ ] E edited");
		expect(TextPatch.between(FILE, after).revert(edited)).toBe(FILE.replace("- [ ] E", "- [ ] E edited"));
	});

	it("keeps apart two changes with shared lines between them, as it always did", () => {
		const before = text("c", "c", "b", "b", "b", "b", "c", "b");
		const after = text("b", "b", "b", "b", "b", "b", "c");
		const edited = text("b", "b", "b", "b", "x", "b", "c");
		expect(TextPatch.between(before, after).revert(edited)).toBe(text("c", "c", "b", "b", "x", "b", "c", "b"));
	});

	it("finds its lines though lines were added above them since", () => {
		const after = FILE.replace("- [ ] D", "- [x] D");
		const shifted = after.replace("# Now\n", "# Now\n- [ ] new 1\n- [ ] new 2\n");
		expect(TextPatch.between(FILE, after).revert(shifted)).toBe(FILE.replace("# Now\n", "# Now\n- [ ] new 1\n- [ ] new 2\n"));
	});

	it("gives up when the lines it changed were edited since", () => {
		const after = FILE.replace("- [ ] B", "- [x] B");
		expect(TextPatch.between(FILE, after).revert(after.replace("- [x] B", "- [x] B renamed"))).toBeNull();
	});

	it("gives up as a whole: one part found and another not changes nothing", () => {
		const after = FILE.replace("- [ ] A", "- [x] A").replace("- [ ] E", "- [x] E");
		expect(TextPatch.between(FILE, after).revert(after.replace("- [x] E", "gone"))).toBeNull();
	});

	it("does it again after taking it back", () => {
		const after = FILE.replace("- [ ] C\n", "").replace("- [ ] E", "- [ ] E\n- [ ] C");
		const patch = TextPatch.between(FILE, after);
		expect(patch.apply(patch.revert(after)!)).toBe(after);
	});

	it("knows when nothing changed", () => {
		expect(TextPatch.between(FILE, FILE).empty).toBe(true);
		expect(TextPatch.between(FILE, `${FILE}\n`).empty).toBe(false);
	});
});

describe("TextPatch on big files", () => {
	it("takes back a line moved from near the top to the end of 2000 lines quickly", () => {
		const lines = Array.from({ length: 2000 }, (_, i) => (i % 50 === 0 ? "" : `- [ ] Task ${i}`));
		const before = lines.join("\n");
		const after = [...lines.slice(0, 10), ...lines.slice(11), lines[10]].join("\n");
		const took = () => {
			const started = performance.now();
			TextPatch.between(before, after);
			return performance.now() - started;
		};
		expect(Math.min(...Array.from({ length: 5 }, took))).toBeLessThan(20);
		const patch = TextPatch.between(before, after);
		expect(patch.revert(after)).toBe(before);
		expect(patch.apply(before)).toBe(after);
	});
});

describe("TextPatch on random edits", () => {
	/** Mulberry32: the same seed gives the same edits on every run. */
	function random(seed: number): () => number {
		return () => {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	}

	function edited(lines: readonly string[], next: () => number): string[] {
		const result = [...lines];
		const pick = (n: number) => Math.floor(next() * n);
		const edits = 1 + pick(4);
		for (let e = 0; e < edits; e++) {
			const kind = pick(4);
			if (kind === 0) result.splice(pick(result.length + 1), 0, `new ${pick(5)}`);
			else if (kind === 1 && result.length > 0) result.splice(pick(result.length), 1);
			else if (kind === 2 && result.length > 0) result.splice(pick(result.length + 1), 0, ...result.splice(pick(result.length), 1));
			else if (result.length > 0) result[pick(result.length)] = `changed ${pick(5)}`;
		}
		return result;
	}

	it("takes back and does again 200 random edits", () => {
		const next = random(20261103);
		for (let run = 0; run < 200; run++) {
			const size = Math.floor(next() * 61);
			const lines = Array.from({ length: size }, () => ["", "- [ ] A", "- [ ] B", "## Now", `- [ ] T${Math.floor(next() * 20)}`][Math.floor(next() * 5)]);
			const before = lines.join("\n");
			const after = run % 20 === 0 ? before : edited(lines, next).join("\n");
			const patch = TextPatch.between(before, after);
			expect(patch.revert(after), `run ${run}`).toBe(before);
			expect(patch.apply(before), `run ${run}`).toBe(after);
		}
	});
});
