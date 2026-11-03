import { describe, expect, it } from "vitest";
import { TextPatch } from "../../src/domain/TextPatch";

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
