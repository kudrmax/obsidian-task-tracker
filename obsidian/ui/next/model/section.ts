import type { GroupedList } from "../../../../core/application/contracts";

/**
 * A section's header tapped (the old screen's `GroupMenu`): its menu over the block, the header standing over the sheet,
 * Rename and Remove section as the core offers them (`ListGroup.menu`).
 */
export interface SectionMenuLayer {
	readonly kind: "sectionMenu";
	readonly closing: boolean;
	/** The header's row key: the copy stands on it (`data-n-anchor`). */
	readonly head: string;
	readonly list: GroupedList;
	/** The section the menu names. */
	readonly section: string;
	readonly rename: boolean;
	readonly remove: boolean;
}

/** A section's name typed in place of its header (the old screen's `GroupNameField`): the header's row key, its list and name. */
export interface SectionRename {
	readonly head: string;
	readonly list: GroupedList;
	readonly name: string;
}

/** The input of a section's name: the field the view names, and the acts its Enter and Escape are. */
export const SECTION_FIELD = "section";

/** The section's header and menu messages. */
export type SectionMsg =
	/** A header tapped: its menu. */
	| { readonly kind: "menu"; readonly head: string }
	| { readonly kind: "rename" }
	| { readonly kind: "remove" }
	/** Enter in the name's field: the name typed. */
	| { readonly kind: "named"; readonly text: string }
	/** Escape, or the focus leaving the field: the name stays as it was. */
	| { readonly kind: "unnamed" }
	/** What the core's `sectionName.end` answered: the name to write, or none. */
	| { readonly kind: "ended"; readonly name: string | null };
