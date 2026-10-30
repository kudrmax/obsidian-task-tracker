/** The part of Scriptable's API the scripts use: https://docs.scriptable.app. Reached through `globalThis`, as its names clash with the DOM's. */
interface ScriptableNotification {
	identifier: string;
	threadIdentifier: string;
	title: string;
	body: string;
	sound: string;
	openURL: string;
	setTriggerDate(date: Date): void;
	schedule(): Promise<void>;
}

interface ScriptableNotificationClass {
	new (): ScriptableNotification;
	allPending(): Promise<ScriptableNotification[]>;
	removePending(identifiers: string[]): Promise<void>;
}

interface ScriptableFileManager {
	bookmarkExists(name: string): boolean;
	bookmarkedPath(name: string): string;
	fileExists(path: string): boolean;
	isFileStoredIniCloud(path: string): boolean;
	downloadFileFromiCloud(path: string): Promise<void>;
	readString(path: string): string;
}

interface ScriptableAlert {
	title: string;
	message: string;
	addAction(title: string): void;
	present(): Promise<number>;
}

interface ScriptableGlobals {
	Notification: ScriptableNotificationClass;
	FileManager: { local(): ScriptableFileManager };
	Alert: new () => ScriptableAlert;
	config: { runsInApp: boolean };
	Script: { complete(): void };
}

const scriptable = globalThis as unknown as ScriptableGlobals;

export interface PendingNotification {
	readonly identifier: string;
	readonly threadIdentifier: string;
}

export interface ScheduledNotification extends PendingNotification {
	readonly title: string;
	readonly body: string;
	readonly sound: string;
	readonly openURL: string;
	readonly at: Date;
}

export interface NotificationCenter {
	allPending(): Promise<PendingNotification[]>;
	removePending(identifiers: string[]): Promise<void>;
	schedule(notification: ScheduledNotification): Promise<void>;
}

export interface VaultFiles {
	/** The vault folder a Scriptable file bookmark points at, or null without the bookmark. */
	vaultPath(bookmark: string): string | null;
	/** A file's text, or null when there is no such file. */
	read(path: string): Promise<string | null>;
}

export class ScriptableNotificationCenter implements NotificationCenter {
	allPending(): Promise<PendingNotification[]> {
		return scriptable.Notification.allPending();
	}

	removePending(identifiers: string[]): Promise<void> {
		return scriptable.Notification.removePending(identifiers);
	}

	async schedule(n: ScheduledNotification): Promise<void> {
		const notification = new scriptable.Notification();
		notification.identifier = n.identifier;
		notification.threadIdentifier = n.threadIdentifier;
		notification.title = n.title;
		notification.body = n.body;
		notification.sound = n.sound;
		notification.openURL = n.openURL;
		notification.setTriggerDate(n.at);
		await notification.schedule();
	}
}

export class ScriptableVaultFiles implements VaultFiles {
	private readonly fm = scriptable.FileManager.local();

	vaultPath(bookmark: string): string | null {
		return this.fm.bookmarkExists(bookmark) ? this.fm.bookmarkedPath(bookmark) : null;
	}

	async read(path: string): Promise<string | null> {
		if (!this.fm.fileExists(path)) return null;
		if (this.fm.isFileStoredIniCloud(path)) await this.fm.downloadFileFromiCloud(path);
		return this.fm.readString(path);
	}
}

export async function showInApp(title: string, message: string): Promise<void> {
	if (!scriptable.config.runsInApp) return;
	const alert = new scriptable.Alert();
	alert.title = title;
	alert.message = message;
	alert.addAction("OK");
	await alert.present();
}

export function completeScript(): void {
	scriptable.Script.complete();
}
