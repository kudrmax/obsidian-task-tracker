import { labelTitle } from "../../../domain/Label";
import { usableLabels } from "../../../settings";
import type { TaskItem } from "../../contracts";
import { listCardMenuFrom } from "../../menus";
import { TaskLookup } from "../tasks";
import type { ActionOption } from "./option";

const REFUSED = "Couldn't add the label {name} to this task.";
const FAILED = "Couldn't move the label {name}.";

function carries(task: TaskItem | null, name: string): boolean {
	return task?.labels.some((label) => label.name === name) ?? false;
}

/**
 * The answer marked with a label, on it alone: done as Max would by hand, through the menu of the card the answer is drawn
 * on (a folded task's next step: the folded task's card) opened where the screen opens it, and `toggleLabel`, so it follows
 * the label rules wherever they go. What that menu refuses (no tile, or the tiles disabled) is refused and nothing changes.
 * Put on first; only once the task carries it, taken off every other task, closed ones too.
 */
export const answerLabel: ActionOption = {
	key: "label",
	label: "Label",
	choices: (settings) => [{ value: null, title: "None" }, ...usableLabels(settings.labels).map((label) => ({ value: label.name, title: labelTitle(label.name) }))],
	async afterAnswer(name, { task, listed }, tasks) {
		const refused = REFUSED.replace("{name}", labelTitle(name));
		const today = listed.today;
		const menu = tasks.menu(task, listCardMenuFrom(task), { today, day: today, offer: await tasks.sectionOffer(today) });
		const tile = menu.labels.tiles.find((each) => each.label.name === name);
		if (!menu.groups.includes("labels") || menu.labels.disabled || !tile) return refused;
		if (!tile.on) {
			const [marked] = await tasks.toggleLabel([task.key], name);
			if (!carries(marked, name)) return refused;
		}
		const others = new TaskLookup(await tasks.listed()).all().filter((each) => each.id !== task.id && carries(each, name));
		if (others.length > 0) await tasks.toggleLabel(others.map((each) => each.key), name);
		return null;
	},
	failedWords: (name) => FAILED.replace("{name}", labelTitle(name)),
};
