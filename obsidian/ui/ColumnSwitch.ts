import { type CalendarAlert, type DropColumn, placeShowing } from "../../core/application/contracts";
import type { RightMode } from "./viewSettings";
import { CarefulPace } from "./CarefulPace";
import { DURATION, LAYOUT, PROPERTY, tokenMs } from "./design";
import { capturePointer, el, releasePointer } from "./dom";
import type { GestureArbiter } from "./gestures";
import { icon } from "./kit/icons";
import { type Place, placeIndex, WHEEL_END, SCREEN_PLACES, type ScreenPlace } from "./screens";
import { labelMark } from "./sources/labelMark";

export interface ColumnSwitchOptions {
	/** Where the screen stands; Done, which the wheel has no icon for, puts the window a step left of Inbox. */
	value(): Place;
	onChange(mode: RightMode): void;
	/** The dot on the calendar icon: orange for a source in use gone old, red for one whose refresh failed too. */
	dot(): { readonly alert: CalendarAlert; readonly words: string };
	/** The switch held while the calendar shows: the sources window. */
	onSources(): void;
	longPressMs(): number;
	readonly arbiter: GestureArbiter;
}

/** The wheel's icons: the Projects screen's folder, the columns of the strip, the day column as Now. */
export type SwitchColumn = "projects" | "inbox" | "soon" | "now" | "calendar";

const COLUMNS: readonly SwitchColumn[] = ["projects", "inbox", "soon", "now", "calendar"];

const ICON_OF: Readonly<Record<SwitchColumn, "project" | "inbox" | "soon" | "now" | "calendar">> = { projects: "project", inbox: "inbox", soon: "soon", now: "now", calendar: "calendar" };
const NAME_OF: Readonly<Record<SwitchColumn, string>> = { projects: "Projects", inbox: "Inbox", soon: "Soon", now: "Now", calendar: "Calendar" };

/** How far out of the window's middle an icon stands before the window no longer holds it: half an icon. */
const HALF = 0.5;

const DRAG = "switch";

const placeOf = (place: Place): number => placeIndex(place);

/** The list each icon stands for; the folder and the calendar are no list, and only their own places show them. */
const LIST_OF: Readonly<Record<SwitchColumn, DropColumn | null>> = { projects: null, inbox: "inbox", soon: "soon", now: "day", calendar: null };

/** The place a tap on an icon turns to: the one standing, when it shows the icon's column, else the nearest that does (from Done and Projects, as from Inbox, its neighbour). */
function placeForIcon(column: SwitchColumn, from: Place): ScreenPlace {
	const list = LIST_OF[column];
	if (list === null) return column === "projects" ? "projects" : "calendar";
	return placeShowing(list, from === "done" || from === "projects" ? "inbox" : from);
}

/** The place of the wheel's places a place counts as: Done as Inbox, its neighbour. */
function wheelIndex(place: Place): number {
	return SCREEN_PLACES.indexOf(place === "done" ? "inbox" : place);
}

/** The wheel's place nearest to where it stands. */
function nearest(at: number): ScreenPlace {
	return SCREEN_PLACES.reduce((best, place) => (Math.abs(placeIndex(place) - at) < Math.abs(placeIndex(best) - at) ? place : best));
}

interface Press {
	readonly pointerId: number;
	/** The wheel's place it stood on when pressed (`SCREEN_PLACES`), and where it stood. */
	readonly start: number;
	readonly startAt: number;
	/** The wheel stands at `from` with the finger at `x`, and turns a place per icon's width the finger travels from there. */
	x: number;
	from: number;
	lastX: number;
	readonly step: number;
	readonly hold: number;
	readonly pace: CarefulPace;
	dragging: boolean;
}

/**
 * The switch at the bottom of the screen: a wheel of four icons, Inbox, Soon, Now and the calendar, under a window two
 * icons wide that stands still in the middle of the screen and shows the two columns on it, with a neighbour on either side. The wheel turns with a finger, as
 * the screen would: a finger moving left brings the columns on the right into the window. A quick swipe turns it one
 * place; a finger that goes slowly for a moment turns it freely, and it settles on the nearest place when let go. Only
 * then does the screen slide. A tap on an icon outside the window turns it to the
 * nearest place that shows the icon. Held while the calendar shows, it opens the sources window.
 */
export class ColumnSwitch {
	readonly el: HTMLElement;
	/** The wheel's icons twice: grey under the track, dark under the window. */
	private readonly icons: HTMLElement[] = [];
	private readonly dots: HTMLElement[] = [];
	private press: Press | null = null;
	/** The click that ends a drag or a hold is not a tap. */
	private swallowClick = false;
	private settling = 0;

	constructor(parent: HTMLElement, private readonly opts: ColumnSwitchOptions) {
		this.el = el(parent, "div", "tc-seg");
		this.el.setAttribute("role", "group");
		this.el.setAttribute("aria-label", "Columns");
		this.el.tabIndex = 0;
		this.reel(el(this.el, "div", "tc-seg-view"), false);
		this.reel(el(this.el, "span", "tc-seg-pill"), true);
		this.el.addEventListener("pointerdown", (e) => this.down(e));
		this.el.addEventListener("pointermove", (e) => this.move(e));
		this.el.addEventListener("pointerup", (e) => this.up(e, true));
		this.el.addEventListener("pointercancel", (e) => this.up(e, false));
		this.el.addEventListener("click", (e) => this.tap(e.target));
		this.el.addEventListener("keydown", (e) => {
			const shift = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
			if (shift === 0) return;
			e.preventDefault();
			const place = wheelIndex(this.opts.value()) + shift;
			if (place >= 0 && place < SCREEN_PLACES.length) this.show(SCREEN_PLACES[place]);
		});
		this.render();
	}

	private reel(parent: HTMLElement, lens: boolean): void {
		const reel = el(parent, "span", "tc-seg-reel");
		for (const column of COLUMNS) {
			const cell = el(reel, "span", "tc-seg-icon");
			cell.dataset.column = column;
			if (lens) cell.classList.add("is-lens");
			if (lens) cell.setAttribute("aria-hidden", "true");
			else cell.setAttribute("aria-label", NAME_OF[column]);
			cell.appendChild(icon(ICON_OF[column]));
			if (column === "calendar") this.dots.push(el(cell, "span", "tc-dot"));
			this.icons.push(cell);
		}
	}

	private down(e: PointerEvent): void {
		if (!e.isPrimary || e.button !== 0) return;
		this.swallowClick = false;
		const step = this.icons[0].offsetWidth;
		const hold = window.setTimeout(() => this.held(), this.opts.longPressMs());
		const start = wheelIndex(this.opts.value());
		const startAt = placeOf(this.opts.value());
		const pace = new CarefulPace(e.clientX, e.timeStamp);
		this.press = { pointerId: e.pointerId, start, startAt, x: e.clientX, from: startAt, lastX: e.clientX, step, hold, pace, dragging: false };
	}

	private held(): void {
		if (!this.press || this.press.dragging || this.opts.value() !== "calendar") return;
		this.swallowClick = true;
		this.opts.onSources();
	}

	private move(e: PointerEvent): void {
		const press = this.press;
		if (!press || e.pointerId !== press.pointerId) return;
		const careful = press.pace.careful;
		press.pace.update(e.clientX, e.timeStamp);
		if (!press.dragging) {
			if (Math.abs(e.clientX - press.x) < LAYOUT.pressTolerance) return;
			window.clearTimeout(press.hold);
			if (!this.opts.arbiter.claim(DRAG)) {
				this.press = null;
				this.swallowClick = true;
				return;
			}
			press.dragging = true;
			this.el.classList.remove("is-settling");
			capturePointer(this.el, press.pointerId);
		}
		if (press.pace.careful && !careful) {
			press.from = this.position();
			press.x = press.lastX;
		}
		press.lastX = e.clientX;
		this.turn(this.under(press, e.clientX));
	}

	/** Where the finger puts the wheel: a quick swipe reaches no further than the next place, a careful one anywhere. */
	private under(press: Press, x: number): number {
		const reach = press.pace.careful ? SCREEN_PLACES.length : 1;
		const least = placeIndex(SCREEN_PLACES[Math.max(0, press.start - reach)]);
		const most = placeIndex(SCREEN_PLACES[Math.min(SCREEN_PLACES.length - 1, press.start + reach)]);
		return Math.min(most, Math.max(least, press.from - (x - press.x) / press.step));
	}

	private up(e: PointerEvent, released: boolean): void {
		const press = this.press;
		if (!press || e.pointerId !== press.pointerId) return;
		window.clearTimeout(press.hold);
		this.press = null;
		if (!press.dragging) return;
		releasePointer(this.el, press.pointerId);
		this.opts.arbiter.release(DRAG);
		this.swallowClick = true;
		if (!released) return this.show(this.opts.value());
		press.pace.update(e.clientX, e.timeStamp);
		const at = this.position();
		if (press.pace.careful) return this.show(nearest(at));
		const way = Math.sign(at - press.startAt);
		this.show(way === 0 ? this.opts.value() : SCREEN_PLACES[Math.min(SCREEN_PLACES.length - 1, Math.max(0, press.start + way))]);
	}

	private tap(target: EventTarget | null): void {
		if (this.swallowClick) {
			this.swallowClick = false;
			return;
		}
		const cell = target instanceof Element ? target.closest<HTMLElement>(".tc-seg-icon") : null;
		const column = cell?.dataset.column as SwitchColumn | undefined;
		if (!column || !COLUMNS.includes(column)) return;
		const from = this.opts.value();
		const place = placeForIcon(column, from);
		if (place !== from) this.show(place);
	}

	/** The wheel rolls from where it stands to its place; a place other than the one shown moves the screen with it. */
	show(place: Place): void {
		window.clearTimeout(this.settling);
		this.el.classList.add("is-settling");
		this.settling = window.setTimeout(() => this.el.classList.remove("is-settling"), tokenMs(this.el, DURATION.slide));
		this.turn(placeOf(place));
		if (place !== this.opts.value() && place !== "done") this.opts.onChange(place);
	}

	/** The wheel turns with the screen while a finger draws the screen: `position` a share of the way from one place to the next. */
	follow(position: number): void {
		window.clearTimeout(this.settling);
		this.el.classList.remove("is-settling");
		this.turn(position);
	}

	/**
	 * Both copies of the wheel to one place: the window keeps its two icons whole, the rest shrink and fade by how far out
	 * they stand. The track holds one neighbour on each side, and only where the wheel has one: past an end it stops at the window.
	 * At Projects the window holds the folder alone in its middle: the half of the window it leaves empty counts as inside,
	 * and the window shows no other icon (board Nav); Done, which has no icon, holds Inbox alone the same way.
	 */
	private turn(position: number): void {
		this.el.style.setProperty(PROPERTY.wheel, String(position));
		this.el.style.setProperty(PROPERTY.before, String(Math.max(0, Math.min(1, position))));
		this.el.style.setProperty(PROPERTY.after, String(Math.max(0, Math.min(1, WHEEL_END - position))));
		const middle = position + 1;
		const spare = Math.max(0, Math.min(HALF, -position));
		/** How sharply the window hides what is out of its middle: fully at Projects and Done, not at all from Inbox on. */
		const alone = 2 * Math.max(0, Math.min(1, (placeIndex("inbox") - position) / HALF));
		this.icons.forEach((cell, i) => {
			const off = Math.abs((i % COLUMNS.length) + HALF - middle);
			cell.style.setProperty(PROPERTY.depth, String(Math.max(0, off - HALF - spare)));
			if (cell.classList.contains("is-lens")) cell.style.setProperty(PROPERTY.lens, String(Math.max(0, Math.min(1, 1 - alone * Math.max(0, off - HALF)))));
		});
	}

	private position(): number {
		return parseFloat(this.el.style.getPropertyValue(PROPERTY.wheel));
	}

	render(): void {
		if (!this.press?.dragging) this.turn(placeOf(this.opts.value()));
		const { alert, words } = this.opts.dot();
		for (const dot of this.dots) {
			dot.classList.toggle("is-shown", alert !== "none");
			dot.classList.toggle("is-broken", alert === "broken");
			labelMark(dot, words);
		}
	}
}
