import type { UndoService } from "../../core/application/contracts";
import { el } from "./dom";
import { Button } from "./kit/Button";
import { spinner } from "./menu/MenuPanel";

export interface BottomCapsuleActions {
	onUndo(): void;
	/** «⋯»: a menu over the capsule, which it is given. */
	onMore(capsule: HTMLElement): void;
}

/** Something «⋯» started that is still under way (the assistant waiting for an answer), and when that changes. */
export interface BusySign {
	readonly busy: boolean;
	onChange(listener: () => void): () => void;
}

/**
 * The capsule opposite the plus: Undo takes the last action back and stays dim while there is none; «⋯» opens a menu over
 * it, and its dots turn into a spinning ring while something it started runs.
 */
export class BottomCapsule {
	readonly el: HTMLElement;
	private readonly undoButton: Button;
	private readonly moreButton: Button;
	private readonly unsubscribe: (() => void)[] = [];

	constructor(
		parent: HTMLElement,
		private readonly undo: UndoService,
		actions: BottomCapsuleActions,
		private readonly running?: BusySign,
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
		this.moreButton = Button.create(this.el, { kind: "icon", label: "More", icon: "more", cls: "tc-more-open", onPress: () => actions.onMore(this.el) });
		if (running) {
			spinner(this.moreButton.el);
			this.unsubscribe.push(running.onChange(() => this.show()));
		}
		this.unsubscribe.push(undo.onChange(() => this.show()));
		this.show();
	}

	destroy(): void {
		this.unsubscribe.forEach((stop) => stop());
		this.el.remove();
	}

	private show(): void {
		this.undoButton.setOff(!this.undo.canUndo());
		this.moreButton.el.classList.toggle("is-busy", this.running?.busy === true);
	}
}
