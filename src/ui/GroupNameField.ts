import { el } from "./dom";

export interface GroupNameFieldOptions {
	readonly value: string;
	/** The name as typed on Enter; null for Escape or a tap elsewhere. Called once. */
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
			if (e.key !== "Enter" && e.key !== "Escape") return;
			e.preventDefault();
			e.stopPropagation();
			finish(e.key === "Enter" ? input.value : null);
		});
		input.addEventListener("blur", () => finish(null));
		input.focus();
		input.setSelectionRange(input.value.length, input.value.length);
		return field;
	},
};
