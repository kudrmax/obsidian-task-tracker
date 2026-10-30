import type { CalendarEvent } from "../application/contracts";
import { PROPERTY } from "./design";
import { clear, el } from "./dom";
import { bgAlphaFor, eventColors, type Theme } from "./eventColors";

export function paintEvent(target: HTMLElement, event: CalendarEvent, theme: Theme): void {
	const colors = eventColors(event.color, bgAlphaFor(event.source), theme);
	target.style.setProperty(PROPERTY.eventBg, colors.bg);
	target.style.setProperty(PROPERTY.eventBar, colors.bar);
	target.style.setProperty(PROPERTY.eventText, colors.text);
}

/** The all-day events over the timeline, one row each; the column below learns how many rows beyond the first there are. */
export function renderAllDayRows(container: HTMLElement, column: HTMLElement, events: readonly CalendarEvent[], theme: Theme): void {
	clear(container);
	el(container, "div", "tc-allday-backing");
	for (const event of events) {
		const row = el(container, "div", "tc-allday");
		paintEvent(row, event, theme);
		el(row, "div", "tc-event-bar");
		el(row, "div", "tc-allday-title", event.title);
	}
	column.style.setProperty(PROPERTY.allDayExtraRows, String(Math.max(0, events.length - 1)));
}
