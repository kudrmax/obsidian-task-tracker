import type { UndoService } from "../application/contracts";
import { el } from "./dom";
import { Button } from "./kit/Button";

export interface BottomCapsuleActions {
	onUndo(): void;
	/** «⋯»: a menu over the capsule, which it is given. */
	onMore(capsule: HTMLElement): void;
}

/** The capsule opposite the plus: Undo takes the last action back and stays dim while there is none; «⋯» opens a menu over it. */
export class BottomCapsule {
	readonly el: HTMLElement;
	private readonly undoButton: Button;
	private readonly unsubscribe: () => void;

	constructor(
		parent: HTMLElement,
		private readonly undo: UndoService,
		actions: BottomCapsuleActions,
	) {
		this.el = el(parent, "div", "tc-capsule");
		this.undoButton = Button.create(this.el, {
			kind: "icon",
			label: "Undo",
			icon: "undo",
			cls: "tc-undo",
			onPress: () => {
				if (this.undo.canUndo()) actions.onUndo();
			},
		});
		Button.create(this.el, { kind: "icon", label: "More", icon: "more", cls: "tc-more-open", onPress: () => actions.onMore(this.el) });
		this.unsubscribe = undo.onChange(() => this.show());
		this.show();
	}

	destroy(): void {
		this.unsubscribe();
		this.el.remove();
	}

	private show(): void {
		this.undoButton.setOff(!this.undo.canUndo());
	}
}
