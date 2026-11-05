import type { TaskItem } from "../../application/contracts";
import { addDays } from "../dates";
import type { LocalDate } from "../types";

export type MoveTileId = "today" | "tomorrow" | "pick";

export interface MoveTile {
	readonly id: MoveTileId;
	readonly label: string;
	readonly icon: "now" | "tomorrow" | "calendar";
	/** The day it puts the task off to; Pick a date asks for it. */
	readonly date: LocalDate | null;
}

/** Today, Tomorrow and Pick a date, without the day the task already stands on; a done task is put off nowhere. */
export function moveTiles(item: TaskItem, today: LocalDate): readonly MoveTile[] {
	if (!item.can.postpone) return [];
	const own = item.day;
	const tomorrow = addDays(today, 1);
	const tiles: MoveTile[] = [
		{ id: "today", label: "Today", icon: "now", date: today },
		{ id: "tomorrow", label: "Tomorrow", icon: "tomorrow", date: tomorrow },
		{ id: "pick", label: "Pick a date", icon: "calendar", date: null },
	];
	return tiles.filter((tile) => tile.date === null || tile.date !== own);
}
