import { el } from "./dom";
import { icon } from "./icons";

/** The dashed button under a list; pressed, it opens the task screen. */
export class NewTaskButton {
	readonly el: HTMLElement;

	constructor(parent: HTMLElement, soon: boolean, onPress: () => void) {
		this.el = el(parent, "div", soon ? "tc-new is-soon" : "tc-new");
		const button = el(this.el, "button", "tc-new-btn");
		button.appendChild(icon("plus"));
		button.appendChild(document.createTextNode("New task"));
		button.addEventListener("click", onPress);
	}
}
