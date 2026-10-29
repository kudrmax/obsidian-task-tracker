import { el } from "../dom";
import type { LocalDate } from "../types";
import { placementOf, type SheetState, type Tile, tileLabel } from "./sheetState";

const NS = "http://www.w3.org/2000/svg";

/** The tiles' icons as the board draws them: a tray, a sun, a calendar; and the clock of the time row. */
export const SHEET_ICONS = {
	soon: "M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5 M5.5 5h13l2 8.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-5.5z",
	now: "M12 8a4 4 0 1 1 0 8a4 4 0 1 1 0-8z M12 2.5v2 M12 19.5v2 M2.5 12h2 M19.5 12h2 M5.3 5.3l1.4 1.4 M17.3 17.3l1.4 1.4 M5.3 18.7l1.4-1.4 M17.3 6.7l1.4-1.4",
	date: "M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z M3.5 10h17 M8 3v4 M16 3v4",
	clock: "M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z M12 7.5V12l3 2",
} as const;

export function sheetIcon(name: keyof typeof SHEET_ICONS): SVGSVGElement {
	const svg = document.createElementNS(NS, "svg");
	svg.setAttribute("viewBox", "0 0 24 24");
	svg.setAttribute("fill", "none");
	svg.setAttribute("stroke", "currentColor");
	svg.setAttribute("stroke-linecap", "round");
	svg.setAttribute("stroke-linejoin", "round");
	svg.setAttribute("aria-hidden", "true");
	const path = document.createElementNS(NS, "path");
	path.setAttribute("d", SHEET_ICONS[name]);
	svg.appendChild(path);
	return svg;
}

const TILES: readonly Tile[] = ["soon", "now", "date"];

/** Soon, Now and Date in a row; the chosen one light. */
export class PlacementTiles {
	private readonly buttons = new Map<Tile, { button: HTMLButtonElement; label: HTMLElement }>();

	constructor(parent: HTMLElement, onTile: (tile: Tile) => void) {
		const row = el(parent, "div", "tc-tiles");
		for (const tile of TILES) {
			const button = el(row, "button", "tc-tile");
			button.appendChild(sheetIcon(tile));
			const label = el(button, "span", "tc-tile-label");
			button.addEventListener("click", () => onTile(tile));
			this.buttons.set(tile, { button, label });
		}
	}

	render(state: SheetState, today: LocalDate): void {
		for (const [tile, { button, label }] of this.buttons) {
			button.classList.toggle("is-on", state.tile === tile);
			label.textContent = tile === "date" ? (state.date ? tileLabel(placementOf(state, today), today) : "Date") : tileLabel({ kind: tile }, today);
		}
	}
}
