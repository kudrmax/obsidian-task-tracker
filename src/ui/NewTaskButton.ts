import { el } from "./dom";
import { icon } from "./icons";

/** The dashed button under a list; pressed, it opens the task screen. */
export class NewTaskButton {
	readonly el: HTMLElement;

	constructor(
		parent: HTMLElement,
		column: "now" | "soon" | "inbox",
		private readonly onPress: () => void,
	) {
		this.el = el(parent, "div", column === "now" ? "tc-new" : `tc-new is-${column}`);
		const button = el(this.el, "button", "tc-new-btn");
		button.appendChild(icon("plus"));
		button.appendChild(document.createTextNode("New task"));
		button.addEventListener("click", onPress);
	}

	/**
	 * A mouse's double click on the list's free room presses the button too: on the column and the list themselves, between
	 * and under the cards, and around the button; a card, a header or the button keeps its own clicks.
	 */
	pressOnDoubleClick(...areas: HTMLElement[]): void {
		let mouse = false;
		for (const area of [...areas, this.el]) {
			area.addEventListener("pointerdown", (e) => (mouse = e.pointerType === "mouse"));
			area.addEventListener("dblclick", (e) => {
				if (mouse && e.target === area) this.onPress();
			});
		}
	}
}
