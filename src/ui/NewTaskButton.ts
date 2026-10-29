import { el } from "./dom";
import { icon } from "./icons";

export interface NewTaskOptions {
	onCreate(text: string): Promise<void>;
}

/** The dashed button under a list; pressed, it becomes a card with a field that creates on Enter and stays for the next one. */
export class NewTaskButton {
	readonly el: HTMLElement;
	private input: HTMLInputElement | null = null;

	constructor(parent: HTMLElement, soon: boolean, private readonly opts: NewTaskOptions) {
		this.el = el(parent, "div", soon ? "tc-new is-soon" : "tc-new");
		this.showButton();
	}

	private showButton(): void {
		this.el.replaceChildren();
		this.input = null;
		const button = el(this.el, "button", "tc-new-btn");
		button.appendChild(icon("plus"));
		button.appendChild(document.createTextNode("New task"));
		button.addEventListener("click", () => this.showInput());
	}

	private showInput(): void {
		this.el.replaceChildren();
		const input = el(this.el, "input", "tc-new-input");
		input.type = "text";
		input.placeholder = "New task";
		input.enterKeyHint = "done";
		input.addEventListener("keydown", (e) => void this.key(e));
		input.addEventListener("blur", () => {
			if (!input.value.trim()) this.showButton();
		});
		this.input = input;
		input.focus();
	}

	private async key(e: KeyboardEvent): Promise<void> {
		const input = this.input;
		if (!input) return;
		if (e.key === "Escape") {
			e.preventDefault();
			this.showButton();
		} else if (e.key === "Enter") {
			e.preventDefault();
			const text = input.value.trim();
			if (!text) return;
			input.value = "";
			await this.opts.onCreate(text);
			this.input?.focus();
		}
	}
}
