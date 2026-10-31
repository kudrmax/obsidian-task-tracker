import type { RightMode } from "../settings";
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

type Column = "inbox" | "soon" | "now" | "calendar";

const COLUMNS: readonly Column[] = ["inbox", "soon", "now", "calendar"];

const DRAG = "switch";

const placeOf = (mode: RightMode): number => PLACES.indexOf(mode);

/** The place a tap on a column turns to: none when the window shows it, else the nearest that does. */
function placeShowing(column: number, from: number): number | null {
	if (column === from || column === from + 1) return null;
	return column < from ? column : column - 1;
}

interface Press {
	readonly pointerId: number;
	readonly x: number;
	/** Where the wheel stood when pressed; it turns a place per icon's width the finger travels. */
	readonly from: number;
	readonly step: number;
	readonly hold: number;
	dragging: boolean;
}

/**
 * The switch at the bottom of the screen: a wheel of four icons, Inbox, Soon, Now and the calendar, under a window two
 * icons wide that stands still in the middle and shows the two columns on the screen. The wheel turns with a finger, as
 * the screen would: a finger moving left brings the columns on the right into the window, and the wheel settles on the
 * nearest place when let go; only then does the screen slide. A tap on an icon outside the window turns it to the
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
		this.press = { pointerId: e.pointerId, x: e.clientX, from: placeOf(this.opts.value()), step, hold, dragging: false };
	}

	private held(): void {
		if (!this.press || this.press.dragging || this.opts.value() !== "calendar") return;
		this.swallowClick = true;
		this.opts.onSources();
	}

	private move(e: PointerEvent): void {
		const press = this.press;
		if (!press || e.pointerId !== press.pointerId) return;
		const dx = e.clientX - press.x;
		if (!press.dragging) {
			if (Math.abs(dx) < LAYOUT.pressTolerance) return;
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
		this.turn(Math.min(PLACES.length - 1, Math.max(0, press.from - dx / press.step)));
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
		this.show(released ? PLACES[Math.round(this.position())] : this.opts.value());
	}

	private tap(target: EventTarget | null): void {
		if (this.swallowClick) {
			this.swallowClick = false;
			return;
		}
		const cell = target instanceof Element ? target.closest<HTMLElement>(".tc-seg-icon") : null;
		const column = cell ? COLUMNS.indexOf(cell.dataset.column as Column) : -1;
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

	/** Both copies of the wheel to one place: the window keeps its two icons whole, the rest shrink and fade by how far out they stand. */
	private turn(position: number): void {
		this.el.style.setProperty(PROPERTY.wheel, String(position));
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
