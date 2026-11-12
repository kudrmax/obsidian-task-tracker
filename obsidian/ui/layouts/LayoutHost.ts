import type { DropColumn, FunnelAt, ProjectsView, TaskItem, ViewChoice } from "../../../core/application/contracts";
import type { GestureArbiter } from "../gestures";
import type { ProjectsListDrop } from "../projects/ProjectDrops";
import type { ProjectTasks } from "../projects/ProjectTasks";
import type { ScreenTrack } from "../ScreenPager";
import type { Place, Shift } from "../screens";
import type { RightMode } from "../viewSettings";
import type { LocalDate } from "../types";
import type { FunnelListDeps } from "./FunnelLists";

/** The parts every layout shares, which a layout only places: the day's title with its arrows, and the timeline's column. */
export interface SharedParts {
	readonly nav: HTMLElement;
	/** The day's title: a place to drop on the day's list. */
	readonly dayTitle: HTMLElement;
	readonly timeline: HTMLElement;
	/** `nav` into `navIn`, the timeline into `timelineIn`, its scroll kept; with no parent given, each back on the screen where the ribbon places it. */
	place(navIn: HTMLElement | null, timelineIn: HTMLElement | null): void;
}

/** What the ribbon asks of the screen to walk its places and turn its days. */
export interface RibbonHost {
	/** Where the ribbon stands: Done while the search keeps it there, else the core's place. */
	place(): Place;
	day(): LocalDate;
	stepFunnel(from: FunnelAt, shift: Shift): FunnelAt | null;
	/** Another day `shift`'s way: the day's list and the timeline turn. */
	dayTrack(day: LocalDate, shift: Shift): ScreenTrack;
	/** A swipe has brought the strip to `place`. */
	arrive(place: Place): void;
	/** The wheel follows the strip under the finger. */
	follow(position: number): void;
	/** Done's cards, and their gestures. */
	done(): readonly TaskItem[];
	doneCard(card: HTMLElement, item: TaskItem, signal: AbortSignal): void;
}

/** What a layout reads of the screen. */
export interface LayoutHost {
	readonly root: HTMLElement;
	readonly shared: SharedParts;
	readonly lists: FunnelListDeps;
	readonly ribbon: RibbonHost;
	readonly arbiter: GestureArbiter;
	/** A list's name as the tasks file heads it; the day's list is named by the day. */
	listName(column: DropColumn | "done"): string;
	dayName(): string;
	view(): ViewChoice;
	/** The divider's saved share, and saving a new one. */
	share(): number;
	saveShare(share: number): void;
	/** The width the layout stands in: the view's, less the docked panel's. */
	stageWidth(): number;
	/** The by project list and its place to drop, built in `area`. */
	projectsList(area: HTMLElement): { readonly list: ProjectTasks; readonly drop: ProjectsListDrop };
	/** The node's tasks by project, read with the lists in the by project mode. */
	projectsView(): ProjectsView | null;
	tap(): void;
}

export type { RightMode };
