import { labelTitle } from "../../../domain/Label";
import { labelChoices } from "./labelChoices";
import type { ActionOption } from "./option";

const ALL_KEPT = "Every task in Today and Soon is marked {name}.";

/**
 * Tasks Max can't take now, by a label he puts on them: a task carrying it is not sent to the model, nor is any task under
 * it (a folded task's steps, an unfolded task's subtasks).
 */
export const skipLabel: ActionOption = {
	key: "skip",
	label: "Skip label",
	choices: labelChoices,
	keepsBack: {
		keeps: (name, task) => task.labels.some((label) => label.name === name),
		allKeptWords: (name) => ALL_KEPT.replace("{name}", labelTitle(name)),
	},
};
