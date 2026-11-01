import type { RightMode } from "../settings";
import { CarefulPace } from "./CarefulPace";
import { DURATION, LAYOUT, PROPERTY, tokenMs } from "./design";
import { capturePointer, el, releasePointer } from "./dom";
import type { GestureArbiter } from "./gestures";
import { icon } from "./icons";
import { PLACES } from "./screens";

export interface ColumnSwitchOptions {
	value(): RightMode;
	onChange(mode: RightMode): void;
	/** A calendar source is stale or failing: the orange dot on the calendar icon. */
	dot(): boolean;
	/** The switch held while the calendar shows: the sources window. */
	onSources(): void;
	longPressMs(): number;
	readonly arbiter: GestureArbiter;
}

/** The wheel's icons: the columns of the strip, the day column as Now. */
export type SwitchColumn = "inbox" | "soon" | "now" | "calendar";

const COLUMNS: readonly SwitchColumn[] = ["inbox", "soon", "now", "calendar"];

const DRAG = "switch";

const placeOf = (mode: RightMode): number => PLACES.indexOf(mode);

/** The place a tap on a column turns to: none when the window shows it, else the nearest that does. */
function placeShowing(column: number, from: number): number | null {
	if (column === from || column === from + 1) return null;
	return column < from ? column : column - 1;
}

/** The place showing `column`: `mode` itself when it does, else the nearest that does, as a tap on its icon turns to. */
export function modeShowing(column: SwitchColumn, mode: RightMode): RightMode {
	const place = placeShowing(COLUMNS.indexOf(column), placeOf(mode));
	return place === null ? mode : PLACES[place];
}

interface Press {
	readonly pointerId: number;
	/** The place the wheel stood on when pressed. */
	readonly start: number;
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
			const place = placeOf(this.opts.value()) + shift;
			if (place >= 0 && place < PLACES.length) this.show(PLACES[place]);
		});
		this.render();
	}

	private reel(parent: HTMLElement, lens: boolean): void {
		const reel = el(parent, "span", "tc-seg-reel");
		for (const column of COLUMNS) {
			const cell = el(reel, "span", "tc-seg-icon");
			cell.dataset.column = column;
			if (lens) cell.setAttribute("aria-hidden", "true");
			else cell.setAttribute("aria-label", column === "calendar" ? "Calendar" : column[0].toUpperCase() + column.slice(1));
			cell.appendChild(icon(column));
			if (column === "calendar") this.dots.push(el(cell, "span", "tc-dot"));
			this.icons.push(cell);
		}
	}

	private down(e: PointerEvent): void {
		if (!e.isPrimary || e.button !== 0) return;
		this.swallowClick = false;
		const step = this.icons[0].offsetWidth;
		const hold = window.setTimeout(() => this.held(), this.opts.longPressMs());
		const start = placeOf(this.opts.value());
		const pace = new CarefulPace(e.clientX, e.timeStamp);
		this.press = { pointerId: e.pointerId, start, x: e.clientX, from: start, lastX: e.clientX, step, hold, pace, dragging: false };
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
		const reach = press.pace.careful ? PLACES.length : 1;
		const least = Math.max(0, press.start - reach);
		const most = Math.min(PLACES.length - 1, press.start + reach);
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
		this.show(PLACES[press.pace.careful ? Math.round(at) : press.start + Math.sign(at - press.start)]);
	}

	private tap(target: EventTarget | null): void {
		if (this.swallowClick) {
			this.swallowClick = false;
			return;
		}
		const cell = target instanceof Element ? target.closest<HTMLElement>(".tc-seg-icon") : null;
		const column = cell ? COLUMNS.indexOf(cell.dataset.column as SwitchColumn) : -1;
		if (column < 0) return;
		const place = placeShowing(column, placeOf(this.opts.value()));
		if (place !== null) this.show(PLACES[place]);
	}

	/** The wheel rolls from where it stands to its place; a place other than the one shown moves the screen with it. */
	show(mode: RightMode): void {
		window.clearTimeout(this.settling);
		this.el.classList.add("is-settling");
		this.settling = window.setTimeout(() => this.el.classList.remove("is-settling"), tokenMs(this.el, DURATION.slide));
		this.turn(placeOf(mode));
		if (mode !== this.opts.value()) this.opts.onChange(mode);
	}

	/**
	 * Both copies of the wheel to one place: the window keeps its two icons whole, the rest shrink and fade by how far out
	 * they stand. The track holds one neighbour on each side, and only where the wheel has one: past an end it stops at the window.
	 */
	private turn(position: number): void {
		this.el.style.setProperty(PROPERTY.wheel, String(position));
		this.el.style.setProperty(PROPERTY.before, String(Math.min(1, position)));
		this.el.style.setProperty(PROPERTY.after, String(Math.min(1, PLACES.length - 1 - position)));
		this.icons.forEach((cell, i) => {
			const out = Math.max(0, Math.abs((i % COLUMNS.length) - position - 0.5) - 0.5);
			cell.style.setProperty(PROPERTY.depth, String(out));
		});
	}

	private position(): number {
		return parseFloat(this.el.style.getPropertyValue(PROPERTY.wheel));
	}

	render(): void {
		if (!this.press?.dragging) this.turn(placeOf(this.opts.value()));
		for (const dot of this.dots) dot.classList.toggle("is-shown", this.opts.dot());
	}
}
