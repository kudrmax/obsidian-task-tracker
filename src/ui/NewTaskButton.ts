import { el } from "./dom";
import { icon } from "./icons";

/**
 * The dashed button under a list; pressed, it runs the handler the view gives it. The container stays when the button is
 * hidden: it hosts the drag zones that take the button's place while a card is carried.
 */
export class NewTaskButton {
	readonly el: HTMLElement;
	private readonly button: HTMLElement;

	constructor(
		parent: HTMLElement,
		column: "now" | "soon" | "inbox",
		private readonly onPress: () => void,
	) {
		this.el = el(parent, "div", column === "now" ? "tc-new" : `tc-new is-${column}`);
		this.button = el(this.el, "button", "tc-new-btn");
		this.button.appendChild(icon("plus"));
		this.button.appendChild(document.createTextNode("New task"));
		this.button.addEventListener("click", onPress);
	}

	set shown(value: boolean) {
		this.button.classList.toggle("is-hidden", !value);
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
