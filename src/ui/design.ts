/**
 * The measures the code lays the screen out with. Each one is also a token in styles.css, named in DESIGN_TOKENS;
 * tests/styles.test.ts fails when the two differ, so they change together.
 */
export const DESIGN = {
	/** One hour of the timeline at the base zoom. */
	hourPx: 56,
	/** Hours drawn on the timeline. */
	dayHours: 24,
	/** Where the columns start under the day row. */
	columnsTop: 64,
	/** Where the timeline starts inside the right column, under one all-day row. */
	timelineOffset: 34,
	cardHeight: 40,
	cardGap: 6,
	/** One card and one gap: how far cards step aside to make room. */
	cardShift: 46,
	dividerWidth: 16,
	floatWidth: 190,
	floatHeight: 42,
	nowPillHeight: 16,
	/** A block starts one pixel under its hour line and ends two pixels short of its length. */
	itemInset: 1,
	itemGap: 2,
} as const;

export type DesignMeasure = keyof typeof DESIGN;

export const DESIGN_TOKENS: Readonly<Record<DesignMeasure, string>> = {
	hourPx: "--tc-hour",
	dayHours: "--tc-day-hours",
	columnsTop: "--tc-columns-top",
	timelineOffset: "--tc-timeline-top",
	cardHeight: "--tc-card-h",
	cardGap: "--tc-card-gap",
	cardShift: "--tc-card-shift",
	dividerWidth: "--tc-divider",
	floatWidth: "--tc-float-w",
	floatHeight: "--tc-float-h",
	nowPillHeight: "--tc-now-h",
	itemInset: "--tc-item-inset",
	itemGap: "--tc-item-gap",
};

/** The custom properties the code sets on elements; styles.css does the arithmetic with them. */
export const PROPERTY = {
	listWidth: "--tc-list-width",
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
	/** An hour's label hides when its line comes this close to the now line. */
	labelHideDistance: 20,
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
	/** It holds only while moving slower than this, px per ms: a quick swipe passes the middle by, without a tick. */
	dividerSnapSpeed: 0.08,
	/** The timeline scrolls itself while a drag comes this close to its edge. */
	autoScrollEdge: 40,
	/** Pixels per frame of that scroll at the very edge. */
	autoScrollSpeed: 12,
	/** The fewest minutes a slot dropped near midnight keeps before it. */
	minSlotMinutes: 5,
	/** Between the head of a task card and the card pushed under it. */
	stackGap: 4,
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
} as const;

/** A token's number, read from the stylesheet so it stays the one source: `150ms` → 150, `12px` → 12. */
export function tokenMs(el: Element, property: string): number {
	return parseFloat(getComputedStyle(el).getPropertyValue(property)) || 0;
}

export const tokenPx = tokenMs;
