import { GROUPED_LISTS } from "../domain/Lists";
import type { DayBoundary } from "../domain/DayBoundary";
import { dayColumn, dayOfPlacement, dayOfTask, placementOfDay, type TaskScreen, taskScreen } from "../domain/Days";
import { typedMarks } from "../domain/Marks";
import { priorityOfTitle, withPriority } from "../domain/Priority";
import { backlogList, dayList, inboxList, slottedOn, soonWithoutDate } from "../domain/queries";
import { FuzzyQuery, matchParts, plainDescription, snippetParts, type TextMatch } from "../domain/search";
import { plainText } from "../domain/TaskText";
import { isOpen, type LocalDate, type SectionKey, type Slot } from "../domain/Task";
import { descriptionMarkdown } from "../domain/description";
import { flatten, type TaskDocument, type TaskEntry } from "../domain/TaskDocument";
import { type LabelLevel, type PriorityLevel, usableLabels, usableLevels } from "../settings";
import type {
	ColumnSections,
	DayColumn,
	DaySpan,
	DayView,
	DraftMarks,
	DropColumn,
	DropOrigin,
	FullTree,
	GroupedList,
	ListSection,
	MenuFrom,
	MenuScreen,
	PickedTask,
	Placement,
	ScreenView,
	SearchGroup,
	SearchHit,
	TaskItem,
	TaskKey,
	TaskMenuModel,
} from "./contracts";
import { draftMarksOf } from "./marks";
import { carriedWith, menuOffer, taskMenu } from "./menus";
import { offeredNames, type SectionOffer, shownSections } from "./sections";
import { samePlace } from "./taskKeys";
import { fullTree } from "./fullTree";
import { type ItemLevels, itemLevels, toItem } from "./taskItems";
import type { TaskRules } from "./TaskRules";
import { droppedSpan, type ResizeEdge, type SlottedTask, type StretchSpan, TimelineSpans } from "./TimelineSpans";
import type { Clock, SettingsStore } from "./ports";

/** The file as one read sees it: normalized for `today`, the day beginning at `boundary`. */
export interface Snapshot {
	readonly doc: TaskDocument;
	readonly today: LocalDate;
	readonly boundary: DayBoundary;
}

/** A list's sections with a heading or tasks, in file order; an empty one is a heading over no task. */
function sectionsOf(doc: TaskDocument, list: GroupedList): readonly ListSection[] {
	return doc
		.groups(list)
		.filter((g) => g.heading || g.entries.length > 0)
		.map((g) => ({ name: g.name, empty: g.name !== null && g.entries.length === 0 }));
}

/** The sections a search walks, in the order its results stand. */
const SEARCH_ORDER: readonly SectionKey[] = ["inbox", "backlog", "soon", "now", "done"];

interface RankedHit {
	readonly hit: SearchHit;
	readonly title: TextMatch | null;
	readonly description: TextMatch | null;
}

/** A match in the title before one only in the description, then the higher score; a sort keeps ties in file order. */
function byQuality(a: RankedHit, b: RankedHit): number {
	if ((a.title === null) !== (b.title === null)) return a.title ? -1 : 1;
	return (b.title ?? b.description)!.score - (a.title ?? a.description)!.score;
}

/** A task on the timeline as its rules read it; one without a slot has no place there. */
function slotted(item: TaskItem): SlottedTask {
	if (!item.slot) throw new Error("Task Calendar: the task has no slot on the timeline");
	return { slot: item.slot, open: item.open };
}

/**
 * Every answer the task service reads, synchronous: over the settings and the clock alone, or over a snapshot of the file.
 * The plugin's TaskServiceImpl reads the vault's file into a snapshot and asks these; the phone's door the text it is handed.
 */
export class TaskReads {
	constructor(
		private readonly rules: TaskRules,
		private readonly settings: SettingsStore,
		private readonly clock: Clock,
	) {}

	priorityLevels(): readonly PriorityLevel[] {
		return this.rules.priorityLevels();
	}

	labelLevels(): readonly LabelLevel[] {
		return usableLabels(this.settings.get().labels);
	}

	parseTitle(text: string): { readonly text: string; readonly priority: PriorityLevel | null } {
		const levels = this.priorityLevels();
		const parsed = priorityOfTitle(text, levels.map((l) => l.prefix));
		return { text: parsed.text, priority: levels.find((l) => l.prefix === parsed.priority) ?? null };
	}

	draftMarks(text: string, priority: string | null, labels: readonly string[]): DraftMarks {
		const levels = this.priorityLevels();
		return draftMarksOf(typedMarks(text, priority, labels, levels.map((l) => l.prefix)), levels, this.labelLevels());
	}

	isBlank(text: string): boolean {
		return this.rules.isBlank(text);
	}

	withPriority(text: string, prefix: string | null): string {
		return withPriority(text, prefix, this.priorityLevels().map((l) => l.prefix));
	}

	screen(s: Snapshot, date: LocalDate): ScreenView {
		return {
			day: this.dayView(s, date),
			soon: this.soonWithoutDateView(s),
			inbox: this.inboxView(s),
			backlog: this.backlogView(s),
			done: this.doneView(s),
			sections: this.listSections(s),
			offer: this.sectionOffer(s, date),
			missing: false,
			calendars: true,
		};
	}

	/** The screen without a tasks file: nothing in any list, and no calendars beside nothing. */
	missingScreen(date: LocalDate): ScreenView {
		const none = { inbox: [], backlog: [], soon: [], now: [] };
		return {
			day: { date, list: [], slotted: [] },
			soon: [],
			inbox: [],
			backlog: [],
			done: [],
			sections: none,
			offer: { lists: none, ungrouped: this.settings.get().groups.ungrouped },
			missing: true,
			calendars: false,
		};
	}

	dayView({ doc, today, boundary }: Snapshot, date: LocalDate): DayView {
		const item = this.itemOf(today);
		return { date, list: dayList(doc, date, today, boundary).map(item), slotted: slottedOn(doc, date, boundary).map(item) };
	}

	soonWithoutDateView({ doc, today }: Snapshot): readonly TaskItem[] {
		return soonWithoutDate(doc).map(this.itemOf(today));
	}

	inboxView({ doc, today }: Snapshot): readonly TaskItem[] {
		return inboxList(doc).map(this.itemOf(today));
	}

	backlogView({ doc, today }: Snapshot): readonly TaskItem[] {
		return backlogList(doc).map(this.itemOf(today));
	}

	doneView({ doc, today }: Snapshot): readonly TaskItem[] {
		return doc.tasks("done").map(this.itemOf(today));
	}

	sectionOffer({ doc, today, boundary }: Snapshot, date: LocalDate): SectionOffer {
		const { presets, ungrouped } = this.settings.get().groups;
		const shown = [...dayList(doc, date, today, boundary), ...soonWithoutDate(doc), ...inboxList(doc), ...backlogList(doc)];
		const names = (list: GroupedList) =>
			offeredNames(shownSections(shown.filter((entry) => entry.section === list).map((entry) => entry.group), sectionsOf(doc, list)), presets, ungrouped);
		return { lists: { now: names("now"), soon: names("soon"), inbox: names("inbox"), backlog: names("backlog") }, ungrouped };
	}

	listSections({ doc }: Snapshot): Readonly<Record<GroupedList, readonly ListSection[]>> {
		return Object.fromEntries(GROUPED_LISTS.map((list) => [list, sectionsOf(doc, list)])) as Record<GroupedList, readonly ListSection[]>;
	}

	search(s: Snapshot | null, query: string): readonly SearchGroup[] {
		const fuzzy = FuzzyQuery.of(query);
		if (!fuzzy || !s) return [];
		const { doc, today } = s;
		const item = this.itemOf(today);
		const ranked: RankedHit[] = [];
		const visit = (entry: TaskEntry): void => {
			const titleText = plainText(entry.task.text);
			const title = fuzzy.match(titleText);
			const markdown = descriptionMarkdown(entry);
			const descriptionText = markdown === null ? "" : plainDescription(markdown);
			const description = descriptionText === "" ? null : fuzzy.matchWords(descriptionText);
			if (title || description) {
				const hit: SearchHit = {
					item: item(entry),
					title: title ? matchParts(titleText, title.found) : [],
					description: description ? snippetParts(descriptionText, description.found) : null,
				};
				ranked.push({ hit, title, description });
			}
			for (const sub of entry.subtasks) if (isOpen(sub.task.status)) visit(sub);
		};
		const groups: SearchGroup[] = [];
		for (const list of SEARCH_ORDER) {
			ranked.length = 0;
			for (const entry of doc.tasks(list)) visit(entry);
			if (ranked.length > 0) groups.push({ list, hits: ranked.sort(byQuality).map((r) => r.hit) });
		}
		return groups;
	}

	/** A query that finds nothing reads no file: the service asks before it reads. */
	searches(query: string): boolean {
		return FuzzyQuery.of(query) !== null;
	}

	screenOf({ doc, today }: Snapshot, item: TaskItem): TaskScreen {
		const top = item.isSubtask ? doc.find(item.key.section, item.key.index, []) : undefined;
		return top ? taskScreen(top.section, dayOfTask(top.section, top.task, today)) : taskScreen(item.list, item.day);
	}

	findIn(items: readonly TaskItem[], key: TaskKey): TaskItem | null {
		for (const item of items) {
			if (samePlace(item.key, key)) return item;
			const inner = this.findIn(item.subtasks, key);
			if (inner) return inner;
		}
		return null;
	}

	find({ doc, today }: Snapshot, key: TaskKey, text: string): TaskItem | null {
		const atPlace = doc.find(key.section, key.index, key.path);
		const alike = flatten(doc.allTasks()).filter((entry) => entry.raw === key.raw);
		const entry = atPlace?.raw === key.raw ? atPlace : alike.length === 1 ? alike[0] : atPlace?.task.text === text ? atPlace : undefined;
		return entry ? this.itemAt(doc, entry, today) : null;
	}

	/** The tasks the keys name as the file has them, in their order; throws StaleTaskError when one is gone. */
	itemsAt({ doc, today }: Snapshot, keys: readonly TaskKey[]): readonly TaskItem[] {
		const levels = this.itemLevels();
		return keys.map((key) => {
			const entry = this.rules.entryOf(doc, key);
			const parent = key.path.length > 0 ? (doc.find(key.section, key.index, key.path.slice(0, -1)) ?? null) : null;
			return toItem(entry, today, levels, parent);
		});
	}

	/** The task at `place` in `doc` as the UI sees it, with the task it sits under; null when none stands there. */
	itemAt(doc: TaskDocument, place: Pick<TaskKey, "section" | "index" | "path">, today: LocalDate): TaskItem | null {
		const entry = doc.find(place.section, place.index, place.path);
		if (!entry) return null;
		const parent = place.path.length > 0 ? (doc.find(place.section, place.index, place.path.slice(0, -1)) ?? null) : null;
		return toItem(entry, today, this.itemLevels(), parent, this.rules.moment().boundary);
	}

	/** The task's line in the file as it stands, unnormalized, from 0. */
	lineOf(text: string, key: TaskKey): number {
		const doc = this.rules.parse(text);
		return doc.lineOf(this.rules.entryOf(doc, key));
	}

	placementOf(item: TaskItem): Placement {
		if (item.dueDate === this.today()) return { kind: "now" };
		if (item.dueDate !== null) return { kind: "date", date: item.dueDate };
		if (item.key.section === "inbox" || item.key.section === "backlog") return { kind: item.key.section };
		return item.key.section === "soon" ? { kind: "soon" } : { kind: "now" };
	}

	dayColumn(date: LocalDate): DayColumn {
		return dayColumn(date, this.today());
	}

	columnSections(column: DropColumn, date: LocalDate): ColumnSections | null {
		if (column !== "day") return { list: column, date: null };
		const { list, date: day, sections } = this.dayColumn(date);
		return sections ? { list, date: day } : null;
	}

	placementOfDay(date: LocalDate): Placement {
		return placementOfDay(date, this.today());
	}

	listName(list: SectionKey): string {
		return this.settings.get().sections[list];
	}

	dayOfPlacement(placement: Placement): LocalDate | null {
		return dayOfPlacement(placement, this.today());
	}

	menu(item: TaskItem, from: MenuFrom, screen: MenuScreen): TaskMenuModel {
		const offer = menuOffer([from], screen, (column, date) => this.columnSections(column, date));
		return taskMenu([item], screen.today, this.priorityLevels(), this.labelLevels(), offer, { kind: "task", from });
	}

	bulkMenu(picked: readonly PickedTask[], screen: MenuScreen): TaskMenuModel {
		const offer = menuOffer(picked.map((p) => p.from), screen, (column, date) => this.columnSections(column, date));
		return taskMenu(picked.map((p) => p.item), screen.today, this.priorityLevels(), this.labelLevels(), offer, { kind: "bulk" });
	}

	carried(lifted: TaskKey, picked: readonly TaskKey[]): readonly TaskKey[] {
		return carriedWith(lifted, picked);
	}

	fullTree(item: TaskItem): FullTree {
		return fullTree(item);
	}

	shownSpan(item: TaskItem, day: LocalDate): DaySpan {
		return this.timeline().shown(slotted(item), day);
	}

	dropSpan(item: TaskItem | null, from: DropOrigin, start: number): DaySpan {
		return droppedSpan(start, from === "timeline" ? (item?.durationMin ?? null) : null);
	}

	newSlot(day: LocalDate, start: number): Slot {
		return this.rules.moment().boundary.slotAt(day, droppedSpan(start, null).start, null);
	}

	stretch(item: TaskItem, day: LocalDate, edge: ResizeEdge, minute: number): StretchSpan {
		return this.timeline().stretched(slotted(item), day, edge, minute);
	}

	/** The timeline's rules by the clock and the day's boundary now. */
	timeline(): TimelineSpans {
		return new TimelineSpans(this.rules.moment().boundary, this.clock.now());
	}

	private itemOf(today: LocalDate): (entry: TaskEntry) => TaskItem {
		const levels = this.itemLevels();
		const { boundary } = this.rules.moment();
		return (entry) => toItem(entry, today, levels, null, boundary);
	}

	private itemLevels(): ItemLevels {
		const settings = this.settings.get();
		return itemLevels(usableLevels(settings.priorities), usableLabels(settings.labels));
	}

	private today(): LocalDate {
		return this.rules.today();
	}
}
