import type { GroupName } from "../../../../core/application/contracts";

/** The task being typed in the block: built out by the quick entry. */
export interface EntryModel {
	readonly open: boolean;
}

/**
 * The quick entry's messages. The ones other parts send: a typing pick from a task's menu (`rename`, `subtask`), a
 * new section named from the section page (`newSection`), the plus and the plates (`atEnd`, `inSection`).
 */
export type EntryMsg =
	| { readonly kind: "rename"; readonly id: string }
	| { readonly kind: "subtask"; readonly id: string }
	| { readonly kind: "plus" }
	/** New section, from a task's Section page: the task waits at the end of its list under a field for the new section's name. */
	| { readonly kind: "newSection"; readonly id: string }
	| { readonly kind: "inSection"; readonly row: string; readonly group: GroupName; readonly list: boolean };
