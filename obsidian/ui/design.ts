/**
 * The measures the code lays the screen out with. Each one is also a token in styles.css, named in DESIGN_TOKENS;
 * tests/styles.test.ts fails when the two differ, so they change together.
 */
export const DESIGN = {
	/** One hour of the timeline at the base zoom. */
	hourPx: 56,
	/** Hours drawn on the timeline. */
	dayHours: 24,
	/** How far an hour's label rises over its line, and hangs under it: the timeline keeps this much room over its first hour and under its closing one. */
	labelLift: 7,
	/** The same for a label between the hours. */
	minorLift: 4,
	/** Where the columns start under their headers. */
	columnsTop: 40,
	/** Where the timeline starts inside the right column, under one all-day row. */
	timelineOffset: 34,
	dividerWidth: 16,
	floatWidth: 190,
	nowPillHeight: 16,
	/** A block starts one pixel under its hour line and ends two pixels short of its length. */
	itemInset: 1,
	itemGap: 2,
	/** The bar over the keyboard while a task is typed: the field stands above it. */
	barHeight: 44,
	/** On the desktop the bar is a capsule next to the field, this far from it; its panels stand as far from it. */
	deskBarGap: 8,
} as const;

export type DesignMeasure = keyof typeof DESIGN;

export const DESIGN_TOKENS: Readonly<Record<DesignMeasure, string>> = {
	hourPx: "--tc-hour",
	dayHours: "--tc-day-hours",
	labelLift: "--tc-label-lift",
	minorLift: "--tc-minor-lift",
	columnsTop: "--tc-columns-top",
	timelineOffset: "--tc-timeline-top",
	dividerWidth: "--tc-divider",
	floatWidth: "--tc-float-w",
	nowPillHeight: "--tc-now-h",
	itemInset: "--tc-item-inset",
	itemGap: "--tc-item-gap",
	barHeight: "--tc-bar-h",
	deskBarGap: "--tc-desk-bar-gap",
};

/** The custom properties the code sets on elements; styles.css does the arithmetic with them. */
export const PROPERTY = {
	listWidth: "--tc-list-width",
	/** Room a scrolled list keeps under its last row while its rows fold away, so it stays where it was scrolled. */
	listHold: "--tc-list-hold",
	/** The card's height and the gap between cards, from the settings: set on the body, where the tokens built on them live. */
	cardHeight: "--tc-card-h",
	cardGap: "--tc-card-gap",
	hour: "--tc-hour",
	allDayExtraRows: "--tc-allday-extra-rows",
	y: "--tc-y",
	length: "--tc-len",
	/** A task card's left edge in the items area: further in when it lies over another card or an event. */
	x: "--tc-x",
	/** The bottom of the last task card: a stack that runs past midnight lengthens the day. */
	stackEnd: "--tc-stack-end",
	/** Empty room over the day's first hour and under its last, so the now line can stand in the middle near them. */
	roomTop: "--tc-room-top",
	/** How much of a scroller's content is under its top edge, and under its bottom edge, up to the tallest card: its fades grow with them. */
	scrolled: "--tc-scrolled",
	scrolledBelow: "--tc-scrolled-below",
	roomBottom: "--tc-room-bottom",
	eventBg: "--tc-event-bg",
	eventBar: "--tc-event-bar",
	eventText: "--tc-event-text",
	/** The edge of the pressed card a panel hangs from: its bottom, or its top measured from the screen's bottom. */
	panelY: "--tc-panel-y",
	/** How deep a subtask's card stands under its task: 0 for a task. */
	level: "--tc-level",
	/** How many levels back from a subtask's card a line of a task further up passes it. */
	pass: "--tc-pass",
	/** Where the switch's wheel stands: 0 with Inbox and Soon in its window, 2 with Now and the calendar, in between under a finger. */
	wheel: "--tc-seg-pos",
	/** How many icons' widths an icon of the wheel stands out of its window. */
	depth: "--tc-seg-depth",
	/** How much of a neighbour's place the track holds on each side of the window: none past the wheel's ends. */
	before: "--tc-seg-before",
	after: "--tc-seg-after",
	/** The view's middle, top and height, which the desktop search panel hangs from. */
	searchLeft: "--tc-search-left",
	searchTop: "--tc-search-top",
	searchRoom: "--tc-search-room",
} as const;

/** The durations the code animates with, read from styles.css so the sheet stays the one source. */
export const DURATION = {
	collapse: "--tc-duration-collapse",
	/** An overlay opens: its sheet, its windows, the copies over it. It closes in `collapse`. */
	menu: "--tc-duration-menu",
	snap: "--tc-duration-snap",
	fly: "--tc-duration-fly",
	fade: "--tc-duration-fade",
	slide: "--tc-duration-slide",
	keyboard: "--tc-duration-keyboard",
} as const;

/** The easings the code animates with, read from styles.css as the durations are. */
export const EASING = {
	/** The one curve a list's rows and every part of an overlay move on. */
	out: "--tc-ease-out",
	keyboard: "--tc-ease-keyboard",
} as const;

/** Measures that only the code uses: thresholds and distances, not drawn. */
export const LAYOUT = {
	/** The least a finger moves on the timeline for one step of the snapped time: under it the time would flicker between neighbours. */
	snapTolerance: 9,
	/** The start of a description stands this far from the copy of its card, and goes past the menu with less room than three lines and its padding. */
	descPeekGap: 10,
	descPeekLeast: 88,
	/** The grid labels a division of the hour, finest first allowed, once its lines stand at least `gridLabelGap` apart. */
	gridDivisions: [5, 15, 30],
	gridLabelGap: 40,
	/** Unlabelled lines every `gridTickMinutes` join them once those stand at least `gridTickGap` apart. */
	gridTickMinutes: 5,
	gridTickGap: 16,
	/** A block under this height is drawn tiny: one small line, no padding. */
	tinyItemHeight: 24,
	/** How far the now line stands down the visible timeline when today opens. */
	nowFraction: 0.5,
	/** A finger may wander this far during a long press; farther is a scroll. */
	pressTolerance: 8,
	/** How far past its edge the plus's ring reaches for a card brought back to it. */
	plusRingReach: 24,
	/** On a computer a drag starts after the pointer moves this far. */
	dragStartDistance: 4,
	/** A second click this soon after the first is a double click: the first waits it out before it counts as a click. */
	doubleClickMs: 250,
	/** The divider holds to the middle of the window while dragged this close to it. */
	dividerSnapDistance: 8,
	/**
	 * A finger slower than this, px per ms, is placing something with care: the divider holds to the middle only then, so a
	 * quick swipe passes it by without a tick, and the switch's wheel turns freely only then, a quick swipe turning it one place.
	 */
	slowSpeed: 0.08,
	/** The wheel turns freely once the finger has gone slowly this long in a drag, and stays free to its end. */
	carefulMs: 100,
	/** A list or the timeline scrolls itself while a drag comes this close to its edge. */
	autoScrollEdge: 40,
	/** Pixels per frame of that scroll at the very edge. */
	autoScrollSpeed: 12,
	/**
	 * How far past the edge of the place a list shows the finger goes before another place is taken: at an edge the place
	 * would otherwise flip between its two sides with every tremor of the finger.
	 */
	dropHysteresis: 6,
	/** How far in a task card lies over a long task's body or an event. */
	overlayInset: 18,
	/** A finger let go this fast, px per ms, sends the screen the way it went, however little of the way it was drawn. */
	swipeFlickSpeed: 0.3,
	/** Two fingers swept this far on a trackpad within a moment send the screen on at once, as a flick does. */
	swipeWheelDistance: 60,
	/** How stiffly the screen gives past the row's end: drawn a whole width, it moves this share of it at first, less and less after. */
	swipeEdgeGive: 0.55,
	/** The list scrolls a field typed in at least this far above the bar. */
	fieldOverBar: 16,
} as const;

/** A token's number, read from the stylesheet so it stays the one source: `150ms` → 150, `12px` → 12. */
export function tokenMs(el: Element, property: string): number {
	return parseFloat(getComputedStyle(el).getPropertyValue(property)) || 0;
}

export const tokenPx = tokenMs;
