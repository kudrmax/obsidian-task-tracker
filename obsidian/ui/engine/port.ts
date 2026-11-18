/**
 * The screen's one port (docs/superpowers/specs/2026-11-18-ui-engine.md, «What it is»): what the screen draws, in the
 * engine's own types, shaped by the screen; a subscription to its changes; the writes. Product rules sit behind it (what
 * a drop writes, which place refuses a task, which day a title means): the engine asks and draws the answer. It grows
 * milestone by milestone. The stand serves it with made-up tasks (`MockPort`); part 2 serves it over the core.
 */

/** A list of the funnel the screen shows. */
export type ListId = "inbox" | "backlog" | "soon" | "day";

/** Where the ribbon stands: Inbox–Soon, Soon–Now, Now–calendar. */
export type Place = "inbox" | "soon" | "calendar";

/** How the screen stands: the ribbon of two columns, all columns side by side, the lists stacked as rows, by project. */
export type ViewMode = "twoColumns" | "allColumns" | "rows" | "byProject";

/** A card's colours (`#RRGGBB`): a level's or a label's; several labels' in order. The engine shades them for the theme. */
export interface Paint {
	readonly colors: readonly string[];
}

/** A piece of a title: text, or a link shown by its word. */
export type TitlePart = { readonly kind: "text"; readonly text: string } | { readonly kind: "link"; readonly text: string; readonly target: string };

/** A task as its card draws it. */
export interface Card {
	readonly id: string;
	readonly title: readonly TitlePart[];
	/** A folded task's own title, small over its next step's (`title`); null for a card of one line. */
	readonly over: string | null;
	readonly inProgress: boolean;
	readonly paint: Paint | null;
	/** The folder of its project and the project's name; null without one (or under that project's filter). */
	readonly project: string | null;
	/** Of its subtasks, done out of all; null without any. */
	readonly count: { readonly done: number; readonly total: number } | null;
	readonly description: boolean;
	/** The corner: a due date's day over its month, and the repeat's mark; null when nothing shows. */
	readonly due: { readonly day: string | null; readonly month: string | null; readonly repeats: boolean } | null;
	/** Its subtasks folded away: a card peeks out under it. */
	readonly folded: boolean;
	/** By project: the stage's mark in its corner (in place of the date). */
	readonly stage: "inbox" | "backlog" | "soon" | "now" | null;
}

/** A row of a list: a card at its depth (0 a task, 1 its subtask, …). */
export interface Row {
	readonly id: string;
	readonly depth: number;
}

/** A section of a list: its header (null title: the tasks outside any section), its rows, whether it is empty. */
export interface Section {
	readonly id: string;
	readonly title: string | null;
	readonly header: boolean;
	readonly empty: boolean;
	readonly rows: readonly Row[];
	/** It can be lifted by its header and moved among its list's sections. */
	readonly movable: boolean;
}

/** A list as a column draws it. */
export interface ListView {
	readonly title: string;
	readonly sections: readonly Section[];
	/** The plate of a list that draws no card: «No tasks»; null for none. */
	readonly plate: string | null;
	/** The words of an empty section's plate. */
	readonly emptyLabel: string;
	/** The name of the tasks outside any section. */
	readonly ungrouped: string;
}

/** A timed task of the day's timeline: minutes from the day's start. */
export interface Block {
	readonly id: string;
	readonly start: number;
	readonly end: number | null;
	/** Its time has passed today: it is drawn on the now line. */
	readonly ridesNow: boolean;
	/** The clock's time of its start, as its corner writes it when stacked: «13», «45». */
	readonly time: readonly [string, string];
	/** Its duration as its corner writes it when shorter than a card: «15», «m»; null without one. */
	readonly length: readonly [string, string] | null;
}

/** A calendar's event of the day: minutes from the day's start, its colour. */
export interface DayEvent {
	readonly id: string;
	readonly title: string;
	readonly start: number;
	readonly end: number;
	readonly color: string;
	readonly past: boolean;
}

export interface Day {
	/** Today, Tomorrow, Yesterday or a date. */
	readonly title: string;
	/** The shown day is today: a step back from the calendar goes to Soon–Now, not to yesterday. */
	readonly isToday: boolean;
	readonly blocks: readonly Block[];
	readonly events: readonly DayEvent[];
	readonly allDay: readonly DayEvent[];
	/** The present minute from the day's start on today; null on another day. */
	readonly now: number | null;
	/** The clock's time of the now line: «14:20». */
	readonly nowLabel: string;
	/** Each hour line's label, from the day's start: «05», «06», … */
	readonly hours: readonly string[];
	/** The minute the timeline opens at, and where it stands in the height (0 top, 0.5 the middle). */
	readonly open: { readonly minute: number; readonly fraction: number };
}

/** What the screen shows now. */
export interface Screen {
	/** No tasks file: the screen offers to make one, at this path. */
	readonly missing: string | null;
	readonly mode: ViewMode;
	readonly place: Place;
	readonly lists: Readonly<Record<ListId, ListView>>;
	/** By project: the node's tasks in parts; null in another mode. */
	readonly projects: ListView | null;
	readonly cards: Readonly<Record<string, Card>>;
	readonly day: Day;
	readonly canUndo: boolean;
	/** The device's settings the screen draws by. */
	readonly look: Look;
}

export interface Look {
	readonly cardHeight: number;
	readonly cardGap: number;
	readonly longPressMs: number;
	/** The day list's share of the width beside the timeline, 0..1. */
	readonly listShare: number;
	/** The hour's height on the timeline, px. */
	readonly hourPx: number;
}

/** Where a carried task lands in a list: before task `before` (null: the section's end), in `section`, under `parent` (null: a task). */
export interface ListPlace {
	readonly list: ListId;
	readonly section: string;
	readonly parent: string | null;
	readonly before: string | null;
}

/** Where a carried thing goes: a list's place, a list's title, a time of the shown day's timeline. */
export type Target = { readonly kind: "place"; readonly place: ListPlace } | { readonly kind: "title"; readonly list: ListId } | { readonly kind: "time"; readonly minute: number };

/** What is carried: a task (by id), or a new task (the plus). */
export type Carried = { readonly kind: "task"; readonly id: string } | { readonly kind: "new" };

export interface ScreenPort {
	read(): Screen;
	/** Fires after the screen changed: a write, an edit from outside, another day. Returns the unsubscribe. */
	subscribe(listener: () => void): () => void;

	/** Whether a target takes what is carried: a refused place opens no gap and takes nothing. */
	accepts(carried: Carried, target: ListId | "timeline"): boolean;
	/** Writes a carried task to `target`; resolves once written and read back. */
	drop(id: string, target: Target): Promise<void>;
	/** The screen as it will stand once `drop(id, target)` is written: drawn at once, before the write. */
	preview(id: string, target: Target): Screen;
	/** Moves a section among its list's sections, before `before` (null: last). */
	moveSection(list: ListId, section: string, before: string | null): Promise<void>;

	/** The clock's time of a minute from the day's start, as the timeline writes it: «14:30». */
	timeLabel(minute: number): string;

	setPlace(place: Place): void;
	setMode(mode: ViewMode): void;
	/** Another day, `shift` days on (or back); `null` today. */
	showDay(shift: -1 | 1 | null): void;
	setListShare(share: number): void;
	undo(): Promise<void>;
	createFile(): Promise<void>;
}
