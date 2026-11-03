import type { PriorityColor } from "../../settings";
import { PROPERTY, tokenPx } from "../design";
import { el, px } from "../dom";
import { icon, type IconName } from "../kit/icons";

/** The wheel's places, which the quick bar's place tiles wear. */
export type PlaceIconName = "inbox" | "backlog" | "soon" | "now" | "calendar";

export interface MenuRowSpec {
	readonly label: string;
	readonly value?: string;
	readonly icon?: IconName;
	readonly danger?: boolean;
	readonly onPick: () => void;
}

/** A row of a panel: the label, a value beside it, the icon on the right. */
export function menuRow(parent: HTMLElement, spec: MenuRowSpec, cls = "tc-menu-row"): HTMLButtonElement {
	const row = el(parent, "button", cls);
	row.classList.toggle("is-danger", spec.danger === true);
	el(row, "span", "tc-menu-label", spec.label);
	if (spec.value) el(row, "span", "tc-menu-value", spec.value);
	if (spec.icon) row.appendChild(icon(spec.icon));
	row.addEventListener("click", spec.onPick);
	return row;
}

/** A dot of a priority level's colour. */
export function priorityDot(parent: HTMLElement, color: PriorityColor, cls: string): HTMLElement {
	const dot = el(parent, "span", `tc-priority-dot ${cls}`);
	dot.dataset.priority = color;
	return dot;
}

export interface MenuTileSpec {
	readonly label: string;
	readonly icon: IconName;
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
	tile.appendChild(icon(spec.icon));
	el(tile, "span", "tc-menu-tile-label", spec.label);
	if (spec.on && spec.color) el(tile, "span", "tc-menu-badge").appendChild(icon("cross"));
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
	return group;
}

export interface MenuAskSpec {
	/** What the question does to the task, its name after it: «Delete “…”?». */
	readonly verb: string;
	readonly title: string;
	readonly confirm: string;
	readonly icon: IconName;
	/** The confirming button in the danger colour: what it does can't be taken back. */
	readonly danger: boolean;
	readonly onCancel: () => void;
	readonly onConfirm: () => void;
}

/** A question in place of what asked it: one line naming the task, a too long name fading out, then Cancel and the confirming button. */
export function askGroup(parent: HTMLElement, spec: MenuAskSpec): HTMLElement {
	const group = el(parent, "div", "tc-menu-ask");
	group.classList.toggle("is-danger", spec.danger);
	const question = el(group, "div", "tc-menu-ask-question");
	el(question, "span", "", `${spec.verb} “`);
	el(question, "span", "tc-menu-ask-title", spec.title);
	el(question, "span", "", "”?");
	const buttons = el(group, "div", "tc-menu-ask-buttons");
	el(buttons, "button", "tc-menu-ask-btn tc-menu-ask-cancel", "Cancel").addEventListener("click", spec.onCancel);
	const confirm = el(buttons, "button", "tc-menu-ask-btn tc-menu-ask-confirm");
	confirm.appendChild(icon(spec.icon));
	confirm.appendChild(document.createTextNode(spec.confirm));
	confirm.addEventListener("click", spec.onConfirm);
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

/** A tile's label too long for its tile, and a question's task name too long for its line, is marked, all in one layout once the panel is built: tiles mark no label as they are made. */
export function markLongLabels(panel: HTMLElement): void {
	const labels = [...panel.querySelectorAll<HTMLElement>(".tc-menu-tile-label, .tc-menu-ask-title")];
	const long = labels.map((label) => label.scrollWidth > label.clientWidth);
	labels.forEach((label, i) => label.classList.toggle("is-long", long[i]));
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
 * How many of a panel's groups stand over the anchor: none (the panel under it), all (over it), or the first few, the
 * rest under it, when the whole fits on neither side. `cuts` are the heights of the panel down to each inner border
 * between groups, `total` its whole height. The first way that fits wins, in that order and with the fewest groups over
 * the anchor; when none fits, the one that leaves the least to scroll. A panel that can't split goes whole to one side.
 */
export function groupsAbove(cuts: readonly number[], total: number, above: number, below: number, canSplit: boolean): number {
	const groups = cuts.length + 1;
	const over = (height: number, space: number) => Math.max(0, height - space);
	const ways = [
		{ count: 0, overflow: over(total, below) },
		{ count: groups, overflow: over(total, above) },
		...(canSplit ? cuts.map((cut, i) => ({ count: i + 1, overflow: over(cut, above) + over(total - cut, below) })) : []),
	];
	return (ways.find((way) => way.overflow === 0) ?? ways.reduce((best, way) => (way.overflow < best.overflow ? way : best))).count;
}

/** A part of a panel taller than its space keeps to it and scrolls. */
function keepWithin(part: HTMLElement, space: number): void {
	const scrolls = part.offsetHeight > space;
	part.style.maxHeight = scrolls ? px(Math.max(0, space)) : "";
	part.classList.toggle("is-scrolled", scrolls);
}

/**
 * Puts a fixed panel under `anchor`, aligned to its left edge, or over it when it would not fit below; the sheet adds the
 * gap. When it fits on neither side and there is an `upper` part to take them, its first groups stand over the anchor
 * and the rest under it (see groupsAbove); a part that still doesn't fit scrolls. The anchor never moves. The panel is
 * measured by its layout, not its box on screen: it is placed while it is still shrunk to grow in. `keepAbove` keeps that
 * many groups over the anchor, as they stood, for a panel that changes in place and must not jump.
 */
export function placePanel(panel: HTMLElement, anchor: DOMRect, gap: number, room: MenuRoom, upper?: HTMLElement, keepAbove?: number): void {
	if (upper) {
		panel.prepend(...upper.children);
		upper.hidden = true;
	}
	markLongLabels(panel);
	for (const part of upper ? [panel, upper] : [panel]) {
		part.style.maxHeight = "";
		part.classList.remove("is-scrolled");
	}
	const left = px(Math.max(0, Math.min(anchor.left, room.right - gap - panel.offsetWidth)));
	const above = anchor.top - gap - room.top;
	const below = room.bottom - anchor.bottom - gap;
	const groups = [...panel.children] as HTMLElement[];
	const count = keepAbove ?? groupsAbove(groups.slice(1).map((group) => group.offsetTop), panel.offsetHeight, above, below, upper !== undefined && groups.length > 1);
	const overY = px(room.windowHeight - anchor.top);
	panel.style.left = left;
	if (count > 0 && count < groups.length && upper) {
		upper.className = panel.className;
		upper.classList.add("is-above");
		upper.style.left = left;
		upper.style.setProperty(PROPERTY.panelY, overY);
		upper.append(...groups.slice(0, count));
		upper.hidden = false;
		keepWithin(upper, above);
	}
	const whole = count === groups.length && groups.length > 0;
	panel.classList.toggle("is-above", whole);
	panel.style.setProperty(PROPERTY.panelY, whole ? overY : px(anchor.bottom));
	keepWithin(panel, whole ? above : below);
}
