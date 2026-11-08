import { describe, expect, it } from "vitest";
import type { DropColumn, Header, ListCard, ProjectNote, ScreenView, TaskItem } from "../../core/application/contracts";
import { callDoor, type DoorAnswer, type DoorContext } from "../../core/application/PhoneCalls";

/**
 * The quick entry's field in a list grouped by project: every place the core gives it (Rename, the plus, Add Subtask, an
 * empty section's plate) points into the part of the project the card or section is drawn in, so the field stands there.
 */

const NOW = new Date(2026, 10, 7, 9, 30).getTime();
const T = "2026-11-07";
const NOTES: readonly ProjectNote[] = [
	{ name: "English", path: "English.md", link: "English" },
	{ name: "Japanese", path: "Japanese.md", link: "Japanese" },
];
const FILE = ["## Inbox", "", "## Now", "", "## Soon", "", "- [ ] E1 🗂️ [[English]]", "- [ ] J1 🗂️ [[Japanese]]", "- [ ] J2 🗂️ [[Japanese]]", "- [ ] N1", "### Later", "- [ ] J3 🗂️ [[Japanese]]", "", "## Backlog", "", "- [ ] BE 🗂️ [[English]]", "- [ ] BJ 🗂️ [[Japanese]]", "- [ ] BN", "", "## Done", ""].join("\n");

const GROUPED = { on: { soon: true, backlog: true } };
const context = (): DoorContext => ({ tasks: FILE, nowMs: NOW, projects: NOTES, grouping: GROUPED });

function ok(method: string, args: unknown[]): unknown {
	const answer = callDoor(method, JSON.parse(JSON.stringify(args)), context()) as DoorAnswer;
	if (!answer.ok) throw new Error(answer.error.message);
	return answer.result;
}

/** What a grouped column draws, as a host hands it to the entry: each part's sections' headers and cards, with the part's zone. */
function lookOf(screen: ScreenView) {
	const cards: Partial<Record<DropColumn, ListCard[]>> = {};
	const sections: Partial<Record<DropColumn, Header[]>> = {};
	for (const column of ["soon", "backlog"] as const) {
		const grouping = screen.projects[column];
		expect(grouping.on).toBe(true);
		cards[column] = grouping.groups.flatMap((g) => g.sections.flatMap((s) => s.rows.map(({ item, level }) => ({ key: item.key, level, group: s.name, project: g.zone }))));
		sections[column] = grouping.groups.flatMap((g) => g.sections.map((s) => ({ group: s.name, project: g.zone })));
	}
	return { cards, sections, sectioned: { soon: true, backlog: true }, day: T, shown: ["day", "soon", "inbox", "backlog"] };
}

interface EntryResult {
	readonly session: unknown;
	readonly value: unknown;
}

/** The field opened at `spot` (renaming `item`), and where `column`'s list draws it. */
function fieldAt(look: unknown, spot: unknown, column: DropColumn, item?: TaskItem): { readonly place: unknown; readonly at: unknown } {
	const opened = ok("entry.open", [null, look, spot, ...(item ? [item] : [])]) as EntryResult;
	const entry = (ok("entry.listEntry", [opened.session, look, column]) as EntryResult).value as { place: unknown; at: unknown };
	return { place: entry.place, at: entry.at };
}

/** Where the section of `project`'s part named `group` is drawn among the column's headers. */
function partIndex(look: ReturnType<typeof lookOf>, column: "soon" | "backlog", project: string | null, group: string | null): number {
	return look.sections[column]!.findIndex((h) => typeof h === "object" && h !== null && h.project === project && h.group === group);
}

const screen = () => ok("tasks.screen", [T]) as ScreenView;
const task = (s: ScreenView, title: string) => [...s.soon, ...s.backlog].flatMap(function walk(i: TaskItem): TaskItem[] {
	return [i, ...i.subtasks.flatMap(walk)];
}).find((i) => i.title === title)!;

describe("the field in a list grouped by project", () => {
	for (const [column, title, project, group] of [
		["soon", "J2", "Japanese", null],
		["soon", "J3", "Japanese", "Later"],
		["soon", "N1", null, null],
		["backlog", "BJ", "Japanese", null],
		["backlog", "BN", null, null],
	] as const) {
		it(`Rename stands over its card, in its project's part: ${column}, ${title}`, () => {
			const s = screen();
			const look = lookOf(s);
			const item = task(s, title);
			const spot = (ok("entry.renameSpot", [null, look, item, false]) as EntryResult).value as { place: { project?: unknown } };
			expect(spot.place.project).toBe(project);
			const cards = look.cards[column]!;
			const field = fieldAt(look, spot, column, item);
			expect(field.at).toEqual({ kind: "in", section: partIndex(look, column, project, group), card: cards.findIndex((c) => c.key.raw === item.key.raw), keepsPlate: false });
		});
	}

	for (const [column, title, project] of [
		["soon", "J1", "Japanese"],
		["backlog", "BE", "English"],
		["backlog", "BN", null],
	] as const) {
		it(`Add Subtask stands under its parent, in its project's part: ${column}, ${title}`, () => {
			const s = screen();
			const look = lookOf(s);
			const parent = task(s, title);
			const spot = (ok("entry.subtaskSpot", [null, look, parent.key]) as EntryResult).value as { place: { project?: unknown; level: number } };
			expect(spot.place).toMatchObject({ project, level: 1 });
			const field = fieldAt(look, spot, column);
			const cards = look.cards[column]!;
			expect(field.at).toEqual({ kind: "in", section: partIndex(look, column, project, null), card: cards.findIndex((c) => c.key.raw === parent.key.raw) + 1, keepsPlate: false });
		});
	}

	for (const column of ["soon", "backlog"] as const) {
		it(`the plus and a double click open at the end of the last part: ${column}`, () => {
			const look = lookOf(screen());
			const opened = ok("entry.openAtEnd", [null, look, column]) as EntryResult;
			const entry = (ok("entry.listEntry", [opened.session, look, column]) as EntryResult).value as { at: unknown };
			const last = look.sections[column]!.length - 1;
			expect(entry.at).toEqual({ kind: "in", section: last, card: look.cards[column]!.length, keepsPlate: false });
		});

		it(`a part's plate opens the field in that part: ${column}`, () => {
			const look = lookOf(screen());
			const opened = ok("entry.openIn", [null, look, column, null, "English"]) as EntryResult;
			const entry = (ok("entry.listEntry", [opened.session, look, column]) as EntryResult).value as { at: { kind: string; section: number } };
			expect(entry.at).toMatchObject({ kind: "in", section: partIndex(look, column, "English", null) });
		});
	}
});
