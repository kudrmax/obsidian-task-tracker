import type { FieldEvents, FieldFactory, IslandField } from "../../obsidian/ui/next/drivers/islands";

/** A title field where there is no Obsidian: an input standing in for its editor, which the test types into and presses keys on. */
export interface FakeField extends IslandField {
	readonly input: HTMLInputElement;
	readonly events: FieldEvents;
	/** What a person types: the text, told as typed. */
	type(text: string): void;
}

/** The fields made, the last one first: what the test reaches. */
export function fakeTitleFields(): { readonly factory: FieldFactory; readonly made: FakeField[] } {
	const made: FakeField[] = [];
	const factory: FieldFactory = (doc, events) => {
		const el = doc.createElement("div");
		const input = el.appendChild(doc.createElement("input"));
		let destroyed = false;
		const blur = () => events.blurred();
		input.addEventListener("blur", blur);
		const field: FakeField = {
			el,
			input,
			events,
			get text() {
				return input.value;
			},
			get focused() {
				return !destroyed && doc.activeElement === input;
			},
			setText(text) {
				input.value = text;
			},
			setPlaceholder(text) {
				input.placeholder = text;
			},
			focusEnd() {
				input.focus();
			},
			refocus() {
				input.focus();
			},
			destroy() {
				destroyed = true;
				input.removeEventListener("blur", blur);
				el.remove();
			},
			type(text) {
				input.value = text;
				events.typed(text);
			},
		};
		made.unshift(field);
		return field;
	};
	return { factory, made };
}
