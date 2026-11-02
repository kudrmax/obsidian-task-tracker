import type { PriorityColor } from "../../settings";
import { PROPERTY, tokenPx } from "../design";
import { el, px } from "../dom";
import { icon } from "../icons";
import { MENU_ICONS, type MenuIconName, menuIcon } from "./menuIcons";

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

/** A dot of a priority level's colour. */
export function priorityDot(parent: HTMLElement, color: PriorityColor, cls: string): HTMLElement {
	const dot = el(parent, "span", `tc-priority-dot ${cls}`);
	dot.dataset.priority = color;
	return dot;
}

/** The menu's own icons and the wheel's places, which the quick bar's place tiles wear. */
export type PlaceIconName = "inbox" | "soon" | "now" | "calendar";
export type TileIconName = MenuIconName | PlaceIconName;

function tileIcon(name: TileIconName): SVGSVGElement {
	return name in MENU_ICONS ? menuIcon(name as MenuIconName) : icon(name as PlaceIconName);
}

export interface MenuTileSpec {
	readonly label: string;
	readonly icon: TileIconName;
	/** A priority level's tile: its flag takes the level's colour, and the task's own level is `on`. */
	readonly color?: PriorityColor;
	/** The tile that stands for what is set now; a level's tile also carries the cross that takes it off. */
	readonly on?: boolean;
	readonly onPick: () => void;
}

/** A tile: the icon over the label; the level a task has carries a badge with a cross, since a tap on it takes the level off. */
function menuTile(parent: HTMLElement, spec: MenuTileSpec): HTMLButtonElement {
	const tile = el(parent, "button", "tc-menu-tile");
	if (spec.color) tile.dataset.priority = spec.color;
	tile.classList.toggle("is-on", spec.on === true);
	tile.appendChild(tileIcon(spec.icon));
	el(tile, "span", "tc-menu-tile-label", spec.label);
	if (spec.on && spec.color) el(tile, "span", "tc-menu-badge").appendChild(menuIcon("cross"));
	tile.addEventListener("click", spec.onPick);
	return tile;
}

/** A group of tiles, row by row; a label too long for its tile starts at its left and fades out at the right. */
export function tileGroup(parent: HTMLElement, kind: string, rows: readonly (readonly MenuTileSpec[])[]): HTMLElement {
	const group = el(parent, "div", `tc-menu-tiles ${kind}`);
	for (const specs of rows) {
		const row = el(group, "div", "tc-menu-tile-row");
		for (const spec of specs) menuTile(row, spec);
	}
	for (const label of group.querySelectorAll<HTMLElement>(".tc-menu-tile-label")) label.classList.toggle("is-long", label.scrollWidth > label.clientWidth);
	return group;
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

/** The part of the window a menu may take: inside the margin, clear of the phone's status bar and home indicator. */
export interface MenuRoom {
	readonly top: number;
	readonly bottom: number;
	readonly right: number;
	readonly windowHeight: number;
}

export function menuRoom(): MenuRoom {
	const probe = el(document.body, "div", "tc-safe-probe");
	const style = getComputedStyle(probe);
	const margin = tokenPx(probe, "--tc-whole-margin");
	const room: MenuRoom = {
		top: (parseFloat(style.paddingTop) || 0) + margin,
		bottom: window.innerHeight - (parseFloat(style.paddingBottom) || 0) - margin,
		right: window.innerWidth,
		windowHeight: window.innerHeight,
	};
	probe.remove();
	return room;
}

/**
 * Puts a fixed panel under `anchor`, aligned to its left edge, or over it when it would not fit below; the sheet adds the
 * gap. When it fits on neither side, it goes under the anchor raised as far as it takes, never past the room's top, and
 * scrolls what still doesn't fit. Returns how far the anchor is to be raised. The panel is measured by its layout, not
 * its box on screen: it is placed while it is still shrunk to grow in.
 */
export function placePanel(panel: HTMLElement, anchor: DOMRect, gap: number, room: MenuRoom): number {
	panel.style.maxHeight = "";
	panel.classList.remove("is-scrolled");
	panel.style.left = px(Math.max(0, Math.min(anchor.left, room.right - gap - panel.offsetWidth)));
	const height = panel.offsetHeight;
	const fitsBelow = anchor.bottom + gap + height <= room.bottom;
	const fitsAbove = anchor.top - gap - height >= room.top;
	const above = !fitsBelow && fitsAbove;
	const raise = fitsBelow || above ? 0 : Math.max(0, Math.min(anchor.bottom + gap + height - room.bottom, anchor.top - room.top));
	const top = anchor.bottom - raise;
	const space = room.bottom - top - gap;
	if (!above && height > space) {
		panel.style.maxHeight = px(space);
		panel.classList.add("is-scrolled");
	}
	panel.classList.toggle("is-above", above);
	panel.style.setProperty(PROPERTY.panelY, px(above ? room.windowHeight - anchor.top : top));
	return raise;
}
