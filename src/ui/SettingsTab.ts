import { Notice, Platform, Plugin, PluginSettingTab, Setting, type App } from "obsidian";
import type { SettingsStore } from "../application/ports";
import { formatZoomLevels, parseZoomLevels } from "../application/zoomLevelsText";
import type { GoogleSettings, SectionNames, TaskCalendarSettings } from "../settings";

export interface GoogleCalendarOption {
	readonly id: string;
	readonly title: string;
	readonly color: string;
}

export interface SettingsTabDeps {
	login(): Promise<string>;
	logout(): Promise<void>;
	listCalendars(): Promise<GoogleCalendarOption[]>;
}

const SECTION_LABELS: Readonly<Record<keyof SectionNames, string>> = {
	inbox: "Inbox section",
	now: "Now section",
	soon: "Soon section",
	backlog: "Backlog section",
	done: "Done section",
};

export class TaskCalendarSettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: Plugin & SettingsStore,
		private readonly deps: SettingsTabDeps,
	) {
		super(app, plugin);
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.tasksFileGroup(containerEl);
		this.timelineGroup(containerEl);
		this.googleGroup(containerEl);
		this.workGroup(containerEl);
	}

	private get settings(): TaskCalendarSettings {
		return this.plugin.get();
	}

	private tasksFileGroup(el: HTMLElement): void {
		new Setting(el).setName("Tasks file").setHeading();
		this.text(el, "File path", "Markdown file with the task sections.", this.settings.tasksFile, (tasksFile) => ({ tasksFile }));
		for (const key of Object.keys(SECTION_LABELS) as (keyof SectionNames)[]) {
			this.text(el, SECTION_LABELS[key], "Heading text after ##.", this.settings.sections[key], (value) => ({
				sections: { ...this.settings.sections, [key]: value },
			}));
		}
		this.text(el, "Due date marker", "Precedes the due date on a task line.", this.settings.dueDateMarker, (dueDateMarker) => ({ dueDateMarker }));
		this.text(el, "Slot marker", "Precedes the time slot on a task line.", this.settings.slotMarker, (slotMarker) => ({ slotMarker }));
	}

	private timelineGroup(el: HTMLElement): void {
		new Setting(el).setName("Timeline").setHeading();
		this.number(el, "New task duration", "Minutes a task gets when dropped on the timeline.", this.settings.newTaskMinutes, (newTaskMinutes) => ({ newTaskMinutes }));
		this.number(el, "Long press delay", "Milliseconds before a touch becomes a drag.", this.settings.longPressMs, (longPressMs) => ({ longPressMs }));
		this.number(el, "Scroll to hour", "Hour another day opens at.", this.settings.scrollToHour, (scrollToHour) => ({ scrollToHour }));
		new Setting(el)
			.setName("Zoom levels")
			.setDesc("Pixels per hour and the drag step in minutes, like 28:60, 56:30, 112:15, 224:5.")
			.addText((t) =>
				t.setValue(formatZoomLevels(this.settings.zoomLevels)).onChange(async (value) => {
					const zoomLevels = parseZoomLevels(value);
					if (zoomLevels) await this.plugin.update({ zoomLevels });
				}),
			);
	}

	private googleGroup(el: HTMLElement): void {
		new Setting(el).setName("Google Calendar").setHeading();
		this.text(el, "Client id", "OAuth client of type Desktop app.", this.settings.google.clientId, (clientId) => this.google({ clientId }));
		new Setting(el)
			.setName("Client secret")
			.addText((t) => {
				t.inputEl.type = "password";
				t.setValue(this.settings.google.clientSecret).onChange((clientSecret) => this.plugin.update(this.google({ clientSecret })));
			});
		this.loginRow(el);
		this.number(el, "Refresh interval", "Seconds between fetches while the view is open.", this.settings.google.refreshSeconds, (refreshSeconds) =>
			this.google({ refreshSeconds }),
		);
		if (this.settings.google.refreshToken) void this.calendarRows(el.createDiv());
	}

	private loginRow(el: HTMLElement): void {
		const loggedIn = this.settings.google.refreshToken !== "";
		const row = new Setting(el).setName(loggedIn ? "Logged in" : "Not logged in");
		if (!Platform.isDesktop) {
			row.setDesc("Log in on the Mac; the token syncs to the phone");
			return;
		}
		row.setDesc(loggedIn ? "The token syncs to the phone." : "Opens the browser; the token syncs to the phone.");
		row.addButton((b) =>
			b.setButtonText(loggedIn ? "Log out" : "Log in").onClick(async () => {
				try {
					if (loggedIn) await this.deps.logout();
					else await this.deps.login();
					this.display();
				} catch (e) {
					new Notice(`Google: ${e instanceof Error ? e.message : String(e)}`);
				}
			}),
		);
	}

	private async calendarRows(el: HTMLElement): Promise<void> {
		let calendars: GoogleCalendarOption[];
		try {
			calendars = await this.deps.listCalendars();
		} catch (e) {
			new Setting(el).setName("Calendars").setDesc(`Could not load: ${e instanceof Error ? e.message : String(e)}`);
			return;
		}
		new Setting(el).setName("Calendars").setDesc("Which calendars to show. All of them when none is unchecked.");
		for (const calendar of calendars) {
			new Setting(el).setName(calendar.title).addToggle((t) =>
				t.setValue(this.isShown(calendar.id)).onChange((shown) => this.plugin.update(this.google({ calendarIds: this.calendarIdsWith(calendars, calendar.id, shown) }))),
			);
		}
	}

	private isShown(id: string): boolean {
		const ids = this.settings.google.calendarIds;
		return ids.length === 0 || ids.includes(id);
	}

	private calendarIdsWith(all: readonly GoogleCalendarOption[], id: string, shown: boolean): string[] {
		const selected = new Set(all.filter((c) => this.isShown(c.id)).map((c) => c.id));
		if (shown) selected.add(id);
		else selected.delete(id);
		return all.every((c) => selected.has(c.id)) ? [] : [...selected];
	}

	private workGroup(el: HTMLElement): void {
		new Setting(el).setName("Work calendar").setHeading();
		this.text(el, "File path", "JSON written by the Scriptable export.", this.settings.workCalendarFile, (workCalendarFile) => ({ workCalendarFile }));
		this.text(el, "Calendars", "Titles to take from the file, comma-separated. Empty means all.", this.settings.workCalendarTitles.join(", "), (value) => ({
			workCalendarTitles: value.split(",").map((t) => t.trim()).filter((t) => t !== ""),
		}));
	}

	private google(patch: Partial<GoogleSettings>): Partial<TaskCalendarSettings> {
		return { google: { ...this.settings.google, ...patch } };
	}

	private text(el: HTMLElement, name: string, desc: string, value: string, patch: (value: string) => Partial<TaskCalendarSettings>): void {
		new Setting(el)
			.setName(name)
			.setDesc(desc)
			.addText((t) => t.setValue(value).onChange((v) => this.plugin.update(patch(v))));
	}

	private number(el: HTMLElement, name: string, desc: string, value: number, patch: (value: number) => Partial<TaskCalendarSettings>): void {
		new Setting(el)
			.setName(name)
			.setDesc(desc)
			.addText((t) =>
				t.setValue(String(value)).onChange(async (v) => {
					const n = Number(v);
					if (v.trim() !== "" && Number.isFinite(n) && n >= 0) await this.plugin.update(patch(n));
				}),
			);
	}
}
