import { el } from "./dom";
import { icon } from "./icons";

/** The dashed button under a list; pressed, it opens the task screen. */
export class NewTaskButton {
	readonly el: HTMLElement;

	constructor(parent: HTMLElement, column: "now" | "soon" | "inbox", onPress: () => void) {
		this.el = el(parent, "div", column === "now" ? "tc-new" : `tc-new is-${column}`);
		const button = el(this.el, "button", "tc-new-btn");
		button.appendChild(icon("plus"));
		button.appendChild(document.createTextNode("New task"));
		button.addEventListener("click", onPress);
	}
}
