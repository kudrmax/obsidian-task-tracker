import type { NotificationCenter, VaultFiles } from "./Scriptable";
import { SlotReminders, type ReminderSettings } from "./SlotReminders";

export interface TaskNotificationSettings extends ReminderSettings {
	/** The Scriptable file bookmark on the vault folder. */
	readonly bookmark: string;
	/** The tasks file, relative to the vault. */
	readonly tasksFile: string;
}

const SOUND = "alert";

/** Keeps the phone's pending notifications equal to the reminders of the tasks file: run it whenever the file may have changed. */
export class TaskNotifications {
	private readonly reminders: SlotReminders;

	constructor(
		private readonly settings: TaskNotificationSettings,
		private readonly files: VaultFiles,
		private readonly center: NotificationCenter,
	) {
		this.reminders = new SlotReminders(settings);
	}

	/** Returns how many notifications are now pending. */
	async run(now: Date): Promise<number> {
		const vault = this.files.vaultPath(this.settings.bookmark);
		if (vault === null) throw new Error(`Нет файловой закладки "${this.settings.bookmark}" на папку vault`);
		const text = await this.files.read(`${vault}/${this.settings.tasksFile}`);
		if (text === null) throw new Error(`Нет файла задач "${this.settings.tasksFile}" в vault`);
		const reminders = this.reminders.of(text, now);

		const ours = (await this.center.allPending()).filter((n) => n.threadIdentifier === SlotReminders.THREAD);
		await this.center.removePending(ours.map((n) => n.identifier));
		const openURL = `obsidian://open?vault=${encodeURIComponent(vault.split("/").pop()!)}`;
		for (const r of reminders) {
			await this.center.schedule({ identifier: r.id, threadIdentifier: SlotReminders.THREAD, title: r.title, body: r.body, sound: SOUND, openURL, at: r.at });
		}
		return reminders.length;
	}
}
