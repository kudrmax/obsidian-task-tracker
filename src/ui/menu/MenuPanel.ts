import { PROPERTY } from "../design";
import { el, px } from "../dom";
import { icon } from "../icons";
import { type MenuIconName, menuIcon } from "./menuIcons";

export interface MenuRowSpec {
	readonly label: string;
	readonly value?: string;
	readonly icon?: MenuIconName;
	readonly danger?: boolean;
	readonly onPick: () => void;
}

/** A row of a panel: the label, a value beside it, the icon on the right. */
export function menuRow(parent: HTMLElement, spec: MenuRowSpec, cls = "tc-menu-row"): HTMLButtonElement {
	const row = el(parent, "button", cls);
	row.classList.toggle("is-danger", spec.danger === true);
	el(row, "span", "tc-menu-label", spec.label);
	if (spec.value) el(row, "span", "tc-menu-value", spec.value);
	if (spec.icon) row.appendChild(menuIcon(spec.icon));
	row.addEventListener("click", spec.onPick);
	return row;
}

/** A group of rows; groups stand apart by a thick dark line. */
export function menuGroup(parent: HTMLElement, rows: readonly MenuRowSpec[]): HTMLElement {
	const group = el(parent, "div", "tc-menu-group");
	for (const row of rows) menuRow(group, row);
	return group;
}

/** The submenu's first row: the way back and the title. */
export function backRow(parent: HTMLElement, title: string, onBack: () => void): HTMLButtonElement {
	const row = el(parent, "button", "tc-menu-back");
	row.appendChild(icon("chevronLeft"));
	row.appendChild(document.createTextNode(title));
	row.addEventListener("click", onBack);
	return row;
}

/**
 * Puts a fixed panel under `anchor`, aligned to its left edge, or over it when it would not fit below; the sheet adds the
 * gap. The panel is measured by its layout, not its box on screen: it is placed while it is still shrunk to grow in.
 */
export function placePanel(panel: HTMLElement, anchor: DOMRect, gap: number, viewportBottom: number, viewportRight = window.innerWidth): void {
	panel.style.left = px(Math.max(0, Math.min(anchor.left, viewportRight - gap - panel.offsetWidth)));
	const fitsBelow = anchor.bottom + gap + panel.offsetHeight <= viewportBottom;
	panel.classList.toggle("is-above", !fitsBelow);
	panel.style.setProperty(PROPERTY.panelY, px(fitsBelow ? anchor.bottom : viewportBottom - anchor.top));
}
