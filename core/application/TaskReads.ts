import { dayMonth } from "./dayLabels";
import { GROUPED_LISTS } from "../domain/Lists";
import type { DayBoundary } from "../domain/DayBoundary";
import { dayColumn, dayOfPlacement, dayOfTask, placementOfDay, type TaskScreen, taskScreen } from "../domain/Days";
import { typedMarks } from "../domain/Marks";
import { priorityOfTitle, withPriority } from "../domain/Priority";
import { backlogList, dayList, inboxList, slottedOn, soonWithoutDate } from "../domain/queries";
import { FuzzyQuery, lettersApart, matchParts, plainDescription, snippetParts, type TextMatch } from "../domain/search";
import { plainText } from "../domain/TaskText";
import { isOpen, type LocalDate, type SectionKey, type Slot } from "../domain/Task";
import { descriptionMarkdown } from "../domain/description";
import { flatten, type TaskDocument, type TaskEntry } from "../domain/TaskDocument";
import { type LabelLevel, type PriorityLevel, usableLabels, usableLevels } from "../settings";
import type {
	StoredLine,
	ColumnList,
	ColumnSource,
	PlacedTask,
	ProjectNodeMatch,
	ProjectsSection,
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
import { listView, NO_SECTION_ID, offeredNames, type SectionOffer, shownSections } from "./sections";
import { funnelRank, placeOfTask, type TaskPlace } from "./taskPlaces";
import { samePlace } from "./taskKeys";
import { fullTree } from "./fullTree";
import { type ItemLevels, itemLevels, ownCard, toItem } from "./taskItems";
import type { TaskRules } from "./TaskRules";
import { droppedSpan, type ResizeEdge, type SlottedTask, type StretchSpan, TimelineSpans } from "./TimelineSpans";
import type { Clock, SettingsStore } from "./ports";
import { ProjectIndex, projectTreeOf } from "./projects";
import type { DropTo, FunnelView, ProjectFilter, ProjectNote, ProjectRef, ProjectsNodeId, ProjectsScreenState, ProjectsView } from "./contracts";
import { ProjectTree } from "../domain/ProjectTree";
import { chosenNode, filterNode, nodeHeader, panelRows, projectHistory, PROJECTS_WORDS, projectNodeOf, projectOfNode, projectsView, subprojectsOn } from "./projectsScreen";
import { filterTest, hasSubprojects, noteProject } from "./projectFilter";
import { firstViewOf, viewChoice } from "./viewModes";
import { panelReason } from "./projectsCarry";
import { funnelPlaceOf } from "./screenPlaces";
import type { ListedTasks } from "./assistant/tasks";
import type { PlusChoice, ViewChoice, ViewMode } from "./contracts";

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

/**
 * What the reads know of projects besides the file they read: the tree of the file read last (for a menu, which reads
 * none), and what this device keeps of the Projects screen.
 */
export interface ProjectSource {
	tree(): ProjectTree;
	screen(): ProjectsScreenState;
}

const NO_PROJECT_SOURCE: ProjectSource = { tree: () => ProjectTree.EMPTY, screen: () => ({}) };

/** The notes that were projects, which the one move to projects attaches: a host's `Projects` port. */
export type LegacyNotes = () => readonly ProjectNote[];

/** A list's sections with a heading or tasks, in file order; an empty one is a heading over no task. */
function sectionsOf(doc: TaskDocument, list: GroupedList): readonly ListSection[] {
	return doc
		.groups(list)
		.filter((g) => g.heading || g.entries.length > 0)
		.map((g) => ({ id: g.name === null || g.id === null ? NO_SECTION_ID : g.id, name: g.name, empty: g.name !== null && g.entries.length === 0 }));
}

/** The lists of open tasks, in the order the funnel walks them before it sorts them by place. */
const OPEN_ORDER: readonly SectionKey[] = ["inbox", "backlog", "now", "soon"];

/** The most names an unknown project's answer offers instead. */
const MOST_CANDIDATES = 5;
/** A name is a typo of a project's while this many letters apart, or one in four of a long name's. */
const MOST_TYPOS = 2;
const TYPO_SHARE = 4;

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
		private readonly source: ProjectSource = NO_PROJECT_SOURCE,
	) {}

	/** The projects of the tree read last, in its order: the Project page and the quick entry's Project button. */
	projects(): readonly ProjectRef[] {
		return new ProjectIndex(this.source.tree()).known();
	}

	/** The Projects screen as this device shows it, or `node`'s by project; without a file, the tree's fixed rows alone. */
	projectsScreenRead(node?: ProjectsNodeId): Read<ProjectsView> {
		return { reads: true, tidies: true, missing: () => this.projectsScreen(null, node), answer: (s) => this.projectsScreen(s, node) };
	}

	projectsScreen(s: Snapshot | null, node?: ProjectsNodeId): ProjectsView {
		const tree = s ? projectTreeOf(s.doc) : ProjectTree.EMPTY;
		const levels = this.itemLevels(new ProjectIndex(tree), false);
		const today = s?.today ?? this.today();
		const boundary = s?.boundary ?? this.rules.moment().boundary;
		return projectsView({
			doc: s?.doc ?? null,
			tree,
			today,
			boundary,
			state: this.source.screen(),
			item: (entry) => toItem(entry, today, levels, null, boundary),
			listName: (list) => this.listName(list),
			...(node !== undefined && { node }),
		});
	}

	/** The funnel's view as this device shows it; without a file, no filter and the panel's fixed rows. */
	funnelViewRead(wide: boolean): Read<FunnelView> {
		return { reads: true, tidies: true, missing: () => this.funnelView(null, wide), answer: (s) => this.funnelView(s, wide) };
	}

	funnelView(s: Snapshot | null, wide: boolean): FunnelView {
		const state = this.source.screen();
		const tree = s ? projectTreeOf(s.doc) : ProjectTree.EMPTY;
		const node = chosenNode(state, tree);
		const filter = node === null ? null : this.filterOf(node, tree, s?.doc ?? null, true);
		const closed = node !== null && nodeHeader(node, tree, s?.doc ?? null).closed;
		const view = viewChoice(state, { node, closed, wide, note: false, title: this.columnTitle, branches: hasSubprojects(node, tree, s?.doc ?? null) });
		const reason = panelReason(state);
		return {
			filter,
			view,
			panel: { rows: panelRows(tree, s?.doc ?? null, state), open: reason !== null, reason, docked: wide, dimCloses: reason === "button" && !wide, missing: s === null },
			plus: plusOf(view.mode, reason !== null),
			topRow: node !== null || view.mode !== "twoColumns",
			searchPaths: filter !== null,
			place: funnelPlaceOf(state.place),
		};
	}

	/** The block at the end of the note at `path`: null for a note no project has, and without a file. */
	projectNoteViewRead(path: string, wide: boolean): Read<FunnelView | null> {
		return { reads: true, tidies: true, missing: () => null, answer: (s) => this.projectNoteView(s!, path, wide) };
	}

	projectNoteView(s: Snapshot, path: string, wide: boolean): FunnelView | null {
		const tree = projectTreeOf(s.doc);
		const name = noteProject(path, tree);
		if (name === null) return null;
		const node = projectNodeOf(name);
		const closed = nodeHeader(node, tree, s.doc).closed;
		const view = viewChoice(this.source.screen(), { node, closed, wide, note: true, title: this.columnTitle, branches: hasSubprojects(node, tree, s.doc) });
		return { filter: this.filterOf(node, tree, s.doc, false), view, panel: null, plus: plusOf(view.mode, false), topRow: false, searchPaths: true, place: funnelPlaceOf(this.source.screen().place) };
	}

	/** The view before the first read: the device's state alone (`firstViewOf`). */
	firstView(wide: boolean, note: boolean): ViewChoice {
		const state = this.source.screen();
		return firstViewOf(state, wide, note, this.columnTitle, hasSubprojects(state.selected, this.source.tree(), null));
	}

	/** The device's Subprojects setting (`subprojectsOn`): what every filtered read and write goes by. */
	subprojects(): boolean {
		return subprojectsOn(this.source.screen());
	}

	/** Whether `filter` hides `item`'s task from the screen: a subtask goes by its top task. */
	filterHidesRead(item: TaskItem, filter: ProjectsNodeId | null): Read<boolean> {
		return { reads: filter !== null, tidies: true, missing: () => false, answer: (s) => (s ? this.filterHides(s, item, filter) : false) };
	}

	filterHides({ doc }: Snapshot, item: TaskItem, filter: ProjectsNodeId | null): boolean {
		const tree = projectTreeOf(doc);
		const node = filterNode(filter, tree);
		const entry = this.rules.named(doc, item.key) ?? doc.find(item.key.section, item.key.index, item.key.path);
		if (node === null || !entry) return false;
		const top = entry.path.length === 0 ? entry : doc.find(entry.section, entry.index, []);
		return top !== undefined && !filterTest(node, tree, doc, this.subprojects())(top);
	}

	private filterOf(node: ProjectsNodeId, tree: ProjectTree, doc: TaskDocument | null, clearable: boolean): ProjectFilter {
		const { title, menu, project } = nodeHeader(node, tree, doc);
		return { node, title, menu, clearable, project, emptyLabel: PROJECTS_WORDS.noTasks };
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

	/** The screen of `date`, under `filter`: the file tidied for today first; without a file, the empty screen. */
	screenRead(date: LocalDate, filter?: ProjectsNodeId | null): Read<ScreenView> {
		return { reads: true, tidies: true, missing: () => this.missingScreen(date), answer: (s) => this.screen(s!, date, filter) };
	}

	/** The screen of `date`, only the tasks `filter` lets through (`TaskService.screen`). */
	screen(s: Snapshot, date: LocalDate, filter?: ProjectsNodeId | null): ScreenView {
		const { doc, today, boundary } = s;
		const { shows, item } = this.filtered(s, filter);
		const shown = (entries: readonly TaskEntry[]) => entries.filter(shows).map(item);
		const day = { date, list: shown(dayList(doc, date, today, boundary)), slotted: shown(slottedOn(doc, date, boundary)) };
		const sections = this.listSections(s);
		const view = { soon: shown(soonWithoutDate(doc)), inbox: shown(inboxList(doc)), backlog: shown(backlogList(doc)) };
		return {
			day,
			...view,
			done: shown(doc.tasks("done")),
			sections,
			offer: this.offerOf(s, date, sections),
			missing: false,
			calendars: true,
			projectTree: new ProjectIndex(projectTreeOf(doc)).known(),
			titleDrops: this.titleDrops(date),
		};
	}

	/** What a drop on each column's title means: into its list; a day without sections, its end. */
	private titleDrops(date: LocalDate): Readonly<Record<DropColumn, DropTo>> {
		const title = (list: GroupedList, day: LocalDate | null): DropTo => ({ kind: "title", list, date: day });
		const day = this.columnSections("day", date);
		return {
			day: day ? title(day.list, day.date) : { kind: "list", column: "day", before: null },
			soon: title("soon", null),
			inbox: title("inbox", null),
			backlog: title("backlog", null),
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
			projectTree: [],
			titleDrops: this.titleDrops(date),
		};
	}

	/** The day's list and timeline, only the tasks `filter` lets through: `screen(s, date, filter).day`. */
	dayView(s: Snapshot, date: LocalDate, filter?: ProjectsNodeId | null): DayView {
		return this.screen(s, date, filter).day;
	}

	/** Every task of each list, each with its subtasks, Today's and Soon's columns as `screen` draws them on today, and today, the file tidied first: what the assistant reads. No file: everything empty. */
	listedRead(): Read<ListedTasks> {
		const lists = (of: (key: SectionKey) => readonly TaskItem[]) => Object.fromEntries(SEARCH_ORDER.map((key) => [key, of(key)])) as Record<SectionKey, readonly TaskItem[]>;
		return {
			reads: true,
			tidies: true,
			missing: () => ({ today: this.today(), lists: lists(() => []), columns: { today: [], soon: [] } }),
			answer: (s) => {
				const item = this.itemOf(s!.today, s!.doc);
				const screen = this.screen(s!, s!.today);
				const columns = { today: [...screen.day.list, ...screen.day.slotted], soon: screen.soon };
				return { today: s!.today, lists: lists((key) => s!.doc.tasks(key).map(item)), columns };
			},
		};
	}

	soonWithoutDateView({ doc, today }: Snapshot): readonly TaskItem[] {
		return soonWithoutDate(doc).map(this.itemOf(today, doc));
	}

	inboxView({ doc, today }: Snapshot): readonly TaskItem[] {
		return inboxList(doc).map(this.itemOf(today, doc));
	}

	backlogView({ doc, today }: Snapshot): readonly TaskItem[] {
		return backlogList(doc).map(this.itemOf(today, doc));
	}

	doneView({ doc, today }: Snapshot): readonly TaskItem[] {
		return doc.tasks("done").map(this.itemOf(today, doc));
	}

	sectionOffer(s: Snapshot, date: LocalDate): SectionOffer {
		return this.screen(s, date).offer;
	}

	/** The sections the menus offer on the screen. */
	private offerOf({ doc, today, boundary }: Snapshot, date: LocalDate, sections: Readonly<Record<GroupedList, readonly ListSection[]>>): SectionOffer {
		const { presets, ungrouped } = this.settings.get().groups;
		const shown = [...dayList(doc, date, today, boundary), ...soonWithoutDate(doc), ...inboxList(doc), ...backlogList(doc)];
		const names = (list: GroupedList) => offeredNames(shownSections(shown.filter((entry) => entry.section === list).map((entry) => entry.group), sections[list]), presets, ungrouped);
		return { lists: { now: names("now"), soon: names("soon"), inbox: names("inbox"), backlog: names("backlog") }, ungrouped };
	}

	listSections({ doc }: Snapshot): Readonly<Record<GroupedList, readonly ListSection[]>> {
		return Object.fromEntries(GROUPED_LISTS.map((list) => [list, sectionsOf(doc, list)])) as Record<GroupedList, readonly ListSection[]>;
	}

	/** A query that finds nothing reads no file. */
	searchRead(query: string): Read<readonly SearchGroup[]> {
		return { reads: FuzzyQuery.of(query) !== null, answer: (s) => this.search(s, query) };
	}

	/** Every task the query finds, each with its project's path. */
	search(s: Snapshot | null, query: string): readonly SearchGroup[] {
		const fuzzy = FuzzyQuery.of(query);
		if (!fuzzy || !s) return [];
		const { doc, today } = s;
		const item = this.itemOf(today, doc);
		const ranked: RankedHit[] = [];
		const visit = (entry: TaskEntry): void => {
			const titleText = plainText(entry.task.text);
			const title = fuzzy.match(titleText);
			const markdown = descriptionMarkdown(entry);
			const descriptionText = markdown === null ? "" : plainDescription(markdown);
			const description = descriptionText === "" ? null : fuzzy.matchWords(descriptionText);
			const found = item(entry);
			const named = entry.path.length > 0 ? [] : found.projects.map((p) => ({ text: p.name, match: fuzzy.matchWords(p.name) }));
			const hitProject = named.find((p) => p.match !== null) ?? null;
			const projectText = hitProject?.text ?? "";
			const project = hitProject?.match ?? null;
			if (title || description || project) {
				const hit: SearchHit = {
					item: { ...found, card: ownCard(found) },
					title: title ? matchParts(titleText, title.found) : [],
					project: project ? matchParts(projectText, project.found) : null,
					projectPath: found.project?.path ?? null,
					description: description ? snippetParts(descriptionText, description.found) : null,
				};
				ranked.push({ hit, title, description: description ?? project });
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

	screenOf({ doc, today, boundary }: Snapshot, item: TaskItem): TaskScreen {
		const top = item.isSubtask ? doc.find(item.key.section, item.key.index, []) : undefined;
		return top ? taskScreen(top.section, dayOfTask(top.section, top.task, today, boundary)) : taskScreen(item.list, item.day);
	}

	findIn(items: readonly TaskItem[], key: TaskKey): TaskItem | null {
		for (const item of items) {
			if (key.id !== undefined && item.id !== undefined ? item.id === key.id : samePlace(item.key, key)) return item;
			const inner = this.findIn(item.subtasks, key);
			if (inner) return inner;
		}
		return null;
	}

	find({ doc, today }: Snapshot, key: TaskKey, text: string): TaskItem | null {
		const named = this.rules.named(doc, key);
		if (named !== undefined) return named ? this.itemAt(doc, named, today) : null;
		const atPlace = doc.find(key.section, key.index, key.path);
		const alike = flatten(doc.allTasks()).filter((entry) => entry.raw === key.raw);
		const entry = atPlace?.raw === key.raw ? atPlace : alike.length === 1 ? alike[0] : atPlace?.task.text === text ? atPlace : undefined;
		return entry ? this.itemAt(doc, entry, today) : null;
	}

	/** The tasks the keys name as the file has them, in their order; throws StaleTaskError when one is gone. */
	itemsAt({ doc, today, boundary }: Snapshot, keys: readonly TaskKey[]): readonly TaskItem[] {
		const levels = this.itemLevels(new ProjectIndex(projectTreeOf(doc)));
		return keys.map((key) => {
			const entry = this.rules.entryOf(doc, key);
			const parent = key.path.length > 0 ? (doc.find(key.section, key.index, key.path.slice(0, -1)) ?? null) : null;
			return toItem(entry, today, levels, parent, boundary);
		});
	}

	/** The task at `place` in `doc` as the UI sees it, with the task it sits under; null when none stands there. */
	itemAt(doc: TaskDocument, place: Pick<TaskKey, "section" | "index" | "path">, today: LocalDate): TaskItem | null {
		const entry = doc.find(place.section, place.index, place.path);
		if (!entry) return null;
		const parent = place.path.length > 0 ? (doc.find(place.section, place.index, place.path.slice(0, -1)) ?? null) : null;
		return toItem(entry, today, this.itemLevels(new ProjectIndex(projectTreeOf(doc))), parent, this.rules.moment().boundary);
	}

	/** The task's line in the file once tidied for today, from 0. */
	lineOfRead(key: TaskKey): Read<number> {
		return { reads: true, tidies: true, answer: (s) => this.lineOf(s!.text, key) };
	}

	/** Where the task stands in `text` as it is, untidied: the line its id has there (`TaskService.storedLine`). */
	storedLine(item: TaskItem, text: string): StoredLine | null {
		const doc = this.rules.parse(text);
		const entry = flatten(doc.allTasks()).find((e) => e.id === item.id);
		return entry ? { section: entry.section, line: doc.lineOf(entry), raw: entry.raw } : null;
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

	/** The list `column` of `screen` draws: its tasks as the screen read them, in the sections it shows on the screen's day. */
	columnView(screen: ColumnSource, column: DropColumn): ColumnList {
		const sections = this.columnSections(column, screen.day.date);
		const items = column === "day" ? screen.day.list : screen[column];
		return { sections, ...listView(items, sections !== null, sections ? screen.sections[sections.list] : []) };
	}

	/** Where Max sees the task, a subtask's its task's (`placeOfTask`), as the screens and By project's stage mark say it. */
	placeOf({ doc, today, boundary }: Snapshot, item: TaskItem): TaskPlace {
		const top = item.isSubtask ? doc.find(item.key.section, item.key.index, []) : undefined;
		if (top) return placeOfTask(top.section, top.task, isOpen(top.task.status), today, boundary);
		return placeOfTask(item.list, item, item.open, today, boundary);
	}

	/** A block of `day`'s timeline rides the now line. */
	ridesNow(item: TaskItem, day: LocalDate): boolean {
		return this.timeline().ridesNow(slotted(item), day);
	}

	/**
	 * The node of the project `name` names; none with the closest names: those the search's match finds, best first, then
	 * those a typo or two apart (`lettersApart`), nearest first.
	 */
	projectNodeNamed({ doc }: Snapshot, name: string): ProjectNodeMatch {
		const tree = projectTreeOf(doc);
		const found = tree.find(name);
		if (found) return { node: projectNodeOf(found.node.name), candidates: [] };
		const query = FuzzyQuery.of(name);
		const names = tree.all().map((p) => p.node.name);
		const matched = query === null ? [] : names.map((n) => ({ name: n, match: query.match(n) })).filter((s) => s.match !== null);
		const fuzzy = matched.sort((a, b) => b.match!.score - a.match!.score).map((s) => s.name);
		const typos = names
			.map((n) => ({ name: n, apart: lettersApart(name, n) }))
			.filter((t) => t.apart <= Math.max(MOST_TYPOS, Math.floor(name.length / TYPO_SHARE)) && !fuzzy.includes(t.name))
			.sort((a, b) => a.apart - b.apart)
			.map((t) => t.name);
		return { node: null, candidates: [...fuzzy, ...typos].slice(0, MOST_CANDIDATES) };
	}

	/** Every open task once, under `filter`, in the funnel's order, each with its place. */
	openTasksRead(filter?: ProjectsNodeId | null): Read<readonly PlacedTask[]> {
		return { reads: true, tidies: true, missing: () => [], answer: (s) => this.openTasks(s!, filter) };
	}

	openTasks(s: Snapshot, filter?: ProjectsNodeId | null): readonly PlacedTask[] {
		const { doc, today, boundary } = s;
		const { shows, item } = this.filtered(s, filter);
		const open = OPEN_ORDER.flatMap((list) => doc.tasks(list)).filter((entry) => isOpen(entry.task.status) && shows(entry));
		const placed = open.map((entry) => ({ item: item(entry), place: placeOfTask(entry.section, entry.task, true, today, boundary) }));
		return placed.map((p, i) => ({ p, i, rank: funnelRank(p.place) })).sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : a.i - b.i)).map(({ p }) => p);
	}

	/** A live project's closed tasks By project; none for a done project or a name the tree lacks. */
	projectHistoryRead(node: ProjectsNodeId): Read<readonly ProjectsSection[]> {
		return { reads: true, tidies: true, missing: () => [], answer: (s) => this.projectHistory(s!, node) };
	}

	projectHistory(s: Snapshot, node: ProjectsNodeId): readonly ProjectsSection[] {
		const { doc, today, boundary } = s;
		const tree = projectTreeOf(doc);
		const levels = this.itemLevels(new ProjectIndex(tree), false);
		return projectHistory({ doc, tree, today, boundary, state: this.source.screen(), item: (entry) => toItem(entry, today, levels, null, boundary), listName: (list) => this.listName(list), node }, node);
	}

	/** A funnel list's column title: its name; the day's list draws the day's own. */
	private readonly columnTitle = (list: DropColumn): string | null => (list === "day" ? null : this.listName(list));

	listName(list: SectionKey): string {
		return this.settings.get().sections[list];
	}

	placementTitle(placement: Placement): string {
		return placement.kind === "date" ? dayMonth(placement.date) : this.listName(placement.kind);
	}

	dayOfPlacement(placement: Placement): LocalDate | null {
		return dayOfPlacement(placement, this.today());
	}

	menu(item: TaskItem, from: MenuFrom, screen: MenuScreen): TaskMenuModel {
		const offer = menuOffer([from], screen, (column, date) => this.columnSections(column, date));
		return taskMenu([item], screen.today, this.priorityLevels(), this.labelLevels(), offer, { kind: "task", from }, this.projectChoices(screen));
	}

	bulkMenu(picked: readonly PickedTask[], screen: MenuScreen): TaskMenuModel {
		const offer = menuOffer(picked.map((p) => p.from), screen, (column, date) => this.columnSections(column, date));
		return taskMenu(picked.map((p) => p.item), screen.today, this.priorityLevels(), this.labelLevels(), offer, { kind: "bulk" }, this.projectChoices(screen), picked.map((p) => p.from));
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

	/**
	 * What a read under `filter` shows (`TaskService.screen`'s filter): which tasks the node lets through, a subtask with its
	 * task, and how each is drawn, without the folder mark under a project.
	 */
	private filtered({ doc, today }: Snapshot, filter?: ProjectsNodeId | null): { readonly shows: (entry: TaskEntry) => boolean; readonly item: (entry: TaskEntry) => TaskItem } {
		const tree = projectTreeOf(doc);
		const node = filterNode(filter, tree);
		const shows = node === null ? () => true : filterTest(node, tree, doc, this.subprojects());
		return { shows, item: this.itemOf(today, doc, node === null || projectOfNode(node) === null) };
	}

	/** The item of a task of `doc`, its subtasks below it, its projects as `doc`'s tree has them; `mark`, the card shows the folder mark. */
	private itemOf(today: LocalDate, doc: TaskDocument, mark = true): (entry: TaskEntry) => TaskItem {
		const levels = this.itemLevels(new ProjectIndex(projectTreeOf(doc)), mark);
		const { boundary } = this.rules.moment();
		return (entry) => toItem(entry, today, levels, null, boundary);
	}

	private itemLevels(index: ProjectIndex, mark = true): ItemLevels {
		const settings = this.settings.get();
		return itemLevels(usableLevels(settings.priorities), usableLabels(settings.labels), (name) => index.refOf(name, mark)!);
	}

	/** The projects the Project page offers, each with its depth: the screen's when it gives them, else the tree read last. */
	private projectChoices(screen?: MenuScreen): readonly { readonly project: ProjectRef; readonly depth: number }[] {
		const known = screen?.projects ?? new ProjectIndex(this.source.tree()).known();
		return known.map((project) => ({ project, depth: project.path.length - 1 }));
	}

	private today(): LocalDate {
		return this.rules.today();
	}
}

/** What the plus does in `mode`, the panel showing or not (`PlusChoice`). */
function plusOf(mode: ViewMode, panel: boolean): PlusChoice {
	if (mode !== "byProject") return { tap: "newTask", list: "funnel", tree: panel };
	return { tap: "inPlace", list: panel ? null : "projects", tree: panel };
}
