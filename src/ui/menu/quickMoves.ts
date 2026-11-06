import type { QuickMove, QuickMoveId } from "../../application/contracts";
import type { LocalDate } from "../types";

export interface MoveTile {
	readonly id: QuickMoveId;
	readonly label: string;
	readonly icon: "now" | "tomorrow" | "calendar";
	/** The day it puts the task off to; Pick a date asks for it. */
	readonly date: LocalDate | null;
}

const LOOKS: Readonly<Record<QuickMoveId, Pick<MoveTile, "label" | "icon">>> = {
	today: { label: "Today", icon: "now" },
	tomorrow: { label: "Tomorrow", icon: "tomorrow" },
	pick: { label: "Pick a date", icon: "calendar" },
};

/** The menu's moves as tiles: their names and icons. */
export function moveTiles(moves: readonly QuickMove[]): readonly MoveTile[] {
	return moves.map((move) => ({ ...move, ...LOOKS[move.id] }));
}
