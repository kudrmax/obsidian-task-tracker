import { el } from "./dom";

export interface GroupNameFieldOptions {
	readonly value: string;
	/** The whole value selected, to be typed over: a rename. */
	readonly select: boolean;
	/** The trimmed name on Enter; null for an empty one, Escape, or a tap elsewhere. Called once. */
	onDone(name: string | null): void;
}

/** A section's name typed in place of its header: a capsule like a card, ringed in the accent, the keyboard up. */
export const GroupNameField = {
	open(parent: HTMLElement, opts: GroupNameFieldOptions): HTMLElement {
		const field = el(parent, "div", "tc-group-field");
		const input = el(field, "input", "tc-group-input");
		input.type = "text";
		input.placeholder = "Section name";
		input.value = opts.value;
		input.enterKeyHint = "done";
		let done = false;
		const finish = (name: string | null) => {
			if (done) return;
			done = true;
			opts.onDone(name);
		};
		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				e.preventDefault();
				const name = input.value.trim();
				finish(name === "" ? null : name);
			} else if (e.key === "Escape") finish(null);
		});
		input.addEventListener("blur", () => finish(null));
		input.focus();
		if (opts.select) input.setSelectionRange(0, input.value.length);
		return field;
	},
};
