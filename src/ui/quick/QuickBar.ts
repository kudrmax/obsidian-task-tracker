import type { Placement } from "../../application/contracts";
import { samePlacement } from "../../application/placements";
import { type PriorityLevel, usableLevels } from "../../settings";
import { clear, el, px } from "../dom";
import { icon } from "../icons";
import { type MenuTileSpec, type PlaceIconName, tileGroup } from "../menu/MenuPanel";
import { menuIcon } from "../menu/menuIcons";
import { MonthPicker } from "../menu/MonthPicker";
import { tileRows } from "../menu/TaskMenu";
import { placeLabel } from "../placeLabel";
import type { LocalDate } from "../types";

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

export interface QuickBarDeps {
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
 * The bar over the keyboard while a task is typed: shift buttons on the left, the priority flag and the place on the right.
 * The flag and the place open a panel above the bar, one at a time. The bar knows nothing of the entry: it shows the state
 * it is given and reports taps. A press on the bar or its panels never takes the focus from the field.
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
	private readonly pressOutside = (e: Event) => {
		if (!(e.target instanceof Node) || !this.bar.contains(e.target)) this.closePanel();
	};

	constructor(private readonly parent: HTMLElement, private readonly deps: QuickBarDeps) {
		this.bar = el(parent, "div", "tc-quick-bar");
		this.bar.hidden = true;
		for (const type of ["pointerdown", "mousedown"]) this.bar.addEventListener(type, (e) => e.preventDefault());
		this.outdent = this.shiftButton("tc-bar-outdent", "outdent", "Move out", -1);
		this.indent = this.shiftButton("tc-bar-indent", "indent", "Move in", 1);
		el(this.bar, "span", "tc-bar-spacer");
		this.flag = el(this.bar, "button", "tc-bar-flag");
		this.flag.setAttribute("aria-label", "Priority");
		this.flag.appendChild(menuIcon("priority"));
		this.flag.addEventListener("click", () => this.toggle("priority"));
		this.place = el(this.bar, "button", "tc-bar-place");
		this.place.setAttribute("aria-label", "Place");
		this.placeText = el(this.place, "span", "tc-bar-place-label");
		this.place.addEventListener("click", () => this.toggle("place"));
	}

	private shiftButton(cls: string, name: "outdent" | "indent", label: string, delta: 1 | -1): HTMLButtonElement {
		const button = el(this.bar, "button", `tc-bar-shift ${cls}`);
		button.setAttribute("aria-label", label);
		button.appendChild(icon(name));
		button.addEventListener("click", () => this.deps.onIndent(delta));
		return button;
	}

	show(state: QuickBarState): void {
		this.state = state;
		this.bar.hidden = false;
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
		this.lift(null);
	}

	/**
	 * Over a menu's blur, which lies over the whole page, the bar leaves the view for the page and stands at the bottom of
	 * `view`, the view's box, above the blur; null puts it back last in the view.
	 */
	lift(view: DOMRect | null): void {
		this.bar.classList.toggle("is-over", view !== null);
		if (view) {
			const page = this.bar.ownerDocument.body;
			if (this.bar.parentElement !== page) page.appendChild(this.bar);
			this.bar.style.left = px(view.left);
			this.bar.style.width = px(view.width);
			this.bar.style.bottom = px(window.innerHeight - view.bottom);
			return;
		}
		if (this.bar.parentElement !== this.parent) this.parent.appendChild(this.bar);
		for (const property of ["left", "width", "bottom"]) this.bar.style.removeProperty(property);
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
		this.renderPanel();
		panel.getBoundingClientRect(); // lays the panel out shrunk, so adding is-shown grows it in
		panel.classList.add("is-shown");
		this.bar.ownerDocument.addEventListener("pointerdown", this.pressOutside, true);
	}

	private closePanel(): void {
		if (!this.panel) return;
		this.panel.el.remove();
		this.panel = null;
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
