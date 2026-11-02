import type { Placement } from "../../application/contracts";
import { samePlacement } from "../../application/placements";
import { type PriorityLevel, usableLevels } from "../../settings";
import { DESIGN } from "../design";
import { clear, el, px } from "../dom";
import { icon } from "../icons";
import { type MenuTileSpec, type PlaceIconName, tileGroup } from "../menu/MenuPanel";
import { menuIcon } from "../menu/menuIcons";
import { MonthPicker } from "../menu/MonthPicker";
import { tileRows } from "../menu/TaskMenu";
import { placeLabel } from "../placeLabel";
import type { LocalDate } from "../types";
import { barBesideField, panelSide, type Side } from "./barPlacement";

export interface QuickBarState {
	/** The field can move one level in or out; a button that cannot is greyed. */
	readonly canIndent: boolean;
	readonly canOutdent: boolean;
	/** The field shifts at all: a field on the calendar does not, and has no shift buttons. */
	readonly indents: boolean;
	readonly priority: PriorityLevel | null;
	/** Where the field stands; null for a field with no place of its own (a subtask, a slot): no place button. */
	readonly place: Placement | null;
}

/** Where the field stands, for the bar to stand by it. */
export interface BarAnchor {
	/** Null while the field is not drawn. */
	readonly field: DOMRect | null;
	/** What shows of the field's column, under Obsidian's status bar: the desktop bar and its panels stay inside it. */
	readonly room: DOMRect;
	/** The view's box while the field is over a menu's blur, which lies over the whole page; null otherwise. */
	readonly overMenu: DOMRect | null;
}

export interface QuickBarDeps {
	/** Obsidian runs on the desktop: no keyboard rises, the bar is a capsule by the field. */
	desktop(): boolean;
	levels(): readonly PriorityLevel[];
	today(): LocalDate;
	onIndent(delta: 1 | -1): void;
	/** A level's prefix, or null to take the level off. */
	onPriority(prefix: string | null): void;
	onPlace(placement: Placement): void;
}

type PanelKind = "priority" | "place";

interface OpenPanel {
	readonly kind: PanelKind;
	readonly el: HTMLElement;
	/** The place panel shows its month picker in place of the tiles. */
	picking: boolean;
}

type FixedPlace = "inbox" | "soon" | "now";

const FIXED_PLACES: readonly { readonly kind: FixedPlace; readonly label: string }[] = [
	{ kind: "inbox", label: "Inbox" },
	{ kind: "soon", label: "Soon" },
	{ kind: "now", label: "Now" },
];

const placeIcon = (placement: Placement): PlaceIconName => (placement.kind === "date" ? "calendar" : placement.kind);

/**
 * The bar of a task being typed: the shift buttons, the priority flag and the place. On the phone it lies over the keyboard,
 * the shift buttons on the left, the rest on the right, and its panels open above it. On the desktop the same buttons are a
 * capsule right under the field, right edges together, or over the field where there is no room under it; its panels open
 * from it, away from the field. One panel at a time. The bar knows nothing of the entry: it shows the state it is given and
 * reports taps. A press on the bar or its panels never takes the focus from the field.
 */
export class QuickBar {
	private readonly bar: HTMLElement;
	private readonly outdent: HTMLButtonElement;
	private readonly indent: HTMLButtonElement;
	private readonly flag: HTMLButtonElement;
	private readonly place: HTMLButtonElement;
	private readonly placeText: HTMLElement;
	private state: QuickBarState | null = null;
	private panel: OpenPanel | null = null;
	/** Where the desktop capsule stands: the room it was placed in and the side of the field it took. */
	private desk: { readonly room: DOMRect; readonly side: Side } | null = null;
	/** The field the bar last stood by: a panel opening or closing moves the desktop capsule to make room for it. */
	private anchor: BarAnchor | null = null;
	private readonly pressOutside = (e: Event) => {
		if (!(e.target instanceof Node) || !this.bar.contains(e.target)) this.closePanel();
	};

	constructor(private readonly parent: HTMLElement, private readonly deps: QuickBarDeps) {
		this.bar = el(parent, "div", "tc-quick-bar");
		this.bar.hidden = true;
		for (const type of ["pointerdown", "mousedown"]) this.bar.addEventListener(type, (e) => e.preventDefault());
		this.outdent = this.shiftButton("tc-bar-outdent", "outdent", "Move out", "Shift+Tab", -1);
		this.indent = this.shiftButton("tc-bar-indent", "indent", "Move in", "Tab", 1);
		el(this.bar, "span", "tc-bar-spacer");
		this.flag = el(this.bar, "button", "tc-bar-flag");
		this.flag.setAttribute("aria-label", "Priority");
		this.flag.title = "Priority";
		this.flag.appendChild(menuIcon("priority"));
		this.flag.addEventListener("click", () => this.toggle("priority"));
		this.place = el(this.bar, "button", "tc-bar-place");
		this.place.setAttribute("aria-label", "Place");
		this.place.title = "Place";
		this.placeText = el(this.place, "span", "tc-bar-place-label");
		this.place.addEventListener("click", () => this.toggle("place"));
	}

	private shiftButton(cls: string, name: "outdent" | "indent", label: string, key: string, delta: 1 | -1): HTMLButtonElement {
		const button = el(this.bar, "button", `tc-bar-shift ${cls}`);
		button.setAttribute("aria-label", label);
		button.title = `${label} (${key})`;
		button.appendChild(icon(name));
		button.addEventListener("click", () => this.deps.onIndent(delta));
		return button;
	}

	show(state: QuickBarState): void {
		this.state = state;
		this.bar.hidden = false;
		this.bar.classList.toggle("is-desk", this.deps.desktop());
		this.outdent.hidden = this.indent.hidden = !state.indents;
		this.outdent.disabled = !state.canOutdent;
		this.indent.disabled = !state.canIndent;
		this.flag.hidden = this.levels().length === 0;
		this.flag.classList.toggle("is-set", state.priority !== null);
		if (state.priority) this.flag.dataset.priority = state.priority.color;
		else delete this.flag.dataset.priority;
		this.place.hidden = state.place === null;
		if (state.place) this.showPlace(state.place);
		this.refreshPanel();
	}

	hide(): void {
		this.closePanel();
		this.bar.hidden = true;
		this.follow(null);
	}

	/**
	 * The bar stands by the field `anchor` gives, after the field moved, grew or scrolled or the view changed. Over a menu's
	 * blur it leaves the view for the page, above the blur; null puts it back last in the view.
	 */
	follow(anchor: BarAnchor | null): void {
		this.anchor = anchor;
		for (const property of ["left", "top", "width", "bottom"]) this.bar.style.removeProperty(property);
		const over = anchor?.overMenu ?? null;
		this.bar.classList.toggle("is-over", over !== null);
		const holder = over ? this.bar.ownerDocument.body : this.parent;
		if (this.bar.parentElement !== holder) holder.appendChild(this.bar);
		this.desk = null;
		this.bar.classList.remove("is-away");
		if (anchor && this.deps.desktop()) this.standBy(anchor);
		else if (over) this.dock(over);
	}

	/** Over a menu's blur on the phone: at the bottom of the view's box, above the blur. */
	private dock(view: DOMRect): void {
		this.bar.style.left = px(view.left);
		this.bar.style.width = px(view.width);
		this.bar.style.bottom = px(window.innerHeight - view.bottom);
	}

	/** On the desktop: the capsule by the field, inside the room; out of sight while no part of the field shows. */
	private standBy(anchor: BarAnchor): void {
		const size = this.bar.getBoundingClientRect();
		const panel = this.panel?.el.offsetHeight ?? 0;
		const spot = anchor.field ? barBesideField(anchor.field, anchor.room, size, DESIGN.deskBarGap, panel) : null;
		this.bar.classList.toggle("is-away", spot === null);
		if (!spot) return;
		const origin = anchor.overMenu ? { left: 0, top: 0 } : this.parent.getBoundingClientRect();
		this.bar.style.left = px(spot.left - origin.left);
		this.bar.style.top = px(spot.top - origin.top);
		this.desk = { room: anchor.room, side: spot.side };
		this.sidePanel();
	}

	/** On the desktop the open panel takes the side of the capsule away from the field, unless it fits only on the other. */
	private sidePanel(): void {
		const panel = this.panel?.el;
		if (!panel) return;
		const side: Side = this.desk ? panelSide(this.bar.getBoundingClientRect(), this.desk.side, panel.offsetHeight, this.desk.room, DESIGN.deskBarGap) : "above";
		panel.classList.toggle("is-above", side === "above");
		panel.classList.toggle("is-below", side === "below");
	}

	/** How much room the bar takes from what shows the field: on the phone at the bottom, on the desktop under the field. */
	get room(): number {
		return this.deps.desktop() ? this.bar.getBoundingClientRect().height + 2 * DESIGN.deskBarGap : DESIGN.barHeight;
	}

	private levels(): readonly PriorityLevel[] {
		return usableLevels(this.deps.levels());
	}

	private showPlace(place: Placement): void {
		this.place.querySelector("svg")?.remove();
		this.place.prepend(icon(placeIcon(place)));
		this.placeText.textContent = placeLabel(place);
	}

	private toggle(kind: PanelKind): void {
		const wasOpen = this.panel?.kind === kind;
		this.closePanel();
		if (!wasOpen) this.openPanel(kind);
	}

	private openPanel(kind: PanelKind): void {
		const panel = el(this.bar, "div", "tc-panel tc-quick-panel is-above");
		this.panel = { kind, el: panel, picking: false };
		this.bar.dataset.panel = kind;
		this.renderPanel();
		panel.getBoundingClientRect(); // lays the panel out shrunk, so adding is-shown grows it in
		panel.classList.add("is-shown");
		this.bar.ownerDocument.addEventListener("pointerdown", this.pressOutside, true);
	}

	private closePanel(): void {
		if (!this.panel) return;
		this.panel.el.remove();
		this.panel = null;
		delete this.bar.dataset.panel;
		this.restand();
		this.bar.ownerDocument.removeEventListener("pointerdown", this.pressOutside, true);
	}

	/** The shown state changed under an open panel: it follows, or closes when its button is gone. */
	private refreshPanel(): void {
		if (!this.panel) return;
		const gone = this.panel.kind === "priority" ? this.levels().length === 0 : this.state?.place == null;
		if (gone) this.closePanel();
		else if (!this.panel.picking) this.renderPanel();
	}

	private renderPanel(): void {
		const panel = this.panel;
		if (!panel) return;
		clear(panel.el);
		panel.el.classList.toggle("is-picker", panel.picking);
		if (panel.kind === "priority") this.renderLevels(panel.el);
		else if (panel.picking) this.renderPicker(panel.el);
		else this.renderPlaces(panel.el);
		this.restand();
	}

	/** A panel opened, closed or changed its height: the desktop capsule takes the side of the field with room for both. */
	private restand(): void {
		if (this.desk && this.anchor) this.follow(this.anchor);
		else this.sidePanel();
	}

	private picked(action: () => void): () => void {
		return () => {
			this.closePanel();
			action();
		};
	}

	private renderLevels(parent: HTMLElement): void {
		const current = this.state?.priority ?? null;
		const specs = this.levels().map((level): MenuTileSpec => {
			const on = level.prefix === current?.prefix;
			return { label: level.prefix, icon: "priority", color: level.color, on, onPick: this.picked(() => this.deps.onPriority(on ? null : level.prefix)) };
		});
		tileGroup(parent, "is-priority", tileRows(specs));
	}

	private renderPlaces(parent: HTMLElement): void {
		const current = this.state?.place ?? null;
		const fixed = FIXED_PLACES.map(({ kind, label }): MenuTileSpec => {
			const placement: Placement = { kind };
			const on = current?.kind === kind;
			return { label, icon: kind, on, onPick: this.picked(() => (on ? undefined : this.deps.onPlace(placement))) };
		});
		const date: MenuTileSpec = {
			label: "Date",
			icon: "calendar",
			on: current?.kind === "date",
			onPick: () => {
				if (!this.panel) return;
				this.panel.picking = true;
				this.renderPanel();
			},
		};
		tileGroup(parent, "is-place", [[...fixed, date]]);
	}

	private renderPicker(parent: HTMLElement): void {
		const today = this.deps.today();
		const current = this.state?.place ?? null;
		const chosen = current?.kind === "date" ? current.date : null;
		new MonthPicker(el(parent, "div"), {
			month: chosen ?? today,
			today,
			selected: chosen,
			onPick: (day) => {
				const placement: Placement = day === today ? { kind: "now" } : { kind: "date", date: day };
				this.picked(() => (current && samePlacement(current, placement) ? undefined : this.deps.onPlace(placement)))();
			},
		});
	}
}
