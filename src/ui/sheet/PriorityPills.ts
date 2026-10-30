import type { PriorityLevel } from "../../settings";
import { el } from "../dom";
import { priorityDot } from "../menu/MenuPanel";
import type { SheetState } from "./sheetState";

/** None and the priority levels in a row under the tiles; the chosen one tinted and ringed. The calendar takes their place while it is open. */
export class PriorityPills {
	private readonly row: HTMLElement;
	private readonly buttons = new Map<string | null, HTMLButtonElement>();

	constructor(parent: HTMLElement, levels: readonly PriorityLevel[], onPick: (prefix: string | null) => void) {
		this.row = el(parent, "div", "tc-level-pills");
		const pill = (prefix: string | null): HTMLButtonElement => {
			const button = el(this.row, "button", "tc-level-pill");
			button.addEventListener("click", () => onPick(prefix));
			this.buttons.set(prefix, button);
			return button;
		};
		el(pill(null), "span", "", "None");
		for (const level of levels) {
			const button = pill(level.prefix);
			button.dataset.priority = level.color;
			priorityDot(button, level.color, "tc-level-pill-dot");
			el(button, "span", "", level.prefix);
		}
	}

	render(state: SheetState): void {
		this.row.classList.toggle("is-hidden", state.pickerOpen);
		for (const [prefix, button] of this.buttons) button.classList.toggle("is-on", prefix === state.priority);
	}
}
