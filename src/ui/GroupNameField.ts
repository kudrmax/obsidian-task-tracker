import { SectionNameEntry } from "../application/contracts";
import { el } from "./dom";

export interface GroupNameFieldOptions {
	readonly value: string;
	/** The name as typed on Enter; null for Escape or a tap elsewhere. Called once. */
	onDone(name: string | null): void;
}

/** A section's name typed in place of its header: a capsule like a card, ringed in the accent, the keyboard up. What its keys mean is SectionNameEntry's. */
export const GroupNameField = {
	open(parent: HTMLElement, opts: GroupNameFieldOptions): HTMLElement {
		const field = el(parent, "div", "tc-group-field");
		const input = el(field, "input", "tc-group-input");
		input.type = "text";
		input.placeholder = "Section name";
		input.value = opts.value;
		input.enterKeyHint = "done";
		const entry = new SectionNameEntry((name) => opts.onDone(name));
		input.addEventListener("keydown", (e) => {
			if (e.key !== "Enter" && e.key !== "Escape") return;
			e.preventDefault();
			e.stopPropagation();
			if (e.key === "Enter") entry.enter(input.value);
			else entry.escape();
		});
		input.addEventListener("blur", () => entry.blur());
		input.focus();
		input.setSelectionRange(input.value.length, input.value.length);
		return field;
	},
};
