import { applyOperation } from "./documentText";
import * as ops from "../domain/operations";
import type { PhoneAction } from "./PhoneReminderService";
import { settingsFrom, type TaskCalendarSettings } from "../settings";

/** The lists the phone writes a new task into: Inbox to sort later, Now for today. */
export type CaptureList = "inbox" | "now";

/** A task typed or spoken on the phone, put where the plugin's quick entry would put it in that list. */
export class PhoneCaptureService {
	private readonly settings: TaskCalendarSettings;

	constructor(settingsJson: string) {
		this.settings = settingsFrom(settingsJson.trim() === "" ? null : JSON.parse(settingsJson));
	}

	/** `description`: Markdown under the task, such as the embed of a recording; empty for none. Blank `title` changes nothing. */
	capture(text: string, list: CaptureList, title: string, description: string, now: Date): PhoneAction {
		if (title.trim() === "") return { changed: false, reason: "stale" };
		const written = applyOperation(text, this.settings, now, (doc, today, boundary) => {
			const created = ops.createInPlace(doc, title.trim(), null, { kind: "list", list, group: null, before: null, date: null }, today, boundary);
			const entry = created.insertedSince(doc);
			return entry && description.trim() !== "" ? ops.setDescription(created, entry, description) : created;
		});
		return { changed: true, text: written };
	}
}
