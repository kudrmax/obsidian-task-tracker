import { el } from "../dom";

/** The blurred dark sheet over everything; a tap on it closes what it holds. */
export class Backdrop {
	readonly el: HTMLElement;
	/** Escape closes this and nothing else: Obsidian would otherwise take it as a step back. */
	private readonly onKey = (e: KeyboardEvent) => {
		if (e.key !== "Escape") return;
		e.preventDefault();
		e.stopPropagation();
		this.onClose();
	};

	constructor(private readonly onClose: () => void) {
		this.el = el(document.body, "div", "tc-backdrop");
		this.el.addEventListener("pointerdown", (e) => {
			if (e.target === this.el) onClose();
		});
		document.addEventListener("keydown", this.onKey, true);
		requestAnimationFrame(() => this.el.classList.add("is-shown"));
	}

	remove(): void {
		document.removeEventListener("keydown", this.onKey, true);
		this.el.remove();
	}
}
