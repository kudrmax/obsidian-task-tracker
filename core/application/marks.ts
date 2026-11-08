import type { LabelLevel } from "../domain/Label";
import { markChoices, type Marks } from "../domain/Marks";
import type { PriorityColor, PriorityLevel } from "../domain/Priority";
import type { DraftMarks } from "./contracts";

/** The most colours a card of several labels is painted in: its first labels' in the settings' order. */
export const MOST_CARD_COLORS = 4;

/** The colours a task is drawn in: its priority's alone, else its labels', at most `MOST_CARD_COLORS`; the first tints it. */
export function markColors(priority: PriorityLevel | null, labels: readonly LabelLevel[]): readonly PriorityColor[] {
	return priority ? [priority.color] : labels.slice(0, MOST_CARD_COLORS).map((label) => label.color);
}

/** What the bar shows for a task typed with `marks`, over the usable `levels` and `labels` in the settings' order. */
export function draftMarksOf(marks: Marks, levels: readonly PriorityLevel[], labels: readonly LabelLevel[]): DraftMarks {
	const choices = markChoices(marks);
	const priority = levels.find((l) => l.prefix === marks.priority) ?? null;
	const chosen = labels.filter((l) => marks.labels.includes(l.name));
	return {
		priority,
		labels: chosen,
		can: { setPriority: choices.priority, setLabels: choices.labels },
		tint: markColors(priority, chosen)[0] ?? null,
		tiles: {
			levels: levels.map((mark) => ({ mark, on: mark.prefix === priority?.prefix, enabled: choices.priority })),
			labels: labels.map((mark) => ({ mark, on: chosen.includes(mark), enabled: choices.labels })),
		},
	};
}
