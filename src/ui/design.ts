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
	columnsTop: 64,
	/** Where the timeline starts inside the right column, under one all-day row. */
	timelineOffset: 34,
	dividerWidth: 16,
	floatWidth: 190,
	nowPillHeight: 16,
	/** A block starts one pixel under its hour line and ends two pixels short of its length. */
	itemInset: 1,
	itemGap: 2,
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
};

/** The custom properties the code sets on elements; styles.css does the arithmetic with them. */
export const PROPERTY = {
	listWidth: "--tc-list-width",
	/** The card's height and the gap between cards, from the settings: set on the body, where the tokens built on them live. */
	cardHeight: "--tc-card-h",
	cardGap: "--tc-card-gap",
	hour: "--tc-hour",
	navClear: "--tc-nav-clear",
	allDayExtraRows: "--tc-allday-extra-rows",
	y: "--tc-y",
	length: "--tc-len",
	/** A task card's left edge in the items area: further in when it lies over another card or an event. */
	x: "--tc-x",
	/** The bottom of the last task card: a stack that runs past midnight lengthens the day. */
	stackEnd: "--tc-stack-end",
	/** Empty room over the day's first hour and under its last, so the now line can stand in the middle near them. */
	roomTop: "--tc-room-top",
	roomBottom: "--tc-room-bottom",
	column: "--tc-col",
	columns: "--tc-cols",
	eventBg: "--tc-event-bg",
	eventBar: "--tc-event-bar",
	eventText: "--tc-event-text",
	/** The edge of the pressed card a panel hangs from: its bottom, or its top measured from the screen's bottom. */
	panelY: "--tc-panel-y",
	/** How far the timeline is pulled down from its top. */
	pull: "--tc-pull",
	/** The keyboard's height reserved under the task screen's content before the host shrinks the view for it. */
	keyboard: "--tc-keyboard",
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
} as const;

/** The durations the code animates with, read from styles.css so the sheet stays the one source. */
export const DURATION = {
	collapse: "--tc-duration-collapse",
	fly: "--tc-duration-fly",
	pull: "--tc-duration-pull",
	fade: "--tc-duration-fade",
	slide: "--tc-duration-slide",
} as const;

/** Measures that only the code uses: thresholds and distances, not drawn. */
export const LAYOUT = {
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
	/** On a computer a drag starts after the pointer moves this far. */
	dragStartDistance: 4,
	/** The divider holds to the middle of the window while dragged this close to it. */
	dividerSnapDistance: 8,
	/**
	 * A finger slower than this, px per ms, is placing something with care: the divider holds to the middle only then, so a
	 * quick swipe passes it by without a tick, and the switch's wheel turns freely only then, a quick swipe turning it one place.
	 */
	slowSpeed: 0.08,
	/** The wheel turns freely once the finger has gone slowly this long in a drag, and stays free to its end. */
	carefulMs: 100,
	/** The timeline scrolls itself while a drag comes this close to its edge. */
	autoScrollEdge: 40,
	/** Pixels per frame of that scroll at the very edge. */
	autoScrollSpeed: 12,
	/** The fewest minutes a slot dropped near midnight keeps before it. */
	minSlotMinutes: 5,
	/** How far in a task card lies over a long task's body or an event. */
	overlayInset: 18,
	/** The steps a drag, a drop and a stretch snap to, finest first: 10 is left out, since tasks start at :15 and :45 more than at :10. */
	snapSteps: [5, 15, 30, 60],
	/** The least a finger moves for one step: under this the snapped time would flicker between neighbours. */
	snapStepPx: 9,
	minutesPerDay: 1440,
	/** A pull let go past this far refreshes the sources. */
	pullThreshold: 60,
	/** A released pinch settles on the nearest zoom level over this long. */
	zoomSnapMs: 200,
	/** A finger drawn sideways this far steps to the next screen when let go. */
	swipeDistance: 48,
	/** So does a shorter flick still this fast when let go, px per ms. */
	swipeFlickSpeed: 0.3,
	/** Two fingers drawn sideways this far on a trackpad step to the next screen. */
	swipeWheelDistance: 60,
} as const;

/** A token's number, read from the stylesheet so it stays the one source: `150ms` → 150, `12px` → 12. */
export function tokenMs(el: Element, property: string): number {
	return parseFloat(getComputedStyle(el).getPropertyValue(property)) || 0;
}

export const tokenPx = tokenMs;
