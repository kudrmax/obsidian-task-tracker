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
import { inProject, projectName } from "../domain/Project";
import { groupSectionNames, listGrouping, ProjectIndex, viewGrouping } from "./projects";
import type { DropTo, GroupingState, ListGrouping, ProjectNote, ProjectRef } from "./contracts";

/** The file as one read sees it: normalized for `today`, the day beginning at `boundary`; `text` as the file holds it. */
export interface Snapshot {
	readonly text: string;
	readonly doc: TaskDocument;
	readonly today: LocalDate;
	readonly boundary: DayBoundary;
}

/**
 * An answer that may need the file: whether it reads it (`reads`), tidies it for today first (`tidies`, a write that is no
 * step), and what it answers without one (`missing`; none: the call fails with TasksFileMissingError). The service and the
 * door ask it alike: tidy when it says, read when it says, then `answer` over what they read (null when it reads nothing).
 */
export interface Read<R> {
	readonly reads: boolean;
	readonly tidies?: boolean;
	readonly missing?: () => R;
	answer(s: Snapshot | null): R;
}

/** What the reads know of projects besides the file: the project notes, and how this device groups its lists. */
export interface ProjectSource {
	notes(): readonly ProjectNote[];
	grouping(): GroupingState;
}

const NO_PROJECT_SOURCE: ProjectSource = { notes: () => [], grouping: () => ({}) };

/** Which tasks a screen shows: all of them, or one project's (its view, where the cards go without the mark). */
interface Scope {
	readonly project: string | null;
	readonly index: ProjectIndex;
}

const NO_GROUPING: ListGrouping = { canGroup: false, on: false, groups: [] };

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
		private readonly projects: ProjectSource = NO_PROJECT_SOURCE,
	) {}

	/** The project notes, by name, as the Project page offers them. */
	projectNotes(): readonly ProjectRef[] {
		return this.index().known();
	}

	/** How this device groups its lists now. */
	grouping(): GroupingState {
		return this.projects.grouping();
	}

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

	/** The screen of `date`: the file tidied for today first; without a file, the empty screen. */
	screenRead(date: LocalDate, project?: string): Read<ScreenView> {
		return { reads: true, tidies: true, missing: () => this.missingScreen(date, project), answer: (s) => this.screen(s!, date, project) };
	}

	/** The screen of `date`; with `project`, that project's view. */
	screen(s: Snapshot, date: LocalDate, project?: string): ScreenView {
		const scope: Scope = { project: project ?? null, index: this.index() };
		const { doc, today, boundary } = s;
		const shown = (entries: readonly TaskEntry[]) => (scope.project === null ? entries : entries.filter((e) => inProject(e.project, scope.project)));
		const item = this.itemOf(today, scope);
		const lists = { inbox: shown(inboxList(doc)), backlog: shown(backlogList(doc)), soon: shown(soonWithoutDate(doc)) };
		const day = { date, list: shown(dayList(doc, date, today, boundary)).map(item), slotted: shown(slottedOn(doc, date, boundary)).map(item) };
		const all = this.listSections(s);
		const sections = scope.project === null ? all : (Object.fromEntries(GROUPED_LISTS.map((list) => [list, all[list].filter((sec) => !sec.empty)])) as unknown as Record<GroupedList, readonly ListSection[]>);
		const view = { soon: lists.soon.map(item), inbox: lists.inbox.map(item), backlog: lists.backlog.map(item) };
		const projects = this.listGroupings(scope, { ...view, day: day.list }, sections, date);
		const offer = this.offerOf(s, date, shown, sections, projects);
		return {
			day,
			...view,
			done: shown(doc.tasks("done")).map(item),
			sections,
			offer,
			missing: false,
			calendars: true,
			projects,
			project: scope.project === null ? null : scope.index.refOf(scope.project, false),
			titleDrops: this.titleDrops(date, projects),
		};
	}

	/** What a drop on each column's title means: into its list, by project where the list groups by it; a day without sections, its end. */
	private titleDrops(date: LocalDate, projects: Readonly<Record<GroupedList, ListGrouping>>): Readonly<Record<DropColumn, DropTo>> {
		const title = (list: GroupedList, day: LocalDate | null, grouping: ListGrouping): DropTo => ({ kind: "title", list, date: day, byProject: grouping.on });
		const day = this.columnSections("day", date);
		return {
			day: day ? title(day.list, day.date, projects.now) : { kind: "list", column: "day", before: null },
			soon: title("soon", null, projects.soon),
			inbox: title("inbox", null, projects.inbox),
			backlog: title("backlog", null, projects.backlog),
		};
	}

	/** Each list's grouping by project on this device; none in a project's view. */
	private listGroupings(scope: Scope, view: Readonly<Record<"soon" | "inbox" | "backlog" | "day", readonly TaskItem[]>>, sections: Readonly<Record<GroupedList, readonly ListSection[]>>, date: LocalDate): Readonly<Record<GroupedList, ListGrouping>> {
		if (scope.project !== null) {
			const ref = scope.index.refOf(scope.project, false)!;
			const dayList = this.columnSections("day", date)?.list ?? null;
			return {
				inbox: viewGrouping(ref, view.inbox, true, sections.inbox),
				backlog: viewGrouping(ref, view.backlog, true, sections.backlog),
				soon: viewGrouping(ref, view.soon, true, sections.soon),
				now: viewGrouping(ref, view.day, dayList !== null, dayList === null ? [] : sections[dayList]),
			};
		}
		const state = this.projects.grouping();
		const of = (list: "soon" | "inbox" | "backlog") => listGrouping({ list, items: view[list], sections: sections[list], projects: scope.index, state });
		return { inbox: of("inbox"), backlog: of("backlog"), soon: of("soon"), now: NO_GROUPING };
	}

	/** The screen without a tasks file: nothing in any list, and no calendars beside nothing. */
	missingScreen(date: LocalDate, project?: string): ScreenView {
		const none = { inbox: [], backlog: [], soon: [], now: [] };
		const off = { inbox: NO_GROUPING, backlog: NO_GROUPING, soon: NO_GROUPING, now: NO_GROUPING };
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
			projects: off,
			project: project === undefined ? null : this.index().refOf(project, false),
			titleDrops: this.titleDrops(date, off),
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

	sectionOffer(s: Snapshot, date: LocalDate): SectionOffer {
		return this.screen(s, date).offer;
	}

	/** The sections the menus offer on the screen `shown` draws; a list grouped by project offers each group its own. */
	private offerOf({ doc, today, boundary }: Snapshot, date: LocalDate, filter: (entries: readonly TaskEntry[]) => readonly TaskEntry[], sections: Readonly<Record<GroupedList, readonly ListSection[]>>, projects: Readonly<Record<GroupedList, ListGrouping>>): SectionOffer {
		const { presets, ungrouped } = this.settings.get().groups;
		const shown = filter([...dayList(doc, date, today, boundary), ...soonWithoutDate(doc), ...inboxList(doc), ...backlogList(doc)]);
		const names = (list: GroupedList) => offeredNames(shownSections(shown.filter((entry) => entry.section === list).map((entry) => entry.group), sections[list]), presets, ungrouped);
		const lists = { now: names("now"), soon: names("soon"), inbox: names("inbox"), backlog: names("backlog") };
		const grouped = GROUPED_LISTS.filter((list) => projects[list].on);
		if (grouped.length === 0) return { lists, ungrouped };
		const byGroup = (list: GroupedList) => Object.fromEntries(Object.entries(groupSectionNames(projects[list])).map(([key, groups]) => [key, offeredNames(groups, presets, ungrouped)]));
		return { lists, ungrouped, projects: Object.fromEntries(grouped.map((list) => [list, byGroup(list)])) };
	}

	listSections({ doc }: Snapshot): Readonly<Record<GroupedList, readonly ListSection[]>> {
		return Object.fromEntries(GROUPED_LISTS.map((list) => [list, sectionsOf(doc, list)])) as Record<GroupedList, readonly ListSection[]>;
	}

	/** A query that finds nothing reads no file. */
	searchRead(query: string, project?: string): Read<readonly SearchGroup[]> {
		return { reads: FuzzyQuery.of(query) !== null, answer: (s) => this.search(s, query, project) };
	}

	/** With `project`, only that project's tasks (and their subtasks). */
	search(s: Snapshot | null, query: string, project?: string): readonly SearchGroup[] {
		const fuzzy = FuzzyQuery.of(query);
		if (!fuzzy || !s) return [];
		const { doc, today } = s;
		const item = this.itemOf(today);
		const ranked: RankedHit[] = [];
		const index = this.index();
		const visit = (entry: TaskEntry): void => {
			const titleText = plainText(entry.task.text);
			const title = fuzzy.match(titleText);
			const markdown = descriptionMarkdown(entry);
			const descriptionText = markdown === null ? "" : plainDescription(markdown);
			const description = descriptionText === "" ? null : fuzzy.matchWords(descriptionText);
			const projectText = entry.project === null || entry.path.length > 0 ? "" : (index.refOf(entry.project)?.name ?? projectName(entry.project));
			const project = projectText === "" ? null : fuzzy.matchWords(projectText);
			if (title || description || project) {
				const hit: SearchHit = {
					item: item(entry),
					title: title ? matchParts(titleText, title.found) : [],
					project: project ? matchParts(projectText, project.found) : null,
					description: description ? snippetParts(descriptionText, description.found) : null,
				};
				ranked.push({ hit, title, description: description ?? project });
			}
			for (const sub of entry.subtasks) if (isOpen(sub.task.status)) visit(sub);
		};
		const groups: SearchGroup[] = [];
		for (const list of SEARCH_ORDER) {
			ranked.length = 0;
			for (const entry of doc.tasks(list)) if (project === undefined || inProject(entry.project, project)) visit(entry);
			if (ranked.length > 0) groups.push({ list, hits: ranked.sort(byQuality).map((r) => r.hit) });
		}
		return groups;
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
		const levels = this.itemLevels(this.scopeAll());
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
		return toItem(entry, today, this.itemLevels(this.scopeAll()), parent, this.rules.moment().boundary);
	}

	/** The task's line in the file once tidied for today, from 0. */
	lineOfRead(key: TaskKey): Read<number> {
		return { reads: true, tidies: true, answer: (s) => this.lineOf(s!.text, key) };
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
		return taskMenu([item], screen.today, this.priorityLevels(), this.labelLevels(), offer, { kind: "task", from }, this.projectNotes());
	}

	bulkMenu(picked: readonly PickedTask[], screen: MenuScreen): TaskMenuModel {
		const offer = menuOffer(picked.map((p) => p.from), screen, (column, date) => this.columnSections(column, date));
		return taskMenu(picked.map((p) => p.item), screen.today, this.priorityLevels(), this.labelLevels(), offer, { kind: "bulk" }, this.projectNotes());
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

	private itemOf(today: LocalDate, scope: Scope = this.scopeAll()): (entry: TaskEntry) => TaskItem {
		const levels = this.itemLevels(scope);
		const { boundary } = this.rules.moment();
		return (entry) => toItem(entry, today, levels, null, boundary);
	}

	private itemLevels(scope: Scope): ItemLevels {
		const settings = this.settings.get();
		const mark = scope.project === null;
		return itemLevels(usableLevels(settings.priorities), usableLabels(settings.labels), (link) => scope.index.refOf(link, mark));
	}

	private index(): ProjectIndex {
		return new ProjectIndex(this.projects.notes());
	}

	private scopeAll(): Scope {
		return { project: null, index: this.index() };
	}

	private today(): LocalDate {
		return this.rules.today();
	}
}
