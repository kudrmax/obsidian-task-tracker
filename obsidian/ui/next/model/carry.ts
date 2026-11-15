import type { DropColumn, DropOrigin, GapPlace, ListPlace, ProjectsDrop } from "../../../../core/application/contracts";

/** A row of a list as measured at the lift (P4): its box in the stack's content pixels, so a scroll moves nothing in it. */
export interface MeasuredRow {
	readonly key: string;
	readonly top: number;
	readonly height: number;
	readonly left: number;
	readonly width: number;
}

/** A list as measured at the lift: where it stands across and down (content pixels) and its rows' boxes. */
export interface MeasuredList {
	/** The list's column (`DropColumn`), or `projects` for By subprojects' parts. */
	readonly column: DropColumn | "projects";
	readonly left: number;
	readonly width: number;
	readonly top: number;
	readonly bottom: number;
	readonly rows: readonly MeasuredRow[];
}

/** What the browser alone knows of the lists at the lift, handed to the model as data (`measured`). */
export interface CarryGeometry {
	readonly lists: readonly MeasuredList[];
	/** A subtask's step in, px (`--tc-subtask-indent`). */
	readonly indent: number;
	readonly cardHeight: number;
	readonly cardGap: number;
	/** The drop line's dot across (`--tc-drop-dot`). */
	readonly dot: number;
}

/**
 * Where the carried cards would go now: a gap of a list (`gap`, the line shown there), what a drop there means
 * (`drop`), and the empty section's plate it lights instead of the
 * line. Null over nothing that takes the cards.
 */
export interface CarryTarget {
	readonly column: DropColumn | "projects";
	readonly gap: GapPlace;
	/** What a drop here writes: a place of a funnel's list (`tasks.drop`), or of By subprojects' parts (`tasks.dropInProjects`); null for none (the card's own place). */
	readonly drop: { readonly kind: "list"; readonly column: DropColumn; readonly place: ListPlace | null } | { readonly kind: "projects"; readonly place: ListPlace } | null;
	/** The No tasks plate lit (its row key); the line then does not show. */
	readonly plate: string | null;
	/** The line through the gap: from `left` to `right` at `y`, content pixels. Null when it does not show. */
	readonly line: { readonly left: number; readonly right: number; readonly y: number } | null;
}

/**
 * A card carried in the block (P6): the cards it carries by their ids (under the finger first), where it was taken
 * from, how the finger holds it, the geometry measured at the lift, the target under the finger and its phase. While a
 * carry stands, `model.pinned` holds the lists as they stood at the lift.
 */
export interface CarryModel {
	/** The row key of the card under the finger: the task's id (By subprojects, the row's id). */
	readonly id: string;
	/** Every carried task's id, the one under the finger first. */
	readonly ids: readonly string[];
	/** Every carried card's row key in the snapshot: they wait as dashed places where they stood. */
	readonly rows: readonly string[];
	/** The rows of their subtasks: folded away from the snapshot while they are carried. */
	readonly folded: readonly string[];
	/** Where each carried task comes from, the one under the finger first (`acceptsDrop`). */
	readonly origins: readonly DropOrigin[];
	/** By subprojects: what the core takes for the carried rows (`ProjectsCard.drop`). */
	readonly cards: readonly ProjectsDrop[];
	/** Where the finger holds the card, from its top left; a list card hangs by its middle for the gap (`carriedMiddle`). */
	readonly grab: { readonly dx: number; readonly dy: number };
	/** The card's box at the lift (screen pixels): the float starts as it, and a cancel flies back to its place. */
	readonly box: { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
	readonly geometry: CarryGeometry | null;
	readonly target: CarryTarget | null;
	/** `carried`: under the finger; `landing`: let go, the float flies to the dropped card; `returning`: flies back; `gone`: the carried task left the file, the float fades. */
	readonly phase: "carried" | "landing" | "returning" | "gone";
	/** The card the float lands on once let go (its row key in the new lists). */
	readonly lands: string | null;
}

/** The carry's messages: the press's gestures as the recognizer read them, the geometry, the target, the flight's end. */
export type CarryMsg =
	/** A card tapped (released before anything started): its menu, a pick, a fold, as the part and the keys held say. */
	| { readonly kind: "tap"; readonly key: string; readonly act: string; readonly mod: boolean; readonly shift: boolean }
	/** A right click on a card: its menu, or the picked cards' when it is one of several picked. */
	| { readonly kind: "context"; readonly key: string }
	/** A card lifted at the finger (screen pixels), the card's box read at the lift (the float starts as it). */
	| { readonly kind: "lift"; readonly key: string; readonly at: { readonly x: number; readonly y: number }; readonly box: CarryModel["box"] }
	/** The picked cards that go along with the one lifted (`tasks.carried`), by their ids: the carry starts with them. */
	| { readonly kind: "along"; readonly key: string; readonly at: { readonly x: number; readonly y: number }; readonly box: CarryModel["box"]; readonly ids: readonly string[] }
	| { readonly kind: "measured"; readonly geometry: CarryGeometry }
	/** The target under the finger changed (the host reads it through `targetAt` on every move, telling only a change). */
	| { readonly kind: "over"; readonly target: CarryTarget | null }
	| { readonly kind: "drop" }
	/** Let go nowhere, called off, or the pointer lost: the card flies back. */
	| { readonly kind: "cancel" }
	/** The float's flight ended: the carry is over and the lists draw as they stand. */
	| { readonly kind: "landed" };
