import type { ViewLayout, ViewMode } from "../../../core/application/contracts";
import type { ListDrop } from "../drag/ListDrop";
import type { ListColumn } from "../drag/DropTarget";
import type { ProjectsListDrop } from "../projects/ProjectDrops";
import type { ProjectTasks } from "../projects/ProjectTasks";
import type { ScreenTrack } from "../ScreenPager";
import type { Place, Shift } from "../screens";
import type { TaskList } from "../TaskList";

/**
 * How a drawing comes in: `move` the same context changed (cards slide, grow in, fold away); `replace` another context
 * (another filter, mode, the first read): drawn still in place, nothing moves in from elsewhere (spec decision 52).
 */
export type LayoutMotion = "move" | "replace";

/** Why a layout keeps its rows' heights as they stand: a card or the plus carried, a task typed. */
export type LayoutHold = "carry" | "typing";

/** A place a layout's list offers a carried card or the plus. */
export type LayoutDrop = ListDrop | ProjectsListDrop;

/**
 * One view mode on the screen (`ViewChoice.layout`): its own elements and CSS, its lists and the places they offer. The
 * screen holds exactly one; another mode destroys it and mounts the next. The timeline, the day's title, the wheel and
 * the bottom row are the screen's: a layout only places them.
 */
export interface ModeLayout {
	readonly mode: ViewMode;
	/** The core's answer this layout stands by (its columns, swipe, divider, stack). */
	readonly layout: ViewLayout;
	/** A swipe's way from the place that stands (`swipe: "pages"`); null where the screen does not swipe. */
	readonly track: ((shift: Shift) => ScreenTrack) | null;
	/** The lists drawn anew from the screen's data. */
	render(motion: LayoutMotion): void;
	/** The frame: the columns' widths and the titles' words, after a resize, the divider or the panel. */
	frame(): void;
	/** The place the screen stands at (the ribbon's), `slide` moving it there in step with the wheel; other layouts stand still. */
	showPlace(place: Place, slide: boolean): void;
	/** The places to drop the layout shows now, left to right. */
	drops(): readonly LayoutDrop[];
	/** Whether the timeline shows now, a place to drop beside the lists. */
	timelineShows(): boolean;
	/** The list a funnel column is drawn in now; null where this layout shows none. */
	listOf(column: ListColumn): TaskList | null;
	/** The by project list; null in another mode. */
	projects(): ProjectTasks | null;
	/** A column's title as a place to drop; null where it shows none. */
	titleOf(column: "day" | "inbox" | "soon" | "backlog"): HTMLElement | null;
	/** The element whose children show the day in the day's list, which a day's swipe slides; null where no day list stands beside the timeline. */
	dayLane(): HTMLElement | null;
	/** What scrolls the whole view in a note's block, which grows with it. */
	scroller(): HTMLElement | null;
	/** Rows' heights kept as they stand while `on`; measured again once nothing holds them. */
	hold(reason: LayoutHold, on: boolean): void;
	/** No tasks file: the lists step aside for the box that offers it. */
	hide(missing: boolean): void;
	destroy(): void;
}
