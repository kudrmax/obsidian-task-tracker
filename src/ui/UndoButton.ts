import type { UndoService } from "../application/contracts";
import { Button } from "./kit/Button";

/** The round button opposite the plus: a press takes the last action back; it stays dim while there is none. */
export class UndoButton {
	private readonly button: Button;
	private readonly unsubscribe: () => void;

	constructor(
		parent: HTMLElement,
		private readonly undo: UndoService,
		onPress: () => void,
	) {
		this.button = Button.create(parent, {
			kind: "round",
			label: "Undo",
			icon: "undo",
			cls: "tc-undo",
			onPress: () => {
				if (this.undo.canUndo()) onPress();
			},
		});
		this.unsubscribe = undo.onChange(() => this.show());
		this.show();
	}

	destroy(): void {
		this.unsubscribe();
		this.button.el.remove();
	}

	private show(): void {
		this.button.setOff(!this.undo.canUndo());
	}
}
