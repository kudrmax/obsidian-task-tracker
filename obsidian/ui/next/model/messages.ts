import type { GroupName, ViewMode } from "../../../../core/application/contracts";
import type { Answers } from "./answers";
import type { CarryMsg } from "./carry";
import type { EntryMsg } from "./entry";
import type { FullMsg } from "./full";
import type { SearchMsg } from "./search";
import type { SelectMsg } from "./select";
import type { MenuMsg } from "./taskMenu";
import type { SectionMsg } from "./section";

/** A link in a title, tapped: a note opens in a new tab, an address in the browser. */
export interface Link {
	readonly kind: "note" | "url";
	readonly target: string;
}

/** What part of a card a tap landed on: the card (its menu), its subtask counter (fold), its folder mark, a link in it. */
export type CardPart = "card" | "counter" | "mark";

/**
 * A press on something the view marked (`data-n-act`), as the input driver reads it: what it is, the row it is in
 * (`data-n-key`), the value it carries (`data-n-value`). `update` turns it into the message it means.
 */
export interface Act {
	readonly act: string;
	readonly key: string | null;
	readonly value: string | null;
}

/**
 * Every message of a note's block (P2): what the user did, what the runtime told, what a driver reported. One union,
 * handled exhaustively by `update`.
 */
export type BlockMsg =
	/** A tap (or, for the sheet, a press) on what the view marked: `update` reads it as the message it means. */
	| { readonly kind: "acted"; readonly act: Act }
	/** The views the block needs, read from the replica (P2 step 3). */
	| { readonly kind: "views"; readonly answers: Answers }
	/** The file changed elsewhere and the pending calls ran again: every id the model holds follows `idMap` (P3). */
	| { readonly kind: "rebased"; readonly idMap: Readonly<Record<string, string>> }
	| { readonly kind: "undoTapped" }
	/** Cmd+Z, Cmd+Shift+Z, Cmd+F while the block holds the focus and no field does. */
	| { readonly kind: "key"; readonly key: "undo" | "redo" | "find" }
	| { readonly kind: "viewButtonTapped" }
	| { readonly kind: "moreTapped" }
	| { readonly kind: "modePicked"; readonly mode: ViewMode }
	| { readonly kind: "subprojectsPicked" }
	/** A tap outside the top layer, or Escape: it closes. */
	| { readonly kind: "layerDismissed" }
	/** The top closing layer's motion ended: it goes, and whatever it pinned is drawn as it stands (P6). */
	| { readonly kind: "layerGone" }
	| { readonly kind: "cardTapped"; readonly key: string; readonly part: CardPart }
	| { readonly kind: "linkTapped"; readonly link: Link }
	/** The No tasks plate tapped: a task typed in its section (`group`), or at the list's end (`list`). */
	| { readonly kind: "plateTapped"; readonly row: string; readonly group: GroupName; readonly list: boolean }
	| { readonly kind: "plusTapped" }
	/** «⋯»'s rows. */
	| { readonly kind: "searchPicked" }
	| { readonly kind: "selectPicked" }
	/** Each part's own messages, handled by its own update (`update/<part>.ts`). */
	| { readonly kind: "menu"; readonly msg: MenuMsg }
	| { readonly kind: "section"; readonly msg: SectionMsg }
	| { readonly kind: "entry"; readonly msg: EntryMsg }
	| { readonly kind: "full"; readonly msg: FullMsg }
	| { readonly kind: "carry"; readonly msg: CarryMsg }
	| { readonly kind: "select"; readonly msg: SelectMsg }
	| { readonly kind: "search"; readonly msg: SearchMsg }
	/** A door call failed: told in the plugin's words. */
	| { readonly kind: "failed"; readonly error: { readonly code: string; readonly message: string } };

export type BlockMsgKind = BlockMsg["kind"];
