import { describe, expect, it } from "vitest";
import { normalize } from "../../src/domain/normalize";
import { TaskDocument } from "../../src/domain/TaskDocument";

const M = { dueDate: "📅", slot: "⏰" };
const SECTIONS = { now: "Now", soon: "Soon", done: "Done" };
const T = "2026-10-30";

function parse(text: string): TaskDocument {
	return TaskDocument.parse(text, SECTIONS, M);
}

describe("rule 1: past slots", () => {
	it("erases a past slot and keeps the due date", () => {
		expect(normalize(parse("## Now\n- [ ] A 📅 2026-11-03 ⏰ 2026-10-29 10:00-11:00\n"), T).serialize()).toBe("## Now\n- [ ] A 📅 2026-11-03\n");
	});

	it("leaves today's and future slots", () => {
		const text = "## Now\n- [ ] A ⏰ 2026-10-30 10:00-11:00\n\n## Soon\n- [/] B ⏰ 2026-11-01 10:00-11:00\n\n## Done\n";
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});

	it("does not touch done tasks", () => {
		const text = "## Done\n- [x] A ⏰ 2026-10-29 10:00-11:00\n- [-] B ⏰ 2026-10-29 10:00-11:00\n";
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});

	it("erases past slots in Soon and in-progress tasks too", () => {
		expect(normalize(parse("## Soon\n- [/] A ⏰ 2026-10-29 10:00-11:00\n- [ ] B ⏰ 2026-10-01 10:00-11:00\n"), T).serialize()).toBe("## Soon\n- [/] A\n- [ ] B\n");
	});
});

describe("rule 2: done and cancelled", () => {
	it("moves done and cancelled to the start of Done, keeping their order", () => {
		expect(normalize(parse("## Now\n- [x] A\n- [ ] B\n- [-] C\n\n## Done\n- [x] Old\n"), T).serialize()).toBe("## Now\n- [ ] B\n\n## Done\n- [x] A\n- [-] C\n- [x] Old\n");
	});

	it("takes them from Soon with their children", () => {
		expect(normalize(parse("## Now\n- [x] A\n\n## Soon\n- [x] S\n  - note\n- [ ] T\n\n## Done\n"), T).serialize()).toBe("## Now\n\n## Soon\n- [ ] T\n\n## Done\n- [x] A\n- [x] S\n  - note\n");
	});

	it("skips the rule when there is no Done section", () => {
		const text = "## Now\n- [x] A\n";
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});
});

describe("rule 3: Soon tasks due today or earlier", () => {
	it("moves a Soon task due today or earlier to the start of Now", () => {
		expect(normalize(parse("## Now\n- [ ] N\n\n## Soon\n- [ ] S 📅 2026-10-30\n- [ ] Later 📅 2026-11-01\n"), T).serialize()).toBe(
			"## Now\n- [ ] S 📅 2026-10-30\n- [ ] N\n\n## Soon\n- [ ] Later 📅 2026-11-01\n",
		);
	});

	it("moves overdue tasks in file order, keeping it", () => {
		expect(normalize(parse("## Now\n- [ ] N\n\n## Soon\n- [ ] A 📅 2026-10-01\n- [ ] X\n- [/] B 📅 2026-10-29\n"), T).serialize()).toBe(
			"## Now\n- [ ] A 📅 2026-10-01\n- [/] B 📅 2026-10-29\n- [ ] N\n\n## Soon\n- [ ] X\n",
		);
	});

	it("also fires on a slot dated today", () => {
		expect(normalize(parse("## Now\n\n## Soon\n- [ ] S ⏰ 2026-10-30 10:00-11:00\n"), T).serialize()).toBe("## Now\n- [ ] S ⏰ 2026-10-30 10:00-11:00\n\n## Soon\n");
	});

	it("does not move a done Soon task to Now", () => {
		expect(normalize(parse("## Now\n\n## Soon\n- [x] S 📅 2026-10-30\n\n## Done\n"), T).serialize()).toBe("## Now\n\n## Soon\n\n## Done\n- [x] S 📅 2026-10-30\n");
	});

	it("skips the rule when there is no Now section", () => {
		const text = "## Soon\n- [ ] S 📅 2026-10-30\n";
		expect(normalize(parse(text), T).serialize()).toBe(text);
	});
});

describe("as a whole", () => {
	const messy = "## Now\n- [ ] A ⏰ 2026-10-29 10:00-11:00\n- [x] B\n\n## Soon\n- [ ] C 📅 2026-10-29 ⏰ 2026-10-28 09:00-10:00\n- [-] D\n- [ ] E\n\n## Done\n- [x] Old\n";

	it("applies the rules in order with one result", () => {
		expect(normalize(parse(messy), T).serialize()).toBe("## Now\n- [ ] C 📅 2026-10-29\n- [ ] A\n\n## Soon\n- [ ] E\n\n## Done\n- [x] B\n- [-] D\n- [x] Old\n");
	});

	it("is idempotent", () => {
		const once = normalize(parse(messy), T);
		expect(normalize(once, T)).toBe(once);
	});

	it("returns the same object when nothing changes", () => {
		const clean = parse("## Now\n- [ ] A\n\n## Soon\n- [ ] B 📅 2026-11-01\n\n## Done\n- [x] C\n");
		expect(normalize(clean, T)).toBe(clean);
	});
});
