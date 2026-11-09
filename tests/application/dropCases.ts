import type { DropFrom, DropTo, TaskKey } from "../../core/application/contracts";
import type { Clock } from "../../core/application/ports";
import { DEFAULT_SETTINGS } from "../../core/settings";

/** The drops of spec §5.1 over one file, shared by the service's tests and the door's. */

/** Today, a later day, a past day. */
export const T = "2026-10-30";
export const D = "2026-11-03";
export const P = "2026-10-28";
export const clock: Clock = { now: () => new Date(2026, 9, 30, 14, 20) };

/**
 * Every list with a task outside any section and one in a section; Now with subtasks, a task on today's timeline and
 * one overdue; Soon with a task for the later day; a task on the later day's timeline.
 */
export const FILE = [
	"## Inbox",
	"",
	"- [ ] I1",
	"- [ ] I2",
	"### Ideas",
	"- [ ] I3",
	"",
	"## Now",
	"",
	"- [ ] N1",
	"\t- [ ] N1a",
	"\t- [ ] N1b",
	"- [ ] N2 ⏰ 2026-10-30 10:00-11:00",
	"- [ ] NP 📅 2026-10-28",
	"- [ ] NP2 📅 2026-10-28",
	"### Work",
	"- [ ] N3",
	"",
	"## Soon",
	"",
	"- [ ] S1",
	"- [ ] S2",
	"- [ ] SD 📅 2026-11-03",
	"- [ ] ST ⏰ 2026-11-03 09:00-09:30",
	"### Later",
	"- [ ] S3",
	"",
	"## Backlog",
	"",
	"- [ ] B1",
	"### Someday",
	"- [ ] B2",
	"",
	"## Done",
	"",
].join("\n");

/** Minutes from the start of the day, which the settings start at 5, to `hour` o'clock: where a drop on the timeline lands. */
export const hourAt = (hour: number) => (hour - DEFAULT_SETTINGS.dayStartHour) * 60;

/** A drop as the gesture gives it: the tasks carried and where each came from, the target, the day the day column shows. */
export interface DropCase {
	readonly name: string;
	readonly day: string;
	readonly tasks: readonly (readonly [string, DropFrom])[];
	readonly to: (key: (text: string) => TaskKey) => DropTo;
}

export const SINGLE: readonly DropCase[] = [
	{ name: "today's list → the timeline", day: T, tasks: [["N1", "day"]], to: () => ({ kind: "time", start: hourAt(12) }) },
	{ name: "a later day's list → its timeline: Soon with that day", day: D, tasks: [["SD", "day"]], to: () => ({ kind: "time", start: hourAt(12) }) },
	{ name: "today's list → a later day's timeline: Now goes to Soon", day: D, tasks: [["N3", "day"]], to: () => ({ kind: "time", start: hourAt(12) }) },
	{ name: "Soon → the timeline", day: T, tasks: [["S1", "soon"]], to: () => ({ kind: "time", start: hourAt(13) }) },
	{ name: "Inbox → the timeline", day: T, tasks: [["I1", "inbox"]], to: () => ({ kind: "time", start: hourAt(13) }) },
	{ name: "Backlog → the timeline", day: T, tasks: [["B2", "backlog"]], to: () => ({ kind: "time", start: hourAt(13) }) },
	{ name: "a subtask → the timeline: it becomes a task", day: T, tasks: [["N1a", "day"]], to: () => ({ kind: "time", start: hourAt(13) }) },
	{ name: "the timeline → another time, with its duration", day: T, tasks: [["N2", "timeline"]], to: () => ({ kind: "time", start: hourAt(15) }) },
	{ name: "the timeline → today's list before a task", day: T, tasks: [["N2", "timeline"]], to: (k) => ({ kind: "list", column: "day", before: k("N1") }) },
	{ name: "the timeline → the end of a list", day: T, tasks: [["N2", "timeline"]], to: () => ({ kind: "list", column: "day", before: null }) },
	{ name: "the later day's timeline → its list", day: D, tasks: [["ST", "timeline"]], to: () => ({ kind: "list", column: "day", before: null }) },
	{ name: "the timeline → a section of today's list", day: T, tasks: [["N2", "timeline"]], to: (k) => ({ kind: "group", list: "now", date: null, group: "Work", before: k("N3") }) },
	{ name: "the timeline → under a task", day: T, tasks: [["N2", "timeline"]], to: (k) => ({ kind: "nest", parent: k("N1"), before: null }) },
	{ name: "clearSlot", day: T, tasks: [["N2", "timeline"]], to: () => ({ kind: "clearSlot" }) },
	{ name: "a past day's list → before another of its tasks", day: P, tasks: [["NP2", "day"]], to: (k) => ({ kind: "list", column: "day", before: k("NP") }) },
	{ name: "a past day's list → its end", day: P, tasks: [["NP", "day"]], to: () => ({ kind: "list", column: "day", before: null }) },
	{ name: "Soon → a past day's list", day: P, tasks: [["S1", "soon"]], to: () => ({ kind: "list", column: "day", before: null }) },
	{ name: "Inbox → a past day's list", day: P, tasks: [["I2", "inbox"]], to: () => ({ kind: "list", column: "day", before: null }) },
	{ name: "Backlog → a past day's list", day: P, tasks: [["B1", "backlog"]], to: () => ({ kind: "list", column: "day", before: null }) },
	{ name: "Soon → today's list without sections", day: T, tasks: [["S2", "soon"]], to: (k) => ({ kind: "list", column: "day", before: k("N1") }) },
	{ name: "Soon → a later day's list without sections", day: D, tasks: [["S2", "soon"]], to: () => ({ kind: "list", column: "day", before: null }) },
	{ name: "today's list → before a task", day: T, tasks: [["N3", "day"]], to: (k) => ({ kind: "list", column: "day", before: k("N1") }) },
	{ name: "Soon's own card → before another in Soon", day: T, tasks: [["S2", "soon"]], to: (k) => ({ kind: "list", column: "soon", before: k("S1") }) },
	{ name: "Soon's own card → the end of Soon", day: T, tasks: [["S1", "soon"]], to: () => ({ kind: "list", column: "soon", before: null }) },
	{ name: "today's list → the end of Soon", day: T, tasks: [["N1", "day"]], to: () => ({ kind: "list", column: "soon", before: null }) },
	{ name: "a later day's list → the end of Soon", day: D, tasks: [["SD", "day"]], to: () => ({ kind: "list", column: "soon", before: null }) },
	{ name: "Inbox → the end of Inbox", day: T, tasks: [["I1", "inbox"]], to: () => ({ kind: "list", column: "inbox", before: null }) },
	{ name: "Soon → the end of Inbox", day: T, tasks: [["S1", "soon"]], to: () => ({ kind: "list", column: "inbox", before: null }) },
	{ name: "Soon → the end of Backlog", day: T, tasks: [["S1", "soon"]], to: () => ({ kind: "list", column: "backlog", before: null }) },
	{ name: "Inbox → before a task of Backlog", day: T, tasks: [["I1", "inbox"]], to: (k) => ({ kind: "list", column: "backlog", before: k("B1") }) },
	{ name: "Soon → a section of today's list", day: T, tasks: [["S1", "soon"]], to: (k) => ({ kind: "group", list: "now", date: null, group: "Work", before: k("N3") }) },
	{ name: "Inbox → the end of a section of today's list", day: T, tasks: [["I1", "inbox"]], to: () => ({ kind: "group", list: "now", date: null, group: "Work", before: null }) },
	{ name: "Backlog → No section of today's list", day: T, tasks: [["B2", "backlog"]], to: (k) => ({ kind: "group", list: "now", date: null, group: null, before: k("N1") }) },
	{ name: "today's list → its section", day: T, tasks: [["N1", "day"]], to: () => ({ kind: "group", list: "now", date: null, group: "Work", before: null }) },
	{ name: "Soon → a later day's list in a section", day: D, tasks: [["S1", "soon"]], to: () => ({ kind: "group", list: "soon", date: D, group: "Later", before: null }) },
	{ name: "today's list → a later day's list", day: D, tasks: [["N1", "day"]], to: (k) => ({ kind: "group", list: "soon", date: D, group: null, before: k("SD") }) },
	{ name: "a later day's list → a section of Soon", day: D, tasks: [["SD", "day"]], to: (k) => ({ kind: "group", list: "soon", date: null, group: "Later", before: k("S3") }) },
	{ name: "today's list → Soon", day: T, tasks: [["N3", "day"]], to: () => ({ kind: "group", list: "soon", date: null, group: null, before: null }) },
	{ name: "Inbox → Soon", day: T, tasks: [["I3", "inbox"]], to: (k) => ({ kind: "group", list: "soon", date: null, group: null, before: k("S2") }) },
	{ name: "Soon → a section of Inbox", day: T, tasks: [["S1", "soon"]], to: () => ({ kind: "group", list: "inbox", date: null, group: "Ideas", before: null }) },
	{ name: "today's list → Inbox", day: T, tasks: [["NP", "day"]], to: (k) => ({ kind: "group", list: "inbox", date: null, group: null, before: k("I2") }) },
	{ name: "Inbox → a section of Backlog", day: T, tasks: [["I1", "inbox"]], to: (k) => ({ kind: "group", list: "backlog", date: null, group: "Someday", before: k("B2") }) },
	{ name: "Backlog → Inbox", day: T, tasks: [["B1", "backlog"]], to: () => ({ kind: "group", list: "inbox", date: null, group: null, before: null }) },
	{ name: "a subtask → a section: it becomes a task", day: T, tasks: [["N1b", "day"]], to: () => ({ kind: "group", list: "now", date: null, group: "Work", before: null }) },
	{ name: "a subtask → before its sibling", day: T, tasks: [["N1b", "day"]], to: (k) => ({ kind: "nest", parent: k("N1"), before: k("N1a") }) },
	{ name: "today's list → under a task, last", day: T, tasks: [["N3", "day"]], to: (k) => ({ kind: "nest", parent: k("N1"), before: null }) },
	{ name: "Soon → under a task of today", day: T, tasks: [["S1", "soon"]], to: (k) => ({ kind: "nest", parent: k("N1"), before: k("N1b") }) },
	{ name: "Inbox → under a task of Inbox", day: T, tasks: [["I2", "inbox"]], to: (k) => ({ kind: "nest", parent: k("I1"), before: null }) },
	{ name: "Backlog → under a task of Soon", day: T, tasks: [["B1", "backlog"]], to: (k) => ({ kind: "nest", parent: k("S2"), before: null }) },
	{ name: "a task → under a subtask", day: T, tasks: [["N3", "day"]], to: (k) => ({ kind: "nest", parent: k("N1a"), before: null }) },
];

/** A gap of a column as the list gives it (`kind: "place"`), and the drop the service reads it as: each writes what that drop writes. */
export const PLACES: readonly (readonly [string, DropCase["to"], DropCase["to"]])[] = [
	["a section of today's list", (k) => ({ kind: "place", column: "day", place: { kind: "task", group: "Work", before: k("N3") } }), (k) => ({ kind: "group", list: "now", date: null, group: "Work", before: k("N3") })],
	["a later day's list in a section", () => ({ kind: "place", column: "day", place: { kind: "task", group: "Later", before: null } }), () => ({ kind: "group", list: "soon", date: D, group: "Later", before: null })],
	["a past day's list, with no sections", (k) => ({ kind: "place", column: "day", place: { kind: "task", group: "Work", before: k("NP") } }), (k) => ({ kind: "list", column: "day", before: k("NP") })],
	["under a task", (k) => ({ kind: "place", column: "soon", place: { kind: "subtask", parent: k("N1"), before: k("N1b") } }), (k) => ({ kind: "nest", parent: k("N1"), before: k("N1b") })],
	["Inbox's section", () => ({ kind: "place", column: "inbox", place: { kind: "task", group: "Ideas", before: null } }), () => ({ kind: "group", list: "inbox", date: null, group: "Ideas", before: null })],
	["a column's end, where it places nothing in a gap", () => ({ kind: "place", column: "inbox", place: null }), () => ({ kind: "list", column: "inbox", before: null })],
];

export const SEVERAL: readonly DropCase[] = [
	{ name: "the day and Soon → before a task of a past day's list", day: P, tasks: [["NP2", "day"], ["S1", "soon"]], to: (k) => ({ kind: "list", column: "day", before: k("NP") }) },
	{ name: "the day and Soon → a past day's list's end", day: P, tasks: [["NP", "day"], ["S2", "soon"]], to: () => ({ kind: "list", column: "day", before: null }) },
	{ name: "the day, Soon and Inbox → a section of today's list", day: T, tasks: [["N1", "day"], ["S1", "soon"], ["I1", "inbox"]], to: (k) => ({ kind: "group", list: "now", date: null, group: "Work", before: k("N3") }) },
	{ name: "Soon and Inbox → a later day's list", day: D, tasks: [["S2", "soon"], ["I2", "inbox"]], to: (k) => ({ kind: "group", list: "soon", date: D, group: null, before: k("SD") }) },
	{ name: "Soon and Inbox → Backlog", day: T, tasks: [["S1", "soon"], ["I3", "inbox"]], to: () => ({ kind: "group", list: "backlog", date: null, group: "Someday", before: null }) },
	{ name: "the day and Backlog → Inbox", day: T, tasks: [["N3", "day"], ["B1", "backlog"]], to: (k) => ({ kind: "group", list: "inbox", date: null, group: null, before: k("I1") }) },
	{ name: "two → under a task", day: T, tasks: [["N3", "day"], ["S1", "soon"]], to: (k) => ({ kind: "nest", parent: k("N1"), before: k("N1b") }) },
	{ name: "the day and Soon → the end of Soon", day: T, tasks: [["N3", "day"], ["S2", "soon"]], to: () => ({ kind: "list", column: "soon", before: null }) },
	{ name: "the day and Soon → before a task of Soon", day: T, tasks: [["N3", "day"], ["S2", "soon"]], to: (k) => ({ kind: "list", column: "soon", before: k("S1") }) },
	{ name: "Soon and Inbox → the end of Inbox", day: T, tasks: [["S1", "soon"], ["I3", "inbox"]], to: () => ({ kind: "list", column: "inbox", before: null }) },
	{ name: "a task with its own subtask → a section: the subtask goes along", day: T, tasks: [["N1", "day"], ["N1a", "day"]], to: () => ({ kind: "group", list: "now", date: null, group: "Work", before: null }) },
	{ name: "several → the timeline: nothing", day: T, tasks: [["N1", "day"], ["S1", "soon"]], to: () => ({ kind: "time", start: hourAt(12) }) },
];
