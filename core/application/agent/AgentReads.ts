import {
	type AssistantService,
	type CalendarEvent,
	type CalendarService,
	cardDue,
	type Clock,
	type DayEvents,
	type DayService,
	labelTitle,
	NO_DAY_EVENTS,
	type PriorityLevel,
	type ProjectsNodeId,
	type ProjectsSection,
	repeatSentence,
	type ScreenSettingsStore,
	type SectionKey,
	type TaskItem,
	type TaskService,
	type TaskStatus,
} from "../contracts";
import type { LocalDate, ReminderKind, TaskPlace } from "../contracts";
import {
	AgentError,
	clockTime,
	defined,
	isRef,
	localMoment,
	mapNull,
	present,
	RefBook,
	type WireAll,
	type WireCalendars,
	type WireDay,
	type WireEvents,
	type WireHelp,
	type WireList,
	type WirePart,
	type WireProject,
	type WireProjectAnswer,
	type WireProjects,
	type WireReminder,
	type WireSearch,
	type WireSection,
	type WireStatus,
	type WireStep,
	type WireTask,
	type WireTaskAnswer,
	type WireWeek,
} from "./agentWire";

/** The services the program reads, each the very one the screens read. */
export interface AgentServices {
	readonly tasks: TaskService;
	readonly days: DayService;
	readonly calendars: CalendarService;
	readonly assistant: AssistantService;
	readonly screenSettings: ScreenSettingsStore;
	readonly clock: Clock;
	/** The tasks file as it stands, before the tidy the reads make in memory (null: none). */
	readonly storedTasks: () => Promise<string | null>;
}

/** The screen's project filter as the program is asked for it: a project by name (`--project`), or No project (`--no-project`). */
export interface AgentFilter {
	readonly project?: string;
	readonly noProject?: boolean;
}

/** Which days `week` answers: this week or the next, Monday to Sunday; or `count` days from a day the words name (today when left out). */
export interface WeekAsk {
	readonly which?: string;
	readonly count?: number;
}

const STATUS: Readonly<Record<TaskStatus, WireStatus>> = { todo: "open", inProgress: "inProgress", done: "done", cancelled: "wontDo" };
const REMINDER: Readonly<Record<ReminderKind, WireReminder>> = { live: "lockScreen", notification: "notification", alarm: "alarm", none: "none" };
const SEARCH_LIST: Readonly<Record<SectionKey, "inbox" | "backlog" | "soon" | "today" | "done">> = { inbox: "inbox", backlog: "backlog", soon: "soon", now: "today", done: "done" };
const DAYS_IN_WEEK = 7;
const MOST_DAYS = 62;

const PENDING_NOTE = "This line is not in the file yet: Obsidian writes it when it opens the file today (the day's tidy). Read again after that before editing.";

const PAST_NOTE = "A past day keeps no tasks: what wasn't done moved to today, and the file keeps no date of completion. Its meetings stay.";

/** What each option of the assistant's buttons means for a task carrying the label chosen there. */
const ASSISTANT_LABEL_MEANING: Readonly<Record<string, string>> = {
	label: "Best task puts this label on the one task it picked as worth doing now, and takes it off every other task.",
	skip: "A task with this label is one Max can't take now (waiting on someone, no access, not the season): Best task never sends it, nor anything under it.",
};

/**
 * The program's answers, one method per command (agent CLI spec, «What an agent sees»). Each reads what the screens read
 * through the contract and only maps it into the program's words: it never filters, sorts, groups, dates or places a task.
 */
export class AgentReads {
	/** The refs of the file's tasks, made once the file is read (`needFile`). */
	private book = new RefBook([]);

	constructor(private readonly s: AgentServices) {}

	/** Today as Max sees it at Now–calendar. */
	async today(filter: AgentFilter = {}): Promise<WireDay> {
		await this.needFile();
		return this.dayOf(this.s.days.today(), await this.nodeOf(filter));
	}

	/** The day the words name: `YYYY-MM-DD`, `today`, `tomorrow`, `yesterday`, `+N`, `-N`. */
	async day(words: string, filter: AgentFilter = {}): Promise<WireDay> {
		await this.needFile();
		return this.dayOf(this.dayNamed(words), await this.nodeOf(filter));
	}

	/** This week or the next, Monday to Sunday; or N days (7 by default) from a day, today when none is named. */
	async week(ask: WeekAsk = {}, filter: AgentFilter = {}): Promise<WireWeek> {
		await this.needFile();
		const node = await this.nodeOf(filter);
		const whole = ask.which === "this" || ask.which === "next";
		if (whole && ask.count !== undefined) throw new AgentError("badArgument", "--days goes with a day, not with this or next: a week is Monday to Sunday");
		const count = ask.count ?? DAYS_IN_WEEK;
		if (!Number.isInteger(count) || count < 1 || count > MOST_DAYS) throw new AgentError("badArgument", `--days takes a whole number from 1 to ${MOST_DAYS}`);
		const dates = whole ? this.s.days.week(ask.which as "this" | "next") : this.s.days.days(ask.which === undefined ? this.s.days.today() : this.dayNamed(ask.which), count);
		const days: WireDay[] = [];
		for (const date of dates) days.push(await this.dayOf(date, node));
		return { days };
	}

	soon(filter: AgentFilter = {}): Promise<WireList> {
		return this.list("soon", filter);
	}

	inbox(filter: AgentFilter = {}): Promise<WireList> {
		return this.list("inbox", filter);
	}

	backlog(filter: AgentFilter = {}): Promise<WireList> {
		return this.list("backlog", filter);
	}

	/** Every open task once, flat, in the funnel's order. */
	async all(filter: AgentFilter = {}): Promise<WireAll> {
		await this.needFile();
		const open = await this.s.tasks.openTasks(await this.nodeOf(filter));
		return { tasks: open.map(({ item, place }) => this.wire(item, place)) };
	}

	/** The whole tree: every project with its path, folder or not, its status and note, done projects last, nothing folded away. */
	async projects(): Promise<WireProjects> {
		await this.needFile();
		const view = await this.s.tasks.projectsScreen("all");
		const none = view.rows.find((row) => row.kind === "none");
		return {
			projects: view.rows.flatMap((row) => mapNull(row.project, (project) => [present({ name: project.name, path: project.path, depth: project.path.length - 1, folder: project.folder, status: row.status!, note: project.note }) as WireProject]) ?? []),
			noProject: { openTasks: none !== undefined && !none.muted },
		};
	}

	/** The project By project: its own tasks, then a part per subproject; with `done`, its closed tasks too. */
	async project(name: string, done = false): Promise<WireProjectAnswer> {
		await this.needFile();
		const node = await this.projectNode(name);
		const view = await this.s.tasks.projectsScreen(node);
		const row = view.rows.find((r) => r.node === view.selected);
		const history = done ? await this.s.tasks.projectHistory(node) : [];
		const parts = [...(await this.parts(view.sections, false)), ...(await this.parts(history, true))];
		return { project: { name: view.title, folder: row?.project?.folder ?? false, status: row?.status ?? "waiting" }, parts };
	}

	/** The plugin's search, Done included, best first, each found task with where Max sees it. */
	async search(query: string): Promise<WireSearch> {
		await this.needFile();
		const groups = await this.s.tasks.search(query);
		const found = [];
		for (const group of groups) found.push({ list: SEARCH_LIST[group.list], tasks: await this.placed(group.hits.map((hit) => hit.item)) });
		return { query, groups: found };
	}

	/** One task whole: every subtask at every depth, closed ones too, and where it is stored. */
	async task(ref: string): Promise<WireTaskAnswer> {
		await this.needFile();
		const text = ref.trim();
		if (!isRef(text)) throw new AgentError("unknownTask", "not a task's ref: take one from an answer of the program");
		const key = this.book.keyOf(text);
		const item = key === null ? null : await this.s.tasks.find(key, "");
		if (item === null) throw new AgentError("staleTask", "the task is no longer where the ref says: the file or the day changed, read again");
		const place = await this.s.tasks.placeOf(item);
		const whole = { ...this.wire(item, place), subtasks: this.subtask(item, item.card.step, true, "date" in place ? place.date : undefined).subtasks };
		return { task: present(whole), stored: await this.stored(item) };
	}

	/** Where the task is on disk now: its line before the tidy the reads make in memory. */
	private async stored(item: TaskItem): Promise<WireTaskAnswer["stored"]> {
		const disk = await this.s.storedTasks();
		const line = disk === null ? null : this.s.tasks.storedLine(item, disk);
		if (line !== null) return { section: this.s.tasks.listName(line.section), line: line.raw };
		return { section: this.s.tasks.listName(item.key.section), line: item.key.raw, pending: true, note: PENDING_NOTE };
	}

	/** The commands, the words, and Max's priority levels and labels in their order. */
	async help(): Promise<WireHelp> {
		const page = await this.s.assistant.page();
		const assistantLabels = page.prompts.flatMap((prompt) =>
			prompt.options.flatMap((row) => {
				const means = ASSISTANT_LABEL_MEANING[row.key];
				const chosen = row.choices.find((choice) => choice.value !== null && choice.value === row.value);
				return means === undefined ? [] : [{ action: prompt.title, option: row.label, label: chosen === undefined ? null : chosen.title, means }];
			}),
		);
		return {
			program: "obsidian-task-calendar: Max's tasks as the Task Calendar screen shows them, read only. Every answer is one JSON object; a failure is { error: { code, message, candidates? } } with exit code 1.",
			commands: HELP_COMMANDS,
			options: HELP_OPTIONS,
			places: HELP_PLACES,
			statuses: HELP_STATUSES,
			priorities: this.s.tasks.priorityLevels().map((level, i) => ({ name: level.prefix, rank: i + 1 })),
			labels: this.s.tasks.labelLevels().map((label) => labelTitle(label.name)),
			assistantLabels,
			notes: HELP_NOTES,
		};
	}

	/** The day's answer: its list and timeline (none for a past day), its meetings and the calendars' sources. */
	private async dayOf(date: LocalDate, node: ProjectsNodeId | null): Promise<WireDay> {
		const side = this.s.days.side(date);
		const relation = this.s.days.relation(date);
		const events = await this.eventsOf(date);
		const head = {
			date,
			weekday: this.s.days.weekday(date),
			relation: relation === "other" ? side : relation,
			dayStart: clockTime(this.s.days.boundary().startHour * 60),
			now: side === "today" ? localMoment(this.s.clock.now()) : undefined,
		};
		const meetings = { events: this.events(events), calendars: this.calendars(events) };
		const past = side === "past" ? { past: true as const, note: PAST_NOTE } : {};
		const screen = await this.s.tasks.screen(date, node);
		const list = this.s.tasks.columnView(screen, "day");
		return defined({ ...head, ...past, list: { sections: await this.sections(list.groups) }, timeline: await this.placed(screen.day.slotted, date), ...meetings });
	}

	private async list(list: "soon" | "inbox" | "backlog", filter: AgentFilter): Promise<WireList> {
		await this.needFile();
		const screen = await this.s.tasks.screen(this.s.days.today(), await this.nodeOf(filter));
		return { list, sections: await this.sections(this.s.tasks.columnView(screen, list).groups) };
	}

	private async sections(groups: readonly { readonly name: string | null; readonly items: readonly TaskItem[] }[]): Promise<WireSection[]> {
		const sections: WireSection[] = [];
		for (const group of groups) sections.push({ name: group.name, tasks: await this.placed(group.items) });
		return sections;
	}

	private async parts(sections: readonly ProjectsSection[], done: boolean): Promise<WirePart[]> {
		const parts: WirePart[] = [];
		for (const section of sections) {
			const kind = done ? "done" : section.header ? "subproject" : "own";
			parts.push(defined({ kind, title: section.title, path: section.path, tasks: await this.placed(section.cards.map((card) => card.item)) }) as WirePart);
		}
		return parts;
	}

	/** Tasks with where Max sees each (`placeOf`); `ridesOn`, the day whose timeline they are drawn on. */
	private async placed(items: readonly TaskItem[], ridesOn?: LocalDate): Promise<WireTask[]> {
		const tasks: WireTask[] = [];
		for (const item of items) tasks.push(this.wire(item, await this.s.tasks.placeOf(item), ridesOn));
		return tasks;
	}

	/** A task in the program's words, at its place. */
	private wire(item: TaskItem, place: TaskPlace, ridesOn?: LocalDate): WireTask {
		const date = "date" in place ? place.date : null;
		const step = item.card.step;
		const { ref, title, status, ...own } = this.subtask(item, step, false, ridesOn ?? date ?? undefined, true);
		return present({
			ref,
			title,
			status,
			place: place.kind,
			date,
			due: cardDue(item, date)?.date,
			...own,
			projects: item.projects.map((project) => project.name),
			nextStep: mapNull(step, (s): WireStep => ({ ref: this.book.refOf(s.key), title: s.title, path: pathTo(item.subtasks, s.id) })),
		}) as WireTask;
	}

	/**
	 * A task's own fields, a subtask's all of them: `step`, the open subtask its card shows; `all`, closed subtasks too;
	 * `top`, a task, whose section it names (a subtask stands in its task's).
	 */
	private subtask(item: TaskItem, step: TaskItem | null, all: boolean, ridesOn?: LocalDate, top = false): WireTask {
		const levels = this.s.tasks.priorityLevels();
		const subs = all ? item.allSubtasks : item.subtasks;
		return present({
			ref: this.book.refOf(item.key),
			title: item.title,
			status: STATUS[item.status],
			time: mapNull(item.slot, (slot) =>
				defined({
					start: clockTime(slot.start),
					end: mapNull(slot.end, clockTime),
					startsAt: `${slot.date}T${clockTime(slot.start)}`,
					durationMin: item.durationMin,
					passed: this.s.tasks.ridesNow(item, ridesOn ?? slot.date),
				}),
			),
			reminder: mapNull(item.slot, () => REMINDER[item.reminder]),
			section: top ? item.group : null,
			priority: mapNull(item.priority, (level) => ({ name: level.prefix, rank: rankOf(levels, level) })),
			labels: item.labels.map((label) => labelTitle(label.name)),
			repeat: mapNull(item.repeat, repeatSentence),
			description: item.description,
			progress: item.progress,
			collapsed: item.collapsed,
			subtasks: subs.map((sub) => present({ ...this.subtask(sub, step, all, ridesOn), next: mapNull(step, (s) => s.id === sub.id) })),
		}) as WireTask;
	}

	private events(day: DayEvents): WireEvents {
		const timed = (e: CalendarEvent) => ({
			title: e.title,
			start: clockTime(e.start.getHours() * 60 + e.start.getMinutes()),
			end: clockTime(e.end.getHours() * 60 + e.end.getMinutes()),
			startsAt: localMoment(e.start),
			endsAt: localMoment(e.end),
			calendar: e.calendar,
			passed: this.s.calendars.isPast(e),
		});
		return { allDay: day.allDay.map((e) => ({ title: e.title, calendar: e.calendar })), timed: day.timed.map(timed) };
	}

	private calendars(day: DayEvents): WireCalendars {
		return { alert: day.alert, sources: day.statuses.map((s) => ({ source: s.source, tone: s.tone, words: s.words.sub, ...(s.words.time === "" ? {} : { updated: s.words.time }) })) };
	}

	/** The day's meetings: in a fresh run nothing is cached, so the files are read now; Google is never asked. */
	private async eventsOf(date: LocalDate): Promise<DayEvents> {
		const ask = this.s.calendars.events(date, "open");
		return ask.fresh ? ask.fresh() : (ask.cached ?? NO_DAY_EVENTS);
	}

	private dayNamed(words: string): LocalDate {
		const date = this.s.days.dayNamed(words);
		if (date === null) throw new AgentError("badArgument", `not a day: ${JSON.stringify(words)}; give YYYY-MM-DD, today, tomorrow, yesterday, +N or -N`);
		return date;
	}

	private async nodeOf(filter: AgentFilter): Promise<ProjectsNodeId | null> {
		if (filter.project !== undefined && filter.noProject) throw new AgentError("badArgument", "--project and --no-project together");
		if (filter.noProject) return "none";
		return filter.project === undefined ? null : this.projectNode(filter.project);
	}

	private async projectNode(name: string): Promise<ProjectsNodeId> {
		const match = await this.s.tasks.projectNodeNamed(name);
		if (match.node === null) throw new AgentError("unknownProject", `no project named ${JSON.stringify(name)}`, match.candidates);
		return match.node;
	}

	/** The tasks file is there: without it, every command says so (an empty file is no error). */
	private async needFile(): Promise<void> {
		const screen = await this.s.tasks.screen(this.s.days.today());
		if (screen.missing) throw new AgentError("tasksFileMissing", `no tasks file at ${JSON.stringify(this.s.screenSettings.get().tasksFile)} in the vault`);
		const open = (await this.s.tasks.openTasks()).map((t) => t.item);
		this.book = new RefBook(everyTask([...open, ...screen.done]).map((item) => item.key));
	}
}

/** Every task and subtask of these, at every depth, closed ones too. */
function everyTask(items: readonly TaskItem[]): TaskItem[] {
	return items.flatMap((item) => [item, ...everyTask(item.allSubtasks)]);
}

/** A level's place in the settings' order, 1 the highest. */
function rankOf(levels: readonly PriorityLevel[], level: PriorityLevel): number {
	return levels.findIndex((l) => l.prefix === level.prefix) + 1;
}

/** The titles from below a task down to its subtask `id`, that one last; none when it is not among them. */
function pathTo(subtasks: readonly TaskItem[], id: string): string[] {
	for (const sub of subtasks) {
		if (sub.id === id) return [sub.title];
		const below = pathTo(sub.subtasks, id);
		if (below.length > 0) return [sub.title, ...below];
	}
	return [];
}

const HELP_COMMANDS: WireHelp["commands"] = [
	{ command: "today", answers: "the day as Max sees it at Now–calendar: the day's list in its sections, the timeline, the day's meetings" },
	{ command: "day <date>", answers: "the same for one day; <date>: YYYY-MM-DD, today, tomorrow, yesterday, +N, -N" },
	{ command: "week [this | next | <date>] [--days N]", answers: "day for each day: this / next = Monday to Sunday of this / next week (no --days); a date = N days from it (7 by default); nothing = 7 days from today" },
	{ command: "soon", answers: "the Soon column in its sections" },
	{ command: "inbox", answers: "Inbox in its sections" },
	{ command: "backlog", answers: "Backlog in its sections" },
	{ command: "all", answers: "every open task exactly once, flat, in funnel order: Inbox, Backlog, Soon, today, then later days by date" },
	{ command: "projects", answers: "the whole tree: every project with its path, folder or not, status, attached note" },
	{ command: "project <name> [--no-subprojects] [--done]", answers: "the project By project, exactly as the Projects screen orders it: its own tasks, then a part per subproject; in a part Inbox, Backlog, Soon (dated ones among them), Now, file order inside; each task with its place; --done: also its history, the closed tasks" },
	{ command: "search <text>", answers: "the plugin's search, Done included, best first" },
	{ command: "task <ref>", answers: "one task whole: description, every subtask at every depth (closed ones too), where it is stored" },
	{ command: "help", answers: "this" },
];

const HELP_OPTIONS: WireHelp["options"] = [
	{ option: "--vault <path>", means: "the vault, ~/Obsidian by default; the tasks file and calendars are found from the plugin's settings there" },
	{ option: "--project <name>", means: "on today, day, week, soon, inbox, backlog, all: the screen's project filter, subprojects included; an unknown name is unknownProject with the closest names" },
	{ option: "--no-subprojects", means: "with --project or project: the project's own tasks alone" },
	{ option: "--no-project", means: "the panel's No project: the tasks without a project" },
	{ option: "--pretty", means: "indented JSON" },
];

const HELP_PLACES: WireHelp["places"] = [
	{ place: "inbox", means: "Inbox" },
	{ place: "backlog", means: "Backlog" },
	{ place: "soon", means: "the Soon column: tasks without a date" },
	{ place: "today", means: "today's list or timeline (the screen's header says Today)" },
	{ place: "day", means: "a later day, given in date: Max sees the task only in that day's column, never in Soon; say «на четверг», not «в Soon»" },
	{ place: "done", means: "Done" },
];

const HELP_STATUSES: WireHelp["statuses"] = [
	{ status: "open", means: "to do" },
	{ status: "inProgress", means: "in progress" },
	{ status: "done", means: "done" },
	{ status: "wontDo", means: "given up (Won't do)" },
];

const HELP_NOTES: readonly string[] = [
	"date is the day the task stands on: its slot's day, else today for Now, else its due date; due is its due date, only when it differs. A date is a plan, not a deadline: nothing is overdue.",
	"A task with a due date and a slot on another day shows on both days, as the screen shows it: in the due day's list and on the slot day's timeline (date is the slot's day in both), so week lists it twice.",
	"time.startsAt is the full moment: a day runs from dayStart to dayStart next morning, so a slot after midnight belongs to the night before. time.passed: the task rides the now line (an open task of today whose start has passed).",
	"A folded task (collapsed) shows its nextStep on its card and its timeline block, the task's own title small above it; Done closes the step. subtasks lists the open subtasks, the step marked next.",
	"A ref names a task for task <ref>; refs go stale when the file or the day changes: read again.",
	"Never parse the tasks file to read: ask the program. Writing is by docs/plugin/agents.md's recipes; task <ref>'s stored is for that only.",
];
