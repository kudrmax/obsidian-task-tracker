import { DayBoundary } from "./DayBoundary";
import type { LocalDate, SectionKey, Task } from "./Task";
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

function dueToNow(doc: TaskDocument, today: LocalDate, boundary: DayBoundary): TaskDocument {
	return gatherAtStart(doc, "now", (e) => {
		if (e.section !== "soon" || !isOpen(e.task)) return false;
		const due = e.task.dueDate !== null && e.task.dueDate <= today;
		const slotted = e.task.slot !== null && boundary.dayOfSlot(e.task.slot) <= today;
		return due || slotted;
	});
}

const GROUPED: readonly SectionKey[] = ["inbox", "now", "soon"];

/** What a section of the list may hold: what the list's column shows (sections spec §3.3). */
function fitsGroup(section: SectionKey, task: Task, today: LocalDate): boolean {
	if (section === "soon") return task.dueDate === null && task.slot === null;
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

export function normalize(doc: TaskDocument, today: LocalDate, boundary = DayBoundary.MIDNIGHT): TaskDocument {
	const listed = dueToNow(datedOutOfInbox(closedToDone(pastDatesToToday(erasePastSlots(doc, today, boundary), today))), today, boundary);
	const result = normalizeGroups(listed, today);
	return result.serialize() === doc.serialize() ? doc : result;
}
