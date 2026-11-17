import { labelTitle } from "../../../domain/Label";
import { type TaskCalendarSettings, usableLabels } from "../../../settings";
import type { AssistantOptionChoice } from "../../contracts";

/** A label option's choices: None, then each label in the settings' order. */
export function labelChoices(settings: TaskCalendarSettings): readonly AssistantOptionChoice[] {
	return [{ value: null, title: "None" }, ...usableLabels(settings.labels).map((label) => ({ value: label.name, title: labelTitle(label.name) }))];
}
