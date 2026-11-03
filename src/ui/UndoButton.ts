import type { UndoService } from "../application/contracts";
import { el } from "./dom";
import { icon } from "./icons";

/** The round button opposite the plus: a press takes the last action back; it stays dim while there is none. */
export class UndoButton {
	private readonly button: HTMLButtonElement;
	private readonly unsubscribe: () => void;

	constructor(
		parent: HTMLElement,
		private readonly undo: UndoService,
		onPress: () => void,
	) {
		this.button = el(parent, "button", "tc-undo");
		this.button.setAttribute("aria-label", "Undo");
		this.button.appendChild(icon("undo"));
		this.button.addEventListener("click", () => {
			if (this.undo.canUndo()) onPress();
		});
		this.unsubscribe = undo.onChange(() => this.show());
		this.show();
	}

	destroy(): void {
		this.unsubscribe();
		this.button.remove();
	}

	private show(): void {
		this.button.classList.toggle("is-off", !this.undo.canUndo());
	}
}
