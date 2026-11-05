import type { EntryPart } from "./EntryPart";
import { type Placement, type PriorityLevel, type RepeatRule, samePlacement } from "../../application/contracts";
import { DESIGN } from "../design";
import { el, px, restingTop } from "../dom";
import { Button } from "../kit/Button";
import { Panel, Picks } from "../kit/Panel";
import { markLongLabels, type MenuTileSpec, type PlaceIconName, tileGroup, tileRows } from "../menu/MenuPanel";
import { MonthPicker } from "../menu/MonthPicker";
import { placeLabel } from "../placeLabel";
import { repeatPanel } from "../repeat/RepeatPanel";
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
	readonly repeat: RepeatRule | null;
	/** The field may repeat: a subtask's field and one on the calendar may not, and have no repeat button. */
	readonly repeatable: boolean;
	/** The field writes a section's name, not a task; null where it cannot (no column with sections, a rename): no section button. */
	readonly section: boolean | null;
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
	/** The levels that mark tasks, as the panel offers them. */
	levels(): readonly PriorityLevel[];
	today(): LocalDate;
	/** The placement of a task for a day picked: Now for today, else that day. */
	placementOfDay(day: LocalDate): Placement;
	onIndent(delta: 1 | -1): void;
	/** The section button: the field switches between a task and a section's name. */
	onSection(): void;
	/** A level's prefix, or null to take the level off. */
	onPriority(prefix: string | null): void;
	onPlace(placement: Placement): void;
	/** A rule set in the repeat panel, or null to take it off. */
	onRepeat(rule: RepeatRule | null): void;
}

type PanelKind = "priority" | "repeat" | "place";

interface OpenPanel {
	readonly kind: PanelKind;
	readonly window: Panel;
	readonly el: HTMLElement;
	/** The place panel shows its month picker in place of the tiles. */
	picking: boolean;
	/** What its tiles were drawn for: drawn again only once that changes. */
	drawn: string;
}

/** The bar's own position, each property set or, when absent, left to the styles. */
type BarPosition = Partial<Record<"left" | "top" | "width" | "bottom", string>>;

const POSITION = ["left", "top", "width", "bottom"] as const;

type FixedPlace = "inbox" | "backlog" | "soon" | "now";

const FIXED_PLACES: readonly { readonly kind: FixedPlace; readonly label: string }[] = [
	{ kind: "inbox", label: "Inbox" },
	{ kind: "backlog", label: "Backlog" },
	{ kind: "soon", label: "Soon" },
	{ kind: "now", label: "Now" },
];

const GLIDING = "is-gliding";

const placeIcon = (placement: Placement): PlaceIconName => (placement.kind === "date" ? "calendar" : placement.kind);

/**
 * The bar of a task being typed: the shift buttons, the priority flag, the repeat and the place. On the phone it lies over the keyboard,
 * the shift buttons on the left, the rest on the right, and its panels open above it. On the desktop the same buttons are a
 * capsule right under the field, right edges together, or over the field where there is no room under it; its panels open
 * from it, away from the field. One panel at a time. The bar knows nothing of the entry: it shows the state it is given and
 * reports taps. A press on the bar or its panels never takes the focus from the field.
 */
export class QuickBar implements EntryPart {
	private readonly bar: HTMLElement;
	private readonly section: HTMLButtonElement;
	/** On the desktop the section button stands apart, in its own capsule under the field's left edge: it switches the field, it is no part of the task. */
	private readonly mode: HTMLElement;
	private readonly spacer: HTMLElement;
	private readonly shifts: HTMLElement;
	private readonly outdent: HTMLButtonElement;
	private readonly indent: HTMLButtonElement;
	private readonly flag: HTMLButtonElement;
	private readonly repeat: HTMLButtonElement;
	private readonly place: Button;
	private state: QuickBarState | null = null;
	/** The place the place button shows. */
	private shownPlace: Placement | null = null;
	private panel: OpenPanel | null = null;
	/** Where the desktop capsule stands: the room it was placed in and the side of the field it took. */
	private desk: { readonly room: DOMRect; readonly side: Side } | null = null;
	/** The field the bar last stood by: a panel opening or closing moves the desktop capsule to make room for it. */
	private anchor: BarAnchor | null = null;
	/** Every element the bar puts on the page on its own: what it owns, the panels inside them. */
	private readonly parts: HTMLElement[] = [];
	private readonly pressOutside = (e: Event) => {
		if (!(e.target instanceof Node) || !this.owns(e.target)) this.closePanel();
	};

	constructor(private readonly parent: HTMLElement, private readonly deps: QuickBarDeps) {
		this.bar = this.part("tc-quick-bar");
		this.section = Button.create(this.bar, { kind: "bar", label: "Section", title: "Section (⌥Tab)", icon: "section", cls: "tc-bar-section", onPress: () => this.deps.onSection() }).el;
		this.mode = this.part("tc-quick-mode");
		parent.insertBefore(this.mode, this.bar);
		this.shifts = el(this.bar, "span", "tc-bar-shifts");
		this.outdent = this.shiftButton("tc-bar-outdent", "outdent", "Move out", "Shift+Tab", -1);
		this.indent = this.shiftButton("tc-bar-indent", "indent", "Move in", "Tab", 1);
		this.spacer = el(this.bar, "span", "tc-bar-spacer");
		this.flag = Button.create(this.bar, { kind: "bar", label: "Priority", title: "Priority", icon: "priority", cls: "tc-bar-flag", onPress: () => this.toggle("priority") }).el;
		this.repeat = Button.create(this.bar, { kind: "bar", label: "Repeat", title: "Repeat", icon: "repeat", cls: "tc-bar-repeat", onPress: () => this.toggle("repeat") }).el;
		this.place = Button.create(this.bar, { kind: "bar", label: "Place", title: "Place", icon: "inbox", text: "", cls: "tc-bar-place", onPress: () => this.toggle("place") });
		this.bar.addEventListener("transitionend", (e) => {
			if (e.target === this.bar && e.propertyName === "transform") this.bar.classList.remove(GLIDING);
		});
	}

	private shiftButton(cls: string, name: "outdent" | "indent", label: string, key: string, delta: 1 | -1): HTMLButtonElement {
		return Button.create(this.shifts, { kind: "bar", label, title: `${label} (${key})`, icon: name, cls: `tc-bar-shift ${cls}`, onPress: () => this.deps.onIndent(delta) }).el;
	}

	show(state: QuickBarState): void {
		this.state = state;
		this.bar.hidden = false;
		this.bar.classList.toggle("is-desk", this.deps.desktop());
		const section = state.section === true;
		const desktop = this.deps.desktop();
		if (desktop && this.section.parentElement !== this.mode) this.mode.appendChild(this.section);
		if (!desktop && this.section.parentElement !== this.bar) this.bar.prepend(this.section);
		this.mode.hidden = !desktop || state.section === null;
		this.section.hidden = state.section === null;
		this.section.classList.toggle("is-set", section);
		this.section.setAttribute("aria-pressed", String(section));
		reclass(this.bar, "is-idle", desktop && section);
		this.spacer.hidden = section && desktop;
		this.shifts.hidden = this.outdent.hidden = this.indent.hidden = !state.indents || section;
		this.outdent.disabled = !state.canOutdent;
		this.indent.disabled = !state.canIndent;
		this.flag.hidden = this.levels().length === 0 || section;
		this.flag.classList.toggle("is-set", state.priority !== null);
		if (state.priority) this.flag.dataset.priority = state.priority.color;
		else delete this.flag.dataset.priority;
		this.repeat.hidden = !state.repeatable || section;
		this.repeat.classList.toggle("is-set", state.repeat !== null);
		this.repeat.setAttribute("aria-pressed", String(state.repeat !== null));
		this.place.el.hidden = state.place === null || section;
		if (state.place && !(this.shownPlace && samePlacement(this.shownPlace, state.place))) this.showPlace(state.place);
		if (section) this.closePanel();
		else this.refreshPanel();
	}

	/** Part of the bar: any of its parts with what is inside, its panels too. */
	owns(target: Node): boolean {
		return this.parts.some((part) => part.contains(target));
	}

	/** An element of the bar's own on the page, hidden until shown: a press on it never takes the focus from the field. */
	private part(cls: string): HTMLElement {
		const part = el(this.parent, "div", cls);
		part.hidden = true;
		for (const type of ["pointerdown", "mousedown"]) part.addEventListener(type, (e) => e.preventDefault());
		this.parts.push(part);
		return part;
	}

	hide(): void {
		this.closePanel();
		this.stopGlide();
		this.bar.hidden = true;
		this.mode.hidden = true;
		this.follow(null);
	}

	/**
	 * The bar stands by the field `anchor` gives, after the field moved, grew or scrolled or the view changed. Over a menu's
	 * blur it leaves the view for the page, above the blur; null puts it back last in the view. A `rise`: the phone keyboard
	 * has started to slide in, and the bar, already standing on it, rises that far with it from where it stood.
	 */
	follow(anchor: BarAnchor | null, rise = 0): void {
		this.anchor = anchor;
		const over = anchor?.overMenu ?? null;
		// Leaving the view for the page, or coming back, restyles the bar: that is done before it is measured.
		reclass(this.bar, "is-over", over !== null);
		const holder = over ? this.bar.ownerDocument.body : this.parent;
		if (this.bar.parentElement !== holder) holder.appendChild(this.bar);
		if (this.mode.nextElementSibling !== this.bar) holder.insertBefore(this.mode, this.bar);
		const desktop = this.deps.desktop();
		const desk = desktop ? anchor : null;
		const view = desk && !desk.overMenu ? this.parent.getBoundingClientRect() : null;
		const spot = desk && this.standBy(desk);
		this.desk = spot ? { room: spot.room, side: spot.side } : null;
		reclass(this.bar, "is-away", desk !== null && spot === null);
		const origin = desk?.overMenu || !view ? { left: 0, top: 0 } : view;
		this.position(spot ? { left: px(spot.left - origin.left), top: px(spot.top - origin.top) } : over && !desktop ? this.dock(over) : {});
		this.standMode(spot && desk?.field ? { left: px(this.modeLeft(desk.field.left, spot.left) - origin.left), top: px(spot.top - origin.top) } : null);
		if (spot) this.sidePanel();
		if (rise >= 1 && !this.bar.hidden && !desktop) this.glideFrom(rise);
	}

	/** Drawn `by` lower again, the bar slides to where it now stands in the keyboard's time and easing. */
	private glideFrom(by: number): void {
		this.stopGlide();
		this.bar.style.transform = `translateY(${px(by)})`;
		this.bar.getBoundingClientRect(); // draws it where it was, so the slide starts there
		this.bar.classList.add(GLIDING);
		this.bar.style.removeProperty("transform");
	}

	private stopGlide(): void {
		this.bar.classList.remove(GLIDING);
		this.bar.style.removeProperty("transform");
	}

	/** Under the field's left edge; for a field too narrow for both capsules, left of the bar so the two never overlap. */
	private modeLeft(fieldLeft: number, barLeft: number): number {
		const width = this.mode.getBoundingClientRect().width;
		return this.bar.classList.contains("is-idle") ? fieldLeft : Math.min(fieldLeft, barLeft - DESIGN.deskBarGap - width);
	}

	/** The section capsule on the bar's row, its left edge by the field's; out of sight with the bar. */
	private standMode(at: { readonly left: string; readonly top: string } | null): void {
		reclass(this.mode, "is-away", at === null);
		restyle(this.mode, "left", at?.left ?? null);
		restyle(this.mode, "top", at?.top ?? null);
	}

	private position(position: BarPosition): void {
		for (const property of POSITION) restyle(this.bar, property, position[property] ?? null);
	}

	/** Over a menu's blur on the phone: at the bottom of the view's box, above the blur. */
	private dock(view: DOMRect): BarPosition {
		return { left: px(view.left), width: px(view.width), bottom: `calc(${px(window.innerHeight - view.bottom)} + var(--tc-bar-bottom))` };
	}

	/** On the desktop: where the capsule stands by the field, inside the room; null while no part of the field shows, the capsule out of sight. */
	private standBy(anchor: BarAnchor): { readonly left: number; readonly top: number; readonly side: Side; readonly room: DOMRect } | null {
		if (!anchor.field) return null;
		const size = this.bar.getBoundingClientRect();
		const panel = this.panel?.el.offsetHeight ?? 0;
		const spot = barBesideField(anchor.field, anchor.room, size, DESIGN.deskBarGap, panel);
		return spot && { ...spot, room: anchor.room };
	}

	/** On the desktop the open panel takes the side of the capsule away from the field, unless it fits only on the other. */
	private sidePanel(): void {
		const panel = this.panel?.el;
		if (!panel) return;
		const side: Side = this.desk ? panelSide(this.bar.getBoundingClientRect(), this.desk.side, panel.offsetHeight, this.desk.room, DESIGN.deskBarGap) : "above";
		panel.classList.toggle("is-above", side === "above");
		panel.classList.toggle("is-below", side === "below");
	}

	/** How much room the bar takes from what shows the field: on the phone from the view's bottom up, on the desktop under the field. */
	get room(): number {
		if (this.deps.desktop()) return this.bar.getBoundingClientRect().height + 2 * DESIGN.deskBarGap;
		const bar = this.bar.getBoundingClientRect();
		return bar.height > 0 ? Math.max(DESIGN.barHeight, this.parent.getBoundingClientRect().bottom - restingTop(this.bar)) : DESIGN.barHeight;
	}

	private levels(): readonly PriorityLevel[] {
		return this.deps.levels();
	}

	private showPlace(place: Placement): void {
		this.shownPlace = place;
		this.place.setIcon(placeIcon(place));
		this.place.setText(placeLabel(place));
	}

	private toggle(kind: PanelKind): void {
		const wasOpen = this.panel?.kind === kind;
		this.closePanel();
		if (!wasOpen) this.openPanel(kind);
	}

	private openPanel(kind: PanelKind): void {
		const panel = Panel.inside(this.bar, { root: "tc-panel", cls: "tc-quick-panel is-above", picks: new Picks(() => this.closePanel()), place: () => this.restand() });
		this.panel = { kind, window: panel, el: panel.el, picking: false, drawn: "" };
		this.bar.dataset.panel = kind;
		this.renderPanel();
		panel.show();
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
		const gone = this.panel.kind === "priority" ? this.levels().length === 0 : this.panel.kind === "repeat" ? !this.state?.repeatable : this.state?.place == null;
		if (gone) this.closePanel();
		else if (!this.panel.picking && this.panel.drawn !== this.drawnKey(this.panel.kind)) this.renderPanel();
	}

	/**
	 * What a panel of `kind` shows: the levels and the field's, the places and the field's, and today for the picker. The
	 * repeat panel shows its own changes itself: it is drawn again only for another day, or once a rule is set or taken off.
	 */
	private drawnKey(kind: PanelKind): string {
		const state = this.state;
		if (kind === "repeat") return JSON.stringify([kind, state?.repeat != null, this.repeatDay()]);
		return JSON.stringify([kind, this.levels(), state?.priority?.prefix ?? null, state?.place ?? null, this.deps.today()]);
	}

	/** The day a new rule starts from: the field's own, else today. */
	private repeatDay(): LocalDate {
		const place = this.state?.place;
		return place?.kind === "date" ? place.date : this.deps.today();
	}

	private renderPanel(): void {
		const panel = this.panel;
		if (!panel) return;
		panel.drawn = this.drawnKey(panel.kind);
		panel.el.classList.toggle("is-picker", panel.picking);
		panel.window.replace((parent) => {
			if (panel.kind === "priority") this.renderLevels(parent);
			else if (panel.kind === "repeat") this.renderRepeat(parent);
			else if (panel.picking) this.renderPicker(parent);
			else this.renderPlaces(parent);
		});
	}

	/** A panel opened, closed or changed its height: the desktop capsule takes the side of the field with room for both. */
	private restand(): void {
		if (this.desk && this.anchor) this.follow(this.anchor);
		else this.sidePanel();
	}

	/** A pick in the open panel: it closes, then `action` runs. */
	private picked(action: () => void): () => void {
		return this.panel?.window.pick(action) ?? action;
	}

	private renderLevels(parent: HTMLElement): void {
		const current = this.state?.priority ?? null;
		const specs = this.levels().map((level): MenuTileSpec => {
			const on = level.prefix === current?.prefix;
			return { label: level.prefix, icon: "priority", color: level.color, on, onPick: this.picked(() => this.deps.onPriority(on ? null : level.prefix)) };
		});
		markLongLabels(tileGroup(parent, "is-priority", tileRows(specs)));
	}

	/** Every change is reported at once and the panel stays, standing again as it grows or shrinks; Remove repeat is a pick. */
	private renderRepeat(parent: HTMLElement): void {
		const rule = this.state?.repeat ?? null;
		repeatPanel(parent, {
			rule,
			day: this.repeatDay(),
			onChange: (changed) => {
				this.deps.onRepeat(changed);
				this.restand();
			},
			onRemove: rule && this.picked(() => this.deps.onRepeat(null)),
		});
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
		markLongLabels(tileGroup(parent, "is-place", [[...fixed, date]]));
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
				const placement = this.deps.placementOfDay(day);
				this.picked(() => (current && samePlacement(current, placement) ? undefined : this.deps.onPlace(placement)))();
			},
		});
	}
}

/** Puts a class on or takes it off only when that changes it: a toggle that changes nothing still writes in some DOMs. */
function reclass(target: HTMLElement, name: string, on: boolean): void {
	if (target.classList.contains(name) !== on) target.classList.toggle(name, on);
}

/** Sets a style property, or takes it off for null, only when that changes it. */
function restyle(target: HTMLElement, property: string, value: string | null): void {
	if (target.style.getPropertyValue(property) === (value ?? "")) return;
	if (value === null) target.style.removeProperty(property);
	else target.style.setProperty(property, value);
}
