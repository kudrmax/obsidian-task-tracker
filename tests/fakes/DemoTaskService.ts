import { type ColumnSections, DESCRIPTION_TEMPLATE, type DropColumn, type DaySpan, type DayView, type DraftMarks, type ResizeEdge, type StretchSpan, type CreatedTask, type DroppedTask, type DropFrom, type DropLanding, type DropOrigin, type DropPreview, type DropTo, type EndList, type FullTree, type GroupedList, type ListSection, type NewTaskPlace, type Placement, type RepeatRule, type ScreenView, type SearchGroup, type SectionKey, type SectionOffer, StaleTaskError, type TaskDraft, type TaskItem, type TaskKey, type TaskMenuModel, type TaskService, type MenuFrom, type MenuScreen, type MenuStatusId, type PickedTask, type ProjectsView, type ProjectsDropPreview, type FunnelView, type ViewChoice } from "../../core/application/contracts";
import { carriedWith, menuOffer, taskMenu, tileStatus, toggledPriority } from "../../core/application/menus";
import type { Clock } from "../../core/application/ports";
import { dropMoves, readDrop } from "../../core/application/drops";
import { snapMinute } from "../../core/application/snapGrid";
import { dayMonth } from "../../core/application/dayLabels";
import { keyId } from "../../core/application/taskKeys";
import { NO_SECTION_ID } from "../../core/application/sections";
import { fullTree } from "../../core/application/fullTree";
import { droppedSpan, TimelineSpans } from "../../core/application/TimelineSpans";
import { DayBoundary } from "../../core/domain/DayBoundary";
import { ProjectTree } from "../../core/domain/ProjectTree";
import { projectsView } from "../../core/application/projectsScreen";
import { firstViewOf, viewChoice } from "../../core/application/viewModes";
import { canPostpone, canRemoveDue, type DayColumn, dayColumn, dayOfPlacement, dayOfTask, placementOfDay, type TaskScreen, taskScreen } from "../../core/domain/Days";
import { typedMarks } from "../../core/domain/Marks";
import { draftMarksOf, markColors } from "../../core/application/marks";
import { isBlankTitle, priorityOfText, withPriority } from "../../core/domain/Priority";
import { FuzzyQuery, matchParts } from "../../core/domain/search";
import { canRemind } from "../../core/domain/Task";
import { plainText } from "../../core/domain/TaskText";
import { DEFAULT_SETTINGS, type LabelLevel, type PriorityLevel, usableLevels } from "../../core/settings";
import type { LocalDate, Slot, TaskStatus } from "../../obsidian/ui/types";

/** The demo's column titles: the default list names, the day's its own. */
const demoTitle = (list: "inbox" | "backlog" | "soon" | "day"): string | null => (list === "day" ? null : DEFAULT_SETTINGS.sections[list]);

interface DemoTask {
	text: string;
	status: TaskStatus;
	dueDate: LocalDate | null;
	slot: Slot | null;
	priority: string | null;
	repeat?: RepeatRule | null;
	description?: string | null;
}

const DEMO_DATE = "2026-10-30";
const STATUS_CHAR: Record<TaskStatus, string> = { todo: " ", inProgress: "/", done: "x", cancelled: "-" };

const task = (text: string, extra: Partial<DemoTask> = {}): DemoTask => ({ text, status: "todo", dueDate: null, slot: null, priority: null, ...extra });
const slot = (start: number, end: number | null = null): Slot => ({ date: DEMO_DATE, start: start * 60, end: end === null ? null : end * 60 });

const two = (n: number) => String(n).padStart(2, "0");
const time = (m: number) => `${two(Math.floor(m / 60))}:${two(m % 60)}`;
const localDateOf = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

/** The board's tasks, in memory: the same seven on the list, four on the timeline, eight in Soon, six in Inbox, four in Backlog. */
export class DemoTaskService implements TaskService {
	private sections: Record<SectionKey, DemoTask[]> = {
		inbox: [
			task("Узнать про курсы итальянского"),
			task("Идея подарка на Новый год"),
			task("Ответить Лёше про поход"),
			task("Посмотреть «Дюну 2»"),
			task("Почитать про налоговое резидентство"),
			task("Сменить тариф мобильной связи"),
		],
		backlog: [
			task("Выучить японский"),
			task("Сделать сайт-портфолио"),
			task("Съездить в Грузию"),
			task("Пройти курс по Rust"),
		],
		now: [
			task("Созвониться с врачом"),
			task("Купить билеты в Белград", { dueDate: "2026-11-03" }),
			task("Сдать налоговую декларацию", { dueDate: "2026-10-30" }),
			task("Записаться в барбершоп", { status: "inProgress", dueDate: "2026-11-02" }),
			task("Посмотреть доклад про local-first приложения", { status: "inProgress" }),
			task("Чай масала"),
			task("Позвонить маме"),
			task("Написать отчёт по проекту", { status: "inProgress", slot: slot(11, 12) }),
			task("Разобрать почту", { slot: slot(14) }),
			task("Подготовить вопросы к планированию", { slot: slot(16) }),
			task("Заказать продукты", { slot: slot(17) }),
		],
		soon: [
			task("Продлить страховку"),
			task("Купить подарок Ане"),
			task("Разобрать фото с поездки", { status: "inProgress" }),
			task("Записаться к стоматологу"),
			task("Починить велосипед"),
			task("Прочитать Deep Work"),
			task("Заменить фильтр для воды"),
			task("Настроить бэкап ноутбука"),
		],
		done: [],
	};
	private readonly day = this.sections.now.filter((t) => t.slot);
	private exists = true;
	private readonly listeners = new Set<() => void>();

	/** `boundary`: where the screen's day begins, by which its cards stand on the timeline. */
	constructor(
		private readonly clock: Clock,
		private readonly boundary: () => DayBoundary = () => DayBoundary.MIDNIGHT,
	) {}

	/** The demo's tasks carry no labels. */
	labelLevels(): readonly LabelLevel[] {
		return [];
	}

	async setLabels(): Promise<null> {
		return null;
	}

	async setLabelsAll(steps: readonly unknown[]): Promise<readonly null[]> {
		return steps.map(() => null);
	}

	priorityLevels(): readonly PriorityLevel[] {
		return usableLevels(DEFAULT_SETTINGS.priorities);
	}

	parseTitle(text: string): { readonly text: string; readonly priority: PriorityLevel | null } {
		const parsed = priorityOfText(text, this.prefixes());
		return { text: parsed.text, priority: this.priorityLevels().find((l) => l.prefix === parsed.priority) ?? null };
	}

	draftMarks(text: string, priority: string | null, labels: readonly string[]): DraftMarks {
		return draftMarksOf(typedMarks(text, priority, labels, this.prefixes()), this.priorityLevels(), this.labelLevels());
	}

	isBlank(text: string): boolean {
		return isBlankTitle(text, this.prefixes());
	}

	withPriority(text: string, prefix: string | null): string {
		return withPriority(text, prefix, this.prefixes());
	}

	private prefixes(): readonly string[] {
		return this.priorityLevels().map((l) => l.prefix);
	}

	/** The timeline boards lay tasks of their own on the day; the pixel comparison swaps them in, and null brings the day's back. */
	showTimeline(tasks: readonly { text: string; start: number; end: number | null; inProgress?: boolean }[] | null): void {
		const slotted = tasks?.map((t) => task(t.text, { status: t.inProgress ? "inProgress" : "todo", slot: { date: DEMO_DATE, start: t.start, end: t.end } })) ?? this.day;
		this.sections.now = [...this.sections.now.filter((t) => !t.slot), ...slotted];
		this.changed();
	}

	private today(): LocalDate {
		return localDateOf(this.clock.now());
	}

	private raw(t: DemoTask): string {
		const due = t.dueDate ? ` 📅 ${t.dueDate}` : "";
		const s = t.slot ? ` ⏰ ${t.slot.date} ${time(t.slot.start)}${t.slot.end === null ? "" : `-${time(t.slot.end)}`}` : "";
		return `- [${STATUS_CHAR[t.status]}] ${t.priority ? `${t.priority} ` : ""}${t.text}${due}${s}`;
	}

	private item(section: SectionKey, index: number): TaskItem {
		const t = this.sections[section][index];
		const key = { section, index, path: [], raw: this.raw(t) };
		return {
			id: keyId(key),
			key,
			text: t.text,
			title: plainText(t.text),
			status: t.status,
			dueDate: t.dueDate,
			slot: t.slot,
			durationMin: t.slot && t.slot.end !== null ? t.slot.end - t.slot.start : null,
			reminder: "notification",
			repeat: t.repeat ?? null,
			open: t.status === "todo" || t.status === "inProgress",
			repeatable: section !== "done" && (t.status === "todo" || t.status === "inProgress"),
			priority: DEFAULT_SETTINGS.priorities.find((l) => l.prefix === t.priority) ?? null,
			labels: [],
			colors: markColors(DEFAULT_SETTINGS.priorities.find((l) => l.prefix === t.priority) ?? null, []),
			subtasks: [],
			allSubtasks: [],
			progress: null,
			collapsed: false,
			parentText: null,
			parentKey: null,
			description: t.description ?? null,
			group: null,
			project: null,
			projects: [],
			list: section,
			isSubtask: false,
			day: dayOfTask(section, t, this.today()),
			repeatDay: t.dueDate ?? t.slot?.date ?? this.today(),
			can: { postpone: canPostpone(section), removeDue: canRemoveDue(t.dueDate, this.today()), remind: canRemind(t.slot), setPriority: true, setLabels: t.priority == null, stop: (t.repeat ?? null) !== null && section !== "done" && (t.status === "todo" || t.status === "inProgress"), addDescription: (t.description ?? null) === null, fold: false, resize: t.slot != null, setProject: true },
			drawnOn: null,
			card: { text: t.text, title: plainText(t.text), over: null, step: null },
			block: { text: t.text, title: plainText(t.text), step: null },
		};
	}

	private items(section: SectionKey): TaskItem[] {
		return this.sections[section].map((_, i) => this.item(section, i));
	}

	private taskOf(key: TaskKey): DemoTask {
		const t = this.sections[key.section][key.index];
		if (!t || this.raw(t) !== key.raw) throw new StaleTaskError();
		return t;
	}

	private take(key: TaskKey): DemoTask {
		const t = this.taskOf(key);
		this.sections[key.section].splice(key.index, 1);
		return t;
	}

	private changed(): void {
		for (const listener of this.listeners) listener();
	}

	async screen(date: LocalDate): Promise<ScreenView> {
		await this.normalize();
		const [day, soon, inbox, backlog, done, sections, offer] = await Promise.all([this.dayView(date), this.soonWithoutDateView(), this.inboxView(), this.backlogView(), this.doneView(), this.listSections(), this.sectionOffer()]);
		return { day, soon, inbox, backlog, done, sections, offer, missing: false, calendars: true, projectTree: [], titleDrops: { day: { kind: "list", column: "day", before: null }, soon: { kind: "title", list: "soon", date: null }, inbox: { kind: "title", list: "inbox", date: null }, backlog: { kind: "title", list: "backlog", date: null } } };
	}

	async dayView(date: LocalDate): Promise<DayView> {
		const all = [...this.items("now"), ...this.items("soon")];
		const slottedOn = (t: TaskItem) => t.slot?.date === date;
		const list = date === this.today()
			? all.filter((t) => !slottedOn(t) && (t.key.section === "now" || t.dueDate === date))
			: all.filter((t) => !slottedOn(t) && t.dueDate === date);
		return { date, list, slotted: all.filter(slottedOn) };
	}

	async soonWithoutDateView(): Promise<readonly TaskItem[]> {
		return this.items("soon").filter((t) => !t.dueDate && !t.slot);
	}

	async inboxView(): Promise<readonly TaskItem[]> {
		return this.items("inbox");
	}

	async backlogView(): Promise<readonly TaskItem[]> {
		return this.items("backlog");
	}

	/** The demo keeps no sections: a list with tasks is No section alone. */
	async listSections(): Promise<Readonly<Record<GroupedList, readonly ListSection[]>>> {
		const groups = (list: GroupedList): readonly ListSection[] => (this.sections[list].length > 0 ? [{ id: NO_SECTION_ID, name: null, empty: false }] : []);
		return { inbox: groups("inbox"), backlog: groups("backlog"), now: groups("now"), soon: groups("soon") };
	}

	async doneView(): Promise<readonly TaskItem[]> {
		return this.items("done");
	}

	/** The board's tasks have no descriptions: the search looks at titles. */
	async search(query: string): Promise<readonly SearchGroup[]> {
		const fuzzy = FuzzyQuery.of(query);
		if (!fuzzy) return [];
		const sections: readonly SectionKey[] = ["inbox", "backlog", "soon", "now", "done"];
		return sections.flatMap((list) => {
			const hits = this.items(list).flatMap((item) => {
				const found = fuzzy.match(item.text);
				return found ? [{ item, title: matchParts(item.text, found.found), project: null, projectPath: null, description: null }] : [];
			});
			return hits.length > 0 ? [{ list, hits }] : [];
		});
	}

	/** The board's tasks have no subtasks: each shows where it stands. */
	async screenOf(item: TaskItem): Promise<TaskScreen> {
		return taskScreen(item.list, item.day);
	}

	async reveal(item: TaskItem): Promise<TaskScreen> {
		return this.screenOf(item);
	}

	findIn(items: readonly TaskItem[], key: TaskKey): TaskItem | null {
		for (const item of items) {
			if (item.key.section === key.section && item.key.index === key.index && item.key.path.join() === key.path.join()) return item;
			const inner = this.findIn(item.subtasks, key);
			if (inner) return inner;
		}
		return null;
	}

	columnSections(column: DropColumn, date: LocalDate): ColumnSections | null {
		if (column !== "day") return { list: column, date: null };
		const { list, date: day, sections } = this.dayColumn(date);
		return sections ? { list, date: day } : null;
	}

	/** The board's tasks have no subtasks, and the pixel comparison makes none. */
	async createSubtask(): Promise<void> {}

	async nest(): Promise<void> {}

	async createInList(date: LocalDate, text: string): Promise<void> {
		if (!text.trim()) return;
		this.sections[date === this.today() ? "now" : "soon"].push(task(text.trim(), { dueDate: date }));
		this.changed();
	}

	async createInSoon(text: string): Promise<void> {
		if (!text.trim()) return;
		this.sections.soon.push(task(text.trim()));
		this.changed();
	}

	async createInPlace(text: string, priority: string | null, place: NewTaskPlace, repeat: RepeatRule | null = null): Promise<TaskKey | null> {
		if (!text.trim()) return null;
		const added = task(text.trim(), { priority, repeat });
		if (place.kind === "slot") {
			added.slot = place.slot;
			this.sections[place.slot.date === this.today() ? "now" : "soon"].push(added);
		} else if (place.kind === "list" || place.kind === "day") {
			const { list: target, date } = place.kind === "day" ? this.listOfDay(place.date) : { list: place.list, date: place.date };
			if (target === "now") added.dueDate = date ?? this.today();
			else if (target === "soon" && date && date > this.today()) added.dueDate = date;
			const list = this.sections[target];
			const at = place.before && place.before.section === target ? place.before.index : list.length;
			list.splice(at, 0, added);
		}
		this.changed();
		return this.keyOf(added);
	}

	private listOfDay(day: LocalDate): { readonly list: "now" | "soon"; readonly date: LocalDate | undefined } {
		const { list, date } = this.dayColumn(day);
		return { list, date: date ?? undefined };
	}

	private keyOf(t: DemoTask): TaskKey | null {
		for (const section of Object.keys(this.sections) as SectionKey[]) {
			const index = this.sections[section].indexOf(t);
			if (index >= 0) return this.item(section, index).key;
		}
		return null;
	}

	async createAtTime(date: LocalDate, start: number, text: string): Promise<void> {
		if (!text.trim()) return;
		this.sections[date === this.today() ? "now" : "soon"].push(task(text.trim(), { slot: { date, start, end: null } }));
		this.changed();
	}

	dayColumn(date: LocalDate): DayColumn {
		return dayColumn(date, this.today());
	}

	placementOfDay(date: LocalDate): Placement {
		return placementOfDay(date, this.today());
	}

	listName(list: SectionKey): string {
		return DEFAULT_SETTINGS.sections[list];
	}

	placementTitle(placement: Placement): string {
		return placement.kind === "date" ? dayMonth(placement.date) : this.listName(placement.kind);
	}

	dayOfPlacement(placement: Placement): LocalDate | null {
		return dayOfPlacement(placement, this.today());
	}

	placementOf(item: TaskItem): Placement {
		if (item.dueDate === this.today()) return { kind: "now" };
		if (item.dueDate) return { kind: "date", date: item.dueDate };
		if (item.key.section === "inbox" || item.key.section === "backlog") return { kind: item.key.section };
		return { kind: item.key.section === "soon" ? "soon" : "now" };
	}

	private place(t: DemoTask, placement: Placement): void {
		if (placement.kind === "date") {
			t.dueDate = placement.date;
			this.sections[placement.date <= this.today() ? "now" : "soon"].push(t);
		} else {
			t.dueDate = placement.kind === "now" ? this.today() : null;
			if (placement.kind === "inbox" || placement.kind === "backlog") t.slot = null;
			this.sections[placement.kind].push(t);
		}
	}

	async create(draft: TaskDraft, slot?: Slot): Promise<void> {
		if (!draft.text.trim()) return;
		this.place(task(draft.text.trim(), { slot: slot ?? null, priority: draft.priority, repeat: draft.repeat ?? null }), draft.placement);
		this.changed();
	}

	async edit(key: TaskKey, draft: TaskDraft): Promise<TaskItem | null> {
		const t = this.taskOf(key);
		t.text = draft.text.trim() || t.text;
		t.priority = draft.priority;
		if (draft.repeat !== undefined) t.repeat = draft.repeat;
		const current = this.placementOf(this.item(key.section, key.index));
		if (JSON.stringify(current) !== JSON.stringify(draft.placement)) this.place(this.take(key), draft.placement);
		this.changed();
		return null;
	}

	async setStatus(key: TaskKey, status: TaskStatus): Promise<void> {
		if (status === "done" || status === "cancelled") {
			const t = this.take(key);
			t.status = status;
			this.sections.done.unshift(t);
		} else this.taskOf(key).status = status;
		this.changed();
	}

	async setDueDate(key: TaskKey, date: LocalDate | null): Promise<void> {
		this.taskOf(key).dueDate = date;
		this.changed();
	}

	/** The demo keeps no reminder kinds: every task on a time reminds with a notification. */
	async setReminder(): Promise<void> {}

	async setCollapsed(): Promise<void> {}

	async toggleCollapsed(): Promise<void> {}

	/** The board has no projects. */
	async setProject(): Promise<void> {}

	async newProject(): Promise<null> {
		return null;
	}

	async toggleProject(): Promise<readonly null[]> {
		return [];
	}

	projects(): readonly [] {
		return [];
	}

	async unfoldProjectNode(): Promise<void> {}

	async hoverProjectNode(): Promise<void> {}

	async projectsScreen(): Promise<ProjectsView> {
		return projectsView({ doc: null, tree: ProjectTree.EMPTY, today: this.today(), boundary: DayBoundary.MIDNIGHT, state: {}, item: () => { throw new Error("The board has no projects"); }, listName: (list) => list });
	}

	async funnelView(wide: boolean): Promise<FunnelView> {
		return { filter: null, view: viewChoice({}, { node: null, closed: false, wide, note: false, title: demoTitle }), panel: { rows: (await this.projectsScreen()).rows.map((row) => ({ ...row, selected: false })), open: false, reason: null, docked: wide, dimCloses: false, missing: true }, plus: { tap: "newTask", list: "funnel", tree: false }, topRow: wide, searchPaths: false, place: "calendar" };
	}

	async projectNoteView(): Promise<null> {
		return null;
	}

	firstView(wide: boolean, note: boolean): ViewChoice {
		return firstViewOf({}, wide, note, demoTitle);
	}

	async filterHides(): Promise<boolean> {
		return false;
	}

	async pickProjectNode(): Promise<void> {}

	async startCarry(): Promise<void> {}

	async carryAt(): Promise<{ readonly wait: null }> {
		return { wait: null };
	}

	async carryOnNode(): Promise<void> {}

	async endCarry(): Promise<void> {}

	async endProjectName(): Promise<void> {}

	async setFunnelPlace(): Promise<void> {}

	firstPlace(): "calendar" {
		return "calendar";
	}

	async clearProjectFilter(): Promise<void> {}

	async setProjectsPanel(): Promise<void> {}

	async setViewMode(): Promise<void> {}

	async setNoteViewMode(): Promise<void> {}

	async dropTasksOnProject(): Promise<void> {}

	async tapProjectNode(): Promise<void> {}

	async selectProjectNode(): Promise<void> {}

	async setProjectsMode(): Promise<void> {}

	async createProject(): Promise<null> {
		return null;
	}

	async moveProject(): Promise<void> {}

	async renameProject(): Promise<boolean> {
		return false;
	}

	async setProjectFolder(): Promise<boolean> {
		return false;
	}
	async setProjectNote(): Promise<void> {}

	async dropOnProject(): Promise<void> {}

	async deleteProject(): Promise<void> {}

	async dropInProjects(): Promise<readonly TaskKey[]> {
		return [];
	}

	async projectsDropPreview(): Promise<ProjectsDropPreview> {
		return { landings: [], view: await this.projectsScreen(), tasks: "" };
	}

	isBlankProjectName(name: string): boolean {
		return name.trim() === "";
	}

	snap(minute: number, hourPx: number, tolerancePx: number): number {
		return snapMinute(minute, hourPx, tolerancePx);
	}

	async unfoldAbove(): Promise<void> {}

	async setPriority(key: TaskKey, priority: string | null): Promise<void> {
		this.taskOf(key).priority = priority;
		this.changed();
	}

	async togglePriority(keys: readonly TaskKey[], prefix: string): Promise<void> {
		const priority = toggledPriority(keys.map((key) => this.item(key.section, key.index)), prefix);
		for (const key of keys) this.taskOf(key).priority = priority;
		this.changed();
	}

	async toggleLabel(keys: readonly TaskKey[]): Promise<readonly (TaskItem | null)[]> {
		return keys.map((key) => this.item(key.section, key.index));
	}

	async removeDue(keys: readonly TaskKey[]): Promise<void> {
		for (const key of keys) if (this.item(key.section, key.index).can.removeDue) this.taskOf(key).dueDate = null;
		this.changed();
	}

	menu(item: TaskItem, from: MenuFrom, screen: MenuScreen): TaskMenuModel {
		const offer = menuOffer([from], screen, (column, date) => this.columnSections(column, date));
		return taskMenu([item], screen.today, this.priorityLevels(), this.labelLevels(), offer, { kind: "task", from });
	}

	bulkMenu(picked: readonly PickedTask[], screen: MenuScreen): TaskMenuModel {
		const offer = menuOffer(picked.map((p) => p.from), screen, (column, date) => this.columnSections(column, date));
		return taskMenu(picked.map((p) => p.item), screen.today, this.priorityLevels(), this.labelLevels(), offer, { kind: "bulk" });
	}

	/** Last in the file first, so a task taken out moves none still to come. */
	private async eachKey(keys: readonly TaskKey[], act: (key: TaskKey) => Promise<void>): Promise<void> {
		for (const key of [...keys].sort((a, b) => b.index - a.index)) await act(key);
	}

	async pickStatus(keys: readonly TaskKey[], id: MenuStatusId): Promise<void> {
		const status = tileStatus(id);
		await this.eachKey(keys, (key) => (status === null ? this.stop(key) : this.setStatus(key, status)));
	}

	async postponeAll(keys: readonly TaskKey[], date: LocalDate): Promise<void> {
		const can = keys.filter((key) => this.item(key.section, key.index).can.postpone);
		await this.eachKey(can, (key) => this.postpone(key, date));
	}

	async removeAll(keys: readonly TaskKey[]): Promise<void> {
		await this.eachKey(keys, (key) => this.remove(key));
	}

	carried(lifted: TaskKey, picked: readonly TaskKey[]): readonly TaskKey[] {
		return carriedWith(lifted, picked);
	}

	async setRepeat(key: TaskKey, rule: RepeatRule | null): Promise<void> {
		this.taskOf(key).repeat = rule;
		this.changed();
	}

	async stop(key: TaskKey): Promise<void> {
		const t = this.take(key);
		t.repeat = null;
		t.status = "done";
		this.sections.done.unshift(t);
		this.changed();
	}

	async setDescription(key: TaskKey, markdown: string): Promise<void> {
		this.taskOf(key).description = markdown.trim() === "" || markdown.trim() === DESCRIPTION_TEMPLATE.trim() ? null : markdown;
		this.changed();
	}

	async toggleDone(key: TaskKey): Promise<void> {
		const t = this.taskOf(key);
		await this.setStatus(key, t.status === "todo" || t.status === "inProgress" ? "done" : "todo");
	}

	async rename(key: TaskKey, text: string): Promise<TaskItem | null> {
		const title = text.trim();
		const t = this.taskOf(key);
		if (this.isBlank(title) || title === t.text) return null;
		t.text = title;
		this.changed();
		return this.item(key.section, key.index);
	}

	fullTree(item: TaskItem): FullTree {
		return fullTree(item);
	}

	async remove(key: TaskKey): Promise<void> {
		this.take(key);
		this.changed();
	}

	async lineOf(key: TaskKey): Promise<number> {
		this.taskOf(key);
		return key.index;
	}

	async find(key: TaskKey, text: string): Promise<TaskItem | null> {
		const tasks = this.sections[key.section];
		const at = tasks[key.index];
		if (!at || (this.raw(at) !== key.raw && at.text !== text)) return null;
		return this.item(key.section, key.index);
	}

	async moveBefore(key: TaskKey, before: TaskKey | null, date: LocalDate): Promise<void> {
		if (before) this.taskOf(before);
		const t = this.take(key);
		if (!before) this.sections[date === this.today() ? "now" : "soon"].push(t);
		else {
			const shift = before.section === key.section && before.index > key.index ? 1 : 0;
			this.sections[before.section].splice(before.index - shift, 0, t);
		}
		this.changed();
	}

	shownSpan(item: TaskItem, day: LocalDate): DaySpan {
		return this.timeline().shown({ slot: item.slot!, open: item.open }, day);
	}

	stretch(item: TaskItem, day: LocalDate, edge: ResizeEdge, minute: number): StretchSpan {
		return this.timeline().stretched({ slot: item.slot!, open: item.open }, day, edge, minute);
	}

	async resize(key: TaskKey, day: LocalDate, edge: ResizeEdge, minute: number, minDurationMin: number): Promise<boolean> {
		const t = this.taskOf(key);
		const next = t.slot && this.timeline().resized({ slot: t.slot, open: t.status === "todo" || t.status === "inProgress" }, day, edge, minute, minDurationMin);
		if (!next) return false;
		await this.setSlot(key, next);
		return true;
	}

	dropSpan(item: TaskItem | null, from: DropOrigin, start: number): DaySpan {
		return droppedSpan(start, from === "timeline" ? (item?.durationMin ?? null) : null);
	}

	newSlot(day: LocalDate, start: number): Slot {
		return this.boundary().slotAt(day, droppedSpan(start, null).start, null);
	}

	async toTime(key: TaskKey, from: DropFrom, start: number, day: LocalDate): Promise<void> {
		const { slot } = this.taskOf(key);
		const span = droppedSpan(start, from === "timeline" && slot && slot.end !== null ? slot.end - slot.start : null);
		await this.setSlot(key, this.boundary().slotAt(day, span.start, span.end));
	}

	private timeline(): TimelineSpans {
		return new TimelineSpans(this.boundary(), this.clock.now());
	}

	async setSlot(key: TaskKey, slot: Slot): Promise<void> {
		const t = this.taskOf(key);
		t.slot = slot;
		if (key.section === "now" && slot.date !== this.today()) {
			this.sections.now.splice(key.index, 1);
			this.sections.soon.push(t);
		}
		this.changed();
	}

	async clearSlot(key: TaskKey, place?: { readonly before: TaskKey | null; readonly date: LocalDate }): Promise<void> {
		const t = this.taskOf(key);
		if (place) await this.moveBefore(key, place.before, place.date);
		t.slot = null;
		this.changed();
	}

	async moveToList(key: TaskKey, date: LocalDate): Promise<void> {
		this.taskOf(key).dueDate = date;
		if (date === this.today()) this.sections.now.push(this.take(key));
		this.changed();
	}

	async moveToSoon(key: TaskKey, date: LocalDate): Promise<void> {
		this.taskOf(key).dueDate = null;
		if (date === this.today()) this.sections.soon.push(this.take(key));
		this.changed();
	}

	async postpone(key: TaskKey, date: LocalDate): Promise<void> {
		const t = this.take(key);
		t.dueDate = date;
		t.slot = null;
		this.sections[date <= this.today() ? "now" : "soon"].push(t);
		this.changed();
	}

	/** The demo keeps no sections: its menus offer the presets. */
	async sectionOffer(): Promise<SectionOffer> {
		const { presets, ungrouped } = DEFAULT_SETTINGS.groups;
		const names = presets.filter((preset) => preset !== ungrouped);
		return { lists: { now: names, soon: names, inbox: names, backlog: names }, ungrouped };
	}

	async toSection(): Promise<void> {}

	async moveToGroup(): Promise<void> {}

	async createGroup(): Promise<void> {}

	async moveGroup(): Promise<void> {}

	async renameGroup(): Promise<boolean> {
		return false;
	}

	async removeGroup(): Promise<void> {}

	async createSection(): Promise<null> {
		return null;
	}
	async applyAll(): Promise<void> {}

	async drop(tasks: readonly DroppedTask[], to: DropTo, day: LocalDate): Promise<readonly TaskKey[]> {
		const moved = tasks.map((t) => this.taskOf(t.key));
		await this.move(tasks, to, day);
		return moved.flatMap((t) => this.keyOf(t) ?? []);
	}

	async createWithId(text: string, priority: string | null, place: NewTaskPlace, repeat?: RepeatRule | null): Promise<CreatedTask | null> {
		const key = await this.createInPlace(text, priority, place, repeat);
		return key && { key, id: keyId(key) };
	}

	/** The demo keeps no file to try a drop over: each task lands away, where the screen finds it after the drop. */
	async landing(tasks: readonly DroppedTask[]): Promise<readonly DropLanding[]> {
		return tasks.map((t) => ({ kind: "away", id: keyId(t.key), item: null }));
	}

	/** The demo keeps no file to try a drop over: its tasks land away, and the screen is the one it shows now. */
	async dropPreview(tasks: readonly DroppedTask[], _to: DropTo, day: LocalDate): Promise<DropPreview> {
		return { landings: await this.landing(tasks), screen: await this.screen(day), tasks: "" };
	}

	private move(tasks: readonly DroppedTask[], to: DropTo, day: LocalDate): Promise<void> {
		const moves = dropMoves(tasks, readDrop(to, (column) => this.columnSections(column, day)), day);
		if (moves.kind === "many") return this.applyAll();
		const { key, move } = moves;
		switch (move.kind) {
			case "toTime":
				return this.toTime(key, move.from, move.start, move.day);
			case "clearSlot":
				return this.clearSlot(key, move.place);
			case "moveToGroup":
				return this.moveToGroup();
			case "nest":
				return this.nest();
			case "moveBefore":
				return this.moveBefore(key, move.before, move.date);
			case "moveToList":
				return this.moveToList(key, move.date);
			case "moveToSoon":
				return this.moveToSoon(key, move.date);
			case "moveToEnd":
				return this.moveToEnd(key, move.section);
		}
	}

	async moveToEnd(key: TaskKey, section: EndList): Promise<void> {
		const t = this.take(key);
		if (section !== "soon") {
			t.dueDate = null;
			t.slot = null;
		}
		this.sections[section].push(t);
		this.changed();
	}

	async normalize(): Promise<void> {}

	async createFile(): Promise<void> {
		this.exists = true;
		this.changed();
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	get fileExists(): boolean {
		return this.exists;
	}
}
