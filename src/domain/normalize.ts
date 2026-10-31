import { DayBoundary } from "./DayBoundary";
import type { LocalDate, SectionKey, Task } from "./Task";
import { presetPlace } from "./operations";
import { type TaskDocument, type TaskEntry, ungroupedIndex } from "./TaskDocument";

function isOpen(task: Task): boolean {
	return task.status === "todo" || task.status === "inProgress";
}

/** A slot of a past day goes; a task left without a date keeps that day as its due date, for `pastDatesToToday`. */
function erasePastSlots(doc: TaskDocument, today: LocalDate, boundary: DayBoundary): TaskDocument {
	for (;;) {
		const entry = doc.allTasks().find((e) => isOpen(e.task) && e.task.slot !== null && boundary.dayOfSlot(e.task.slot) < today);
		if (!entry?.task.slot) return doc;
		doc = doc.replace(entry, { ...entry.task, slot: null, dueDate: entry.task.dueDate ?? boundary.dayOfSlot(entry.task.slot) });
	}
}

/** What was left undone stays for today: a past due date becomes today's. */
function pastDatesToToday(doc: TaskDocument, today: LocalDate): TaskDocument {
	for (;;) {
		const entry = doc.allTasks().find((e) => isOpen(e.task) && e.task.dueDate !== null && e.task.dueDate < today);
		if (!entry) return doc;
		doc = doc.replace(entry, { ...entry.task, dueDate: today });
	}
}

/** The candidates go to the start of the tasks outside any section of `target`, in file order: the last one goes first. */
function gatherAtStart(
	doc: TaskDocument,
	target: SectionKey,
	candidate: (e: TaskEntry) => boolean,
): TaskDocument {
	if (!doc.hasSection(target)) return doc;
	for (;;) {
		const entry = [...doc.allTasks()].reverse().find((e) => e.section !== target && candidate(e));
		if (!entry) return doc;
		doc = doc.moveEntry(entry, target, "start");
	}
}

function closedToDone(doc: TaskDocument): TaskDocument {
	return gatherAtStart(doc, "done", (e) => !isOpen(e.task));
}

/** An Inbox task that got a due date or a slot is sorted: it goes to Soon, and from there `dueToNow` takes today's on. */
function datedOutOfInbox(doc: TaskDocument): TaskDocument {
	if (!doc.hasSection("soon")) return doc;
	for (;;) {
		const entry = doc.tasks("inbox").find((e) => isOpen(e.task) && (e.task.dueDate !== null || e.task.slot !== null));
		if (!entry) return doc;
		doc = doc.moveEntry(entry, "soon", "end");
	}
}

/**
 * A Soon task whose day has come goes to Now. One in a section keeps it: it joins the end of Now's section of that name,
 * made when Now has none (a preset in the presets' order, any other name last). The others go to the start of No section.
 */
function dueToNow(doc: TaskDocument, today: LocalDate, boundary: DayBoundary, presets: readonly string[]): TaskDocument {
	const came = (e: TaskEntry): boolean => {
		if (e.section !== "soon" || !isOpen(e.task)) return false;
		const due = e.task.dueDate !== null && e.task.dueDate <= today;
		const slotted = e.task.slot !== null && boundary.dayOfSlot(e.task.slot) <= today;
		return due || slotted;
	};
	if (!doc.hasSection("now")) return doc;
	for (;;) {
		const entry = doc.tasks("soon").find((e) => e.group !== null && came(e));
		if (!entry?.group) return gatherAtStart(doc, "now", came);
		doc = intoGroup(doc, entry, entry.group, presets);
	}
}

/** The entry goes to the end of Now's section `name`, the section made first when Now has none. */
function intoGroup(doc: TaskDocument, entry: TaskEntry, name: string, presets: readonly string[]): TaskDocument {
	let index = doc.groups("now").findIndex((g) => g.index > 0 && g.name === name);
	if (index < 0) {
		const groups = doc.groups("now");
		index = presets.includes(name) ? presetPlace(groups, name, presets) : groups.length;
		doc = doc.addGroup("now", name, index);
	}
	return doc.moveEntry(doc.tasks(entry.section)[entry.index], "now", { endOf: index });
}

const GROUPED: readonly SectionKey[] = ["inbox", "now", "soon"];

/** What a section of the list may hold: what the list's column shows (sections spec §3.3). */
function fitsGroup(section: SectionKey, task: Task, today: LocalDate): boolean {
	if (section === "soon") return task.slot === null;
	if (section === "now") return task.slot === null && (task.dueDate === null || task.dueDate <= today);
	return true;
}

/** Rule 5: a task its section may not hold goes to the end of the tasks outside any section. */
function misplacedOutOfGroups(doc: TaskDocument, today: LocalDate): TaskDocument {
	for (const section of GROUPED) {
		for (;;) {
			const entry = doc.tasks(section).find((e) => e.group !== null && !fitsGroup(section, e.task, today));
			if (!entry) break;
			doc = doc.moveEntry(entry, section, "end");
		}
	}
	return doc;
}

/** Rule 6: a second section of the same name, or a second No section heading, joins the end of the first. */
function mergeDuplicates(doc: TaskDocument): TaskDocument {
	for (const section of GROUPED) {
		for (;;) {
			const groups = doc.groups(section);
			const twin = groups.find((g, i) => i > 0 && groups.some((o) => o.index > 0 && o.index < i && o.name === g.name));
			if (!twin) break;
			const first = groups.find((o) => o.index > 0 && o.name === twin.name)!;
			doc = doc.mergeGroup(section, twin.index, first.index, "end");
		}
	}
	return doc;
}

/** Rule 8: a section with nothing but blank lines goes. */
function dropEmptyGroups(doc: TaskDocument): TaskDocument {
	for (const section of GROUPED) {
		for (;;) {
			const empty = doc.groups(section).find((g) => g.index > 0 && g.blank);
			if (!empty) break;
			doc = doc.deleteGroup(section, empty.index);
		}
	}
	return doc;
}

/** Rule 7: with a No section heading, the tasks above the first heading join it; first of all, it needs no heading. */
function placeUngrouped(doc: TaskDocument): TaskDocument {
	for (const section of GROUPED) {
		const u = ungroupedIndex(doc.groups(section));
		if (u === 0) continue;
		if (doc.groups(section)[0].entries.length > 0) doc = doc.mergeGroup(section, 0, u, "start");
		if (u === 1 && doc.groups(section)[0].entries.length === 0) doc = doc.mergeGroup(section, 1, 0, "end");
	}
	return doc;
}

function normalizeGroups(doc: TaskDocument, today: LocalDate): TaskDocument {
	return placeUngrouped(dropEmptyGroups(mergeDuplicates(misplacedOutOfGroups(doc, today))));
}

/** `presets`: the section presets in their order, for a section rule 4 has to make in Now. */
export function normalize(doc: TaskDocument, today: LocalDate, boundary = DayBoundary.MIDNIGHT, presets: readonly string[] = []): TaskDocument {
	const listed = dueToNow(datedOutOfInbox(closedToDone(pastDatesToToday(erasePastSlots(doc, today, boundary), today))), today, boundary, presets);
	const result = normalizeGroups(listed, today);
	return result.serialize() === doc.serialize() ? doc : result;
}
