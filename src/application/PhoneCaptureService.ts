import { applyOperation } from "./documentText";
import type { GroupedList } from "../domain/Lists";
import * as ops from "../domain/operations";
import type { PhoneAction } from "./PhoneReminderService";
import { settingsFrom, type TaskCalendarSettings } from "../settings";

/** The lists the phone writes a new task into. */
export type CaptureList = GroupedList;

/** A task typed or spoken on the phone, put where the plugin's quick entry would put it in that list. */
export class PhoneCaptureService {
	private readonly settings: TaskCalendarSettings;

	constructor(settingsJson: string) {
		this.settings = settingsFrom(settingsJson.trim() === "" ? null : JSON.parse(settingsJson));
	}

	/** A blank `title` changes nothing. */
	capture(text: string, list: CaptureList, title: string, now: Date): PhoneAction {
		if (title.trim() === "") return { changed: false, reason: "stale" };
		const written = applyOperation(text, this.settings, now, (doc, today, boundary) =>
			ops.createInPlace(doc, title, null, { kind: "list", list, group: null, before: null, date: null }, today, boundary),
		);
		return { changed: true, text: written };
	}
}
