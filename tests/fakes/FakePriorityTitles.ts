import type { LabelLevel, PriorityLevel, TaskService } from "../../src/application/contracts";
import { draftMarksOf } from "../../src/application/marks";
import { typedMarks } from "../../src/domain/Marks";
import { isBlankTitle, priorityOfText, usableLevels, withPriority } from "../../src/domain/Priority";

/** What the task service answers about the levels and a typed title, over `levels` and `labels` as the settings hold them. */
export function priorityTitles(levels: readonly PriorityLevel[], labels: readonly LabelLevel[] = []): Pick<TaskService, "priorityLevels" | "parseTitle" | "isBlank" | "withPriority" | "draftMarks"> {
	const usable = usableLevels(levels);
	const prefixes = usable.map((level) => level.prefix);
	return {
		priorityLevels: () => usable,
		parseTitle: (text) => {
			const parsed = priorityOfText(text, prefixes);
			return { text: parsed.text, priority: usable.find((level) => level.prefix === parsed.priority) ?? null };
		},
		isBlank: (text) => isBlankTitle(text, prefixes),
		withPriority: (text, prefix) => withPriority(text, prefix, prefixes),
		draftMarks: (text, priority, chosen) => draftMarksOf(typedMarks(text, priority, chosen, prefixes), usable, labels),
	};
}
