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
	dividerWidth: 16,
	nowPillHeight: 16,
	/** A block starts one pixel under its hour line and ends two pixels short of its length. */
	itemInset: 1,
	itemGap: 2,
	/** An event's lane in a cluster of overlapping events: its bar and the gap after it (Decision 52). */
	eventLane: 6,
	/** An event's title line with its padding: a cluster's titles take lines this tall, one under another (Decision 52). */
	eventLabel: 23,
	/** An event title's padding over its text, and its text's line: the text's bottom stands this far under the block's top. */
	eventTitlePad: 4,
	eventTitleLine: 15,
	/** The micro gap a later block of a cluster keeps under an earlier title's text (Max, 2026-11-19, Decision 54). */
	eventTextGap: 2,
	/** On the desktop the bar is a capsule next to the field, this far from it; its panels stand as far from it. */
	deskBarGap: 8,
	/** A card's height and the gap between cards at the default card size: the calendar's stack lays its cards out by them. */
	cardHeight: 35,
	cardGap: 2,
	/** A selected task's dot, and how far in from the card's right (the top one) and its left (the bottom one). */
	grip: 10,
	gripStartRight: 14,
	gripEndLeft: 14,
	/** A menu's panel stands this far from the copy of the pressed card. */
	menuGap: 12,
	/** What a menu, the copy over it and a grown card keep from the window's edges. */
	wholeMargin: 10,
	/** The desktop's search panel hangs this far under the view's top, and keeps as far from its bottom (the design's «Поиск»). */
	searchTop: 16,
} as const;

export type DesignMeasure = keyof typeof DESIGN;

export const DESIGN_TOKENS: Readonly<Record<DesignMeasure, string>> = {
	hourPx: "--tc-hour",
	dayHours: "--tc-day-hours",
	labelLift: "--tc-label-lift",
	dividerWidth: "--tc-divider",
	nowPillHeight: "--tc-now-h",
	itemInset: "--tc-item-inset",
	itemGap: "--tc-item-gap",
	eventLane: "--tc-event-lane",
	eventLabel: "--tc-event-label",
	eventTitlePad: "--tc-space-4",
	eventTitleLine: "--tc-leading-block",
	eventTextGap: "--tc-event-text-gap",
	deskBarGap: "--tc-desk-bar-gap",
	cardHeight: "--tc-card-h",
	cardGap: "--tc-card-gap",
	grip: "--tc-grip",
	gripStartRight: "--tc-grip-start-right",
	gripEndLeft: "--tc-grip-end-left",
	menuGap: "--tc-space-12",
	wholeMargin: "--tc-space-10",
	searchTop: "--tc-space-16",
};

/** The custom properties the code sets on elements; styles.css does the arithmetic with them. */
export const PROPERTY = {
	/** How far the menu's block stands above the task it opened from: it lifts from the task by that much as it opens. */
	menuLift: "--tc-menu-lift",
	/** The menu's copy at least the pressed thing's width; a copy with notes as wide as the menu. */
	coverWidth: "--tc-cover-w",
	/** Where the pointer took a carried card, from its left edge: the compact carried plate is drawn around it. */
	grabX: "--tc-grab-x",
	/** How far down the pointer took a carried task: on a block taller than a card, the plate comes down to stay under it. */
	grabY: "--tc-grab-y",
	/** The level a carried card would land at: let go, it flies into its place indented as the card there. */
	landingLevel: "--tc-landing-level",
	/** The box of the place a carried task lands in (dnd-kit's measure of it): let go, it flies in at that width, and onto the calendar at that height. */
	landingWidth: "--tc-landing-w",
	landingHeight: "--tc-landing-h",
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
	/** An event's paint in each theme, as the port gives it: the stylesheet takes the theme's own. */
	eventBgDark: "--tc-event-bg-dark",
	eventBarDark: "--tc-event-bar-dark",
	eventTextDark: "--tc-event-text-dark",
	eventBgLight: "--tc-event-bg-light",
	eventBarLight: "--tc-event-bar-light",
	eventTextLight: "--tc-event-text-light",
	/** How far under the calendar's top a mark it reveals stands (a pinch's minute, today's now line, another day's hour): its scroll margin. */
	anchorOffset: "--tc-anchor-offset",
	/** How high a block or event of the calendar lies among the others: a card lying over another is drawn over it. */
	stackZ: "--tc-stack-z",
	/** An event's lanes right of its own in its cluster: its title stands past them. */
	lanesAfter: "--tc-lanes-after",
	/** How far under an event's start its block begins: an earlier title holds the line at its start. */
	blockTop: "--tc-block-top",
	/** How tall an event's title may hold as the calendar scrolls: down to the next title of its cluster. */
	labelRoom: "--tc-label-room",
	/** How deep a subtask's card stands under its task: 0 for a task. */
	level: "--tc-level",
} as const;

/** The durations the code animates with, read from styles.css so the sheet stays the one source. */
export const DURATION = {
	snap: "--tc-duration-snap",
} as const;


/** Measures that only the code uses: thresholds and distances, not drawn. */
export const LAYOUT = {
	/** The least a finger moves on the timeline for one step of the snapped time: under it the time would flicker between neighbours. */
	snapTolerance: 9,
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
	/** How far in a task card lies over a long task's body or an event. */
	overlayInset: 18,
} as const;

/** A token's number, read from the stylesheet so it stays the one source: `150ms` → 150, `12px` → 12. */
export function tokenMs(el: Element, property: string): number {
	return parseFloat(getComputedStyle(el).getPropertyValue(property)) || 0;
}

