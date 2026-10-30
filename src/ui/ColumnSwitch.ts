import type { RightMode } from "../settings";
import { DURATION, LAYOUT, tokenMs } from "./design";
import { capturePointer, el, px, releasePointer } from "./dom";
import { icon } from "./icons";

export interface ColumnSwitchOptions {
	value(): RightMode;
	onChange(mode: RightMode): void;
	/** A calendar source is stale or failing: the orange dot on the calendar icon. */
	dot(): boolean;
	/** The switch held while the calendar shows: the sources window. */
	onSources(): void;
	longPressMs(): number;
}

type Column = "soon" | "now" | "calendar";

/** The window's two columns of the three, Soon, Now and the calendar. */
const SHOWN: Readonly<Record<RightMode, readonly Column[]>> = { soon: ["soon", "now"], calendar: ["now", "calendar"] };

const other = (mode: RightMode): RightMode => (mode === "calendar" ? "soon" : "calendar");

interface Press {
	readonly pointerId: number;
	readonly x: number;
	/** The pill's left edge when pressed, and where it stands over Soon and Now: it travels one icon's width. */
	readonly left: number;
	readonly min: number;
	readonly step: number;
	readonly hold: number;
	dragging: boolean;
}

/**
 * The switch in the day row, a toggle drawn as three icons with a pill over the two columns the screen shows. A tap
 * anywhere flips it; the pill follows a finger and settles on the nearer side when let go, and only then does the
 * screen slide. Held while the calendar shows, it opens the sources window.
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
		this.el.setAttribute("role", "switch");
		this.el.setAttribute("aria-label", "Show the calendar");
		this.el.tabIndex = 0;
		this.pill = el(this.el, "span", "tc-seg-pill");
		this.add("soon");
		this.add("now");
		this.dot = el(this.add("calendar"), "span", "tc-dot");
		this.el.addEventListener("pointerdown", (e) => this.down(e));
		this.el.addEventListener("pointermove", (e) => this.move(e));
		this.el.addEventListener("pointerup", (e) => this.up(e, true));
		this.el.addEventListener("pointercancel", (e) => this.up(e, false));
		this.el.addEventListener("click", () => this.tap());
		this.el.addEventListener("keydown", (e) => {
			if (e.key !== "Enter" && e.key !== " ") return;
			e.preventDefault();
			this.flip(other(this.opts.value()));
		});
		this.render();
	}

	private add(column: Column): HTMLElement {
		const cell = el(this.el, "span", "tc-seg-icon");
		cell.appendChild(icon(column));
		this.icons.set(column, cell);
		return cell;
	}

	private down(e: PointerEvent): void {
		if (!e.isPrimary || e.button !== 0) return;
		this.swallowClick = false;
		const step = this.icons.get("now")!.offsetWidth;
		const left = this.pill.offsetLeft;
		const min = this.opts.value() === "calendar" ? left - step : left;
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
			press.dragging = true;
			this.el.classList.remove("is-settling");
			capturePointer(this.el, press.pointerId);
		}
		const left = Math.min(press.min + press.step, Math.max(press.min, press.left + dx));
		this.pill.style.left = px(left);
		this.light(left - press.min >= press.step / 2 ? "calendar" : "soon");
	}

	private up(e: PointerEvent, released: boolean): void {
		const press = this.press;
		if (!press || e.pointerId !== press.pointerId) return;
		window.clearTimeout(press.hold);
		this.press = null;
		if (!press.dragging) return;
		releasePointer(this.el, press.pointerId);
		this.swallowClick = true;
		const nearer = this.pill.offsetLeft - press.min >= press.step / 2 ? "calendar" : "soon";
		this.flip(released ? nearer : this.opts.value());
	}

	private tap(): void {
		if (this.swallowClick) {
			this.swallowClick = false;
			return;
		}
		this.flip(other(this.opts.value()));
	}

	/** The pill glides from where it stands to its side; a side other than the one shown moves the screen with it. */
	private flip(mode: RightMode): void {
		window.clearTimeout(this.settling);
		this.el.classList.add("is-settling");
		this.settling = window.setTimeout(() => this.el.classList.remove("is-settling"), tokenMs(this.el, DURATION.slide));
		this.pill.style.left = "";
		this.light(mode);
		if (mode !== this.opts.value()) this.opts.onChange(mode);
	}

	private light(mode: RightMode): void {
		this.el.classList.toggle("is-lists", mode === "soon");
		this.el.setAttribute("aria-checked", String(mode === "calendar"));
		for (const [column, cell] of this.icons) cell.classList.toggle("is-on", SHOWN[mode].includes(column));
	}

	render(): void {
		if (!this.press?.dragging) this.light(this.opts.value());
		this.dot.classList.toggle("is-shown", this.opts.dot());
	}
}
