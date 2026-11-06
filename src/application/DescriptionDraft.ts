import { DESCRIPTION_TEMPLATE } from "../domain/description";

/** What the description editor's rules keep: the description as the file had it when last read, and whether anything was typed since the last write. */
export interface DescriptionState {
	readonly file: string | null;
	readonly typed: boolean;
}

/** The editor as it stands when the file is read again: it has the focus, a write of what was typed waits. */
export interface DescriptionEditor {
	readonly focused: boolean;
	readonly pending: boolean;
}

/** A task's description opened in the editor: what it shows, the template for none. */
export function descriptionOpen(description: string | null): { readonly state: DescriptionState; readonly text: string } {
	return { state: { file: description, typed: false }, text: description ?? DESCRIPTION_TEMPLATE };
}

/** Something was typed in the editor. */
export function descriptionTyped(state: DescriptionState): DescriptionState {
	return { ...state, typed: true };
}

/**
 * Whether what the editor holds is written now: only once something was typed in it since the last write, so an editor
 * left untouched never writes an old text back over a change made elsewhere.
 */
export function descriptionSave(state: DescriptionState): { readonly state: DescriptionState; readonly write: boolean } {
	return { state: { ...state, typed: false }, write: state.typed };
}

/**
 * The file read again with `description`: the text the editor is given instead of its own, or null to keep it. A change
 * made elsewhere replaces it only while it has no focus and no write waits; what was typed then counts as gone.
 */
export function descriptionRead(state: DescriptionState, description: string | null, editor: DescriptionEditor): { readonly state: DescriptionState; readonly replace: string | null } {
	const elsewhere = description !== state.file;
	if (!elsewhere || editor.focused || editor.pending) return { state: { ...state, file: description }, replace: null };
	return { state: { file: description, typed: false }, replace: description ?? DESCRIPTION_TEMPLATE };
}

/** The full screen's description editor, by the rules above: the host debounces the typing and hands the editor's state in. */
export class DescriptionDraft {
	private state: DescriptionState;
	/** What the editor starts with. */
	readonly text: string;

	constructor(description: string | null) {
		const open = descriptionOpen(description);
		this.state = open.state;
		this.text = open.text;
	}

	typed(): void {
		this.state = descriptionTyped(this.state);
	}

	/** True: write what the editor holds now. */
	save(): boolean {
		const next = descriptionSave(this.state);
		this.state = next.state;
		return next.write;
	}

	/** The text to put in the editor, or null to keep what it shows. */
	read(description: string | null, editor: DescriptionEditor): string | null {
		const next = descriptionRead(this.state, description, editor);
		this.state = next.state;
		return next.replace;
	}
}
