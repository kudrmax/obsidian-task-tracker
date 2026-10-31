import type { RightMode } from "../settings";
import { DURATION, LAYOUT, tokenMs } from "./design";
import { capturePointer, el, px, releasePointer } from "./dom";
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

/** The place a tap on a column moves to: none when the window shows it, else the nearest that does. */
function placeShowing(column: number, from: number): number | null {
	if (column === from || column === from + 1) return null;
	return column < from ? column : column - 1;
}

interface Press {
	readonly pointerId: number;
	readonly x: number;
	/** The pill's left edge when pressed, and where it stands over Inbox and Soon: it travels an icon's width per place. */
	readonly left: number;
	readonly min: number;
	readonly step: number;
	readonly hold: number;
	dragging: boolean;
}

/**
 * The switch at the bottom of the screen: four icons, Inbox, Soon, Now and the calendar, with a pill over the two columns the screen
 * shows, in one of three places. A tap on an icon the pill leaves uncovered moves it to the nearest place that covers
 * the icon; the pill follows a finger and settles on the nearest place when let go, and only then does the screen
 * slide. Held while the calendar shows, it opens the sources window.
 */
export class ColumnSwitch {
	readonly el: HTMLElement;
	private readonly pill: HTMLElement;
	private readonly icons = new Map<Column, HTMLElement>();
	private readonly dot: HTMLElement;
	private press: Press | null = null;
	/** The click that ends a drag or a hold is not a tap. */
	private swallowClick = false;
	private settling = 0;

	constructor(parent: HTMLElement, private readonly opts: ColumnSwitchOptions) {
		this.el = el(parent, "div", "tc-seg");
		this.el.setAttribute("role", "group");
		this.el.setAttribute("aria-label", "Columns");
		this.el.tabIndex = 0;
		this.pill = el(this.el, "span", "tc-seg-pill");
		this.add("inbox");
		this.add("soon");
		this.add("now");
		this.dot = el(this.add("calendar"), "span", "tc-dot");
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

	private add(column: Column): HTMLElement {
		const cell = el(this.el, "span", "tc-seg-icon");
		cell.dataset.column = column;
		cell.setAttribute("aria-label", column === "calendar" ? "Calendar" : column[0].toUpperCase() + column.slice(1));
		cell.appendChild(icon(column));
		this.icons.set(column, cell);
		return cell;
	}

	private down(e: PointerEvent): void {
		if (!e.isPrimary || e.button !== 0) return;
		this.swallowClick = false;
		const step = this.icons.get("now")!.offsetWidth;
		const left = this.pill.offsetLeft;
		const min = left - placeOf(this.opts.value()) * step;
		const hold = window.setTimeout(() => this.held(), this.opts.longPressMs());
		this.press = { pointerId: e.pointerId, x: e.clientX, left, min, step, hold, dragging: false };
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
		const left = Math.min(press.min + (PLACES.length - 1) * press.step, Math.max(press.min, press.left + dx));
		this.pill.style.left = px(left);
		this.light(this.nearest(press));
	}

	private nearest(press: Press): RightMode {
		return PLACES[Math.round((this.pill.offsetLeft - press.min) / press.step)];
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
		this.show(released ? this.nearest(press) : this.opts.value());
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

	/** The pill glides from where it stands to its place; a place other than the one shown moves the screen with it. */
	show(mode: RightMode): void {
		window.clearTimeout(this.settling);
		this.el.classList.add("is-settling");
		this.settling = window.setTimeout(() => this.el.classList.remove("is-settling"), tokenMs(this.el, DURATION.slide));
		this.pill.style.left = "";
		this.light(mode);
		if (mode !== this.opts.value()) this.opts.onChange(mode);
	}

	private light(mode: RightMode): void {
		this.el.classList.toggle("is-inbox", mode === "inbox");
		this.el.classList.toggle("is-lists", mode === "soon");
		const first = placeOf(mode);
		COLUMNS.forEach((column, i) => this.icons.get(column)!.classList.toggle("is-on", i === first || i === first + 1));
	}

	render(): void {
		if (!this.press?.dragging) this.light(this.opts.value());
		this.dot.classList.toggle("is-shown", this.opts.dot());
	}
}
