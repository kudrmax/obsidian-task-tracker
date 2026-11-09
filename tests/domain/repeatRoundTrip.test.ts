import { describe, expect, it } from "vitest";
import { setRepeat } from "../../core/domain/operations";
import { type RepeatRule, sameRule } from "../../core/domain/Repeat";
import { editRepeat, type RepeatChange, type RepeatDraft, repeatDraft } from "../../core/domain/RepeatDraft";
import { TaskDocument } from "../../core/domain/TaskDocument";
import { parseTaskLine } from "../../core/domain/TaskLine";

const MARKERS = { dueDate: "📅", slot: "⏰", repeat: "🔁" };
const SECTIONS = { inbox: "Inbox", backlog: "Backlog", now: "Now", soon: "Soon", done: "Done" };
const TODAY = "2026-11-05";
const FILE = "## Inbox\n- [ ] Undated\n\n## Now\n\n## Soon\n- [ ] Dated 📅 2026-11-17\n- [ ] Timed ⏰ 2026-11-20 09:00-10:00\n\n## Done\n";

/** Every rule the repeat page can be tapped to: each kind, unit and count up to 3, and their weekdays or month's day. */
function menuRules(): RepeatRule[] {
	const rules: RepeatRule[] = [];
	for (const day of ["2026-11-05", "2026-11-30", "2026-11-09"]) {
		for (const kind of ["schedule", "afterDone"] as const) {
			for (const unit of ["day", "week", "month"] as const) {
				let draft: RepeatDraft | null = repeatDraft(day, null);
				const tap = (change: RepeatChange) => (draft = editRepeat(draft!, change) ?? draft);
				tap({ what: "kind", to: kind });
				tap({ what: "unit", to: unit });
				for (let every = 1; every <= 3; every++) {
					rules.push(draft!.rule);
					if (draft!.detail === "weekdays") {
						tap({ what: "weekday", day: 4 });
						rules.push(draft!.rule);
						tap({ what: "weekday", day: 6 });
						rules.push(draft!.rule);
					}
					tap({ what: "every", by: 1 });
				}
			}
		}
	}
	return rules;
}

describe("every rule the menu writes reads back the same", () => {
	const rules = menuRules();

	it("covers the kinds, units and counts", () => {
		expect(new Set(rules.map((r) => `${r.kind} ${r.unit} ${r.every}`)).size).toBe(18);
	});

	it.each(["inbox", "soon"] as const)("on a task in %s, as the file has it", (section) => {
		for (const rule of rules) {
			for (const index of section === "soon" ? [0, 1] : [0]) {
				const doc = TaskDocument.parse(FILE, SECTIONS, MARKERS);
				const written = setRepeat(doc, doc.tasks(section)[index], rule, TODAY);
				const entry = written.tasks(section)[index];
				const read = TaskDocument.parse(written.serialize(), SECTIONS, MARKERS).tasks(section)[index];
				expect(read.task.text, entry.raw).toBe(entry.task.text);
				expect(sameRule(read.task.repeat?.rule ?? null, rule), entry.raw).toBe(true);
				expect(read.task.repeat?.rule.from, entry.raw).toBe(entry.task.repeat?.rule.from);
			}
		}
	});
});

describe("a rule of every few units written without its from", () => {
	it("counts from the task's due date, as though written with it", () => {
		const p = parseTaskLine("- [ ] Report 📅 2026-12-05 🔁 every 2 months on the 5th", MARKERS)!;
		expect(p.task.text).toBe("Report");
		expect(p.task.repeat!.format()).toBe("every 2 months on the 5th from 2026-12-05");
	});

	it("counts from the slot's day, the rule written before the time", () => {
		const p = parseTaskLine("- [ ] Gym 🔁 every 2 weeks on Mon ⏰ 2026-11-09 18:00", MARKERS)!;
		expect(p.task).toMatchObject({ text: "Gym", slot: { date: "2026-11-09", start: 1080 } });
		expect(p.task.repeat!.rule.from).toBe("2026-11-09");
	});

	it("is kept as text on a task with no day of its own", () => {
		expect(parseTaskLine("- [ ] Water 🔁 every 3 days", MARKERS)!.task).toMatchObject({ text: "Water 🔁 every 3 days", repeat: null });
	});

	it("is kept in the file as written until the task is written again", () => {
		const text = "## Now\n- [ ] Report 📅 2026-12-05 🔁 every 2 months on the 5th\n";
		expect(TaskDocument.parse(text, SECTIONS, MARKERS).serialize()).toBe(text);
	});
});
