import { ExtraButtonComponent, Notice, Plugin, PluginSettingTab, Setting, TextComponent, type App } from "obsidian";
import type { SettingsStore } from "../application/ports";
import { formatZoomLevels, parseZoomLevels } from "../application/zoomLevelsText";
import { CARD_GAP_MAX, CARD_HEIGHT_MAX, CARD_HEIGHT_MIN, DEFAULT_SETTINGS, type GoogleSettings, type GroupSettings, PRIORITY_COLORS, type PriorityLevel, type SectionNames, type TaskCalendarSettings } from "../settings";
import { LevelEdits } from "./priorityLevels";
import { PresetEdits } from "./presetEdits";
import { formatTime } from "./dates";

export interface GoogleCalendarOption {
	readonly id: string;
	readonly title: string;
	readonly color: string;
}

export interface SettingsTabDeps {
	login(): Promise<string>;
	logout(): Promise<void>;
	listCalendars(): Promise<GoogleCalendarOption[]>;
	/** The script to paste into Scriptable. */
	scriptableLoader(): string;
}

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;

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
		this.prioritiesGroup(containerEl);
		this.sectionsGroup(containerEl);
		this.cardsGroup(containerEl);
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

	/** A row per level: its prefix, the six colours with the chosen one ringed, a bin; then Add priority. */
	private prioritiesGroup(el: HTMLElement): void {
		new Setting(el).setName("Priorities").setHeading();
		const saved = new LevelEdits(() => this.settings.priorities, (priorities) => this.plugin.update({ priorities }));
		const redrawn = new LevelEdits(() => this.settings.priorities, (priorities) => this.updateLevels(priorities));
		this.settings.priorities.forEach((level, index) => {
			const row = el.createDiv("setting-item tc-level-row");
			const prefix = new TextComponent(row).setValue(level.prefix).onChange((value) => void saved.rename(index, value));
			prefix.inputEl.addClass("tc-level-prefix");
			const swatches = row.createDiv("tc-swatches");
			for (const color of PRIORITY_COLORS) {
				const swatch = swatches.createDiv({ cls: "tc-swatch", attr: { role: "button", tabindex: "0", "aria-label": color, "data-priority": color } });
				swatch.toggleClass("is-on", color === level.color);
				swatch.addEventListener("click", () => void redrawn.recolour(index, color));
			}
			new ExtraButtonComponent(row).setIcon("trash-2").setTooltip("Delete level").onClick(() => void redrawn.remove(index));
		});
		new Setting(el)
			.setDesc("A task whose text starts with the prefix gets its colour. Levels show in this order in the task menu and in the bar shown while a task is typed.")
			.addButton((b) => b.setButtonText("Add priority").onClick(() => void redrawn.add()));
	}

	/** The `###` sections inside a list: the presets the zones offer while a task is dragged, and the name of the tasks outside any. */
	private sectionsGroup(el: HTMLElement): void {
		new Setting(el).setName("Sections").setHeading();
		const saved = new PresetEdits(() => this.settings.groups.presets, (presets) => this.plugin.update(this.groups({ presets })));
		const redrawn = new PresetEdits(() => this.settings.groups.presets, async (presets) => {
			await this.plugin.update(this.groups({ presets }));
			this.display();
		});
		const rows = el.createDiv("tc-preset-rows");
		this.settings.groups.presets.forEach((name, index) => {
			const row = rows.createDiv("setting-item tc-level-row tc-preset-row");
			const grip = new ExtraButtonComponent(row).setIcon("menu").setTooltip("Drag to reorder");
			grip.extraSettingsEl.addClass("tc-preset-grip");
			grip.extraSettingsEl.addEventListener("pointerdown", (e) => this.dragPreset(rows, row, index, e, redrawn));
			const field = new TextComponent(row).setValue(name).onChange((value) => void saved.rename(index, value));
			field.inputEl.addClass("tc-preset-name");
			new ExtraButtonComponent(row).setIcon("trash-2").setTooltip("Delete preset").onClick(() => void redrawn.remove(index));
		});
		new Setting(el)
			.setDesc("While a task is dragged, presets the list doesn’t have yet show under it as places to drop, in this order.")
			.addButton((b) => b.setButtonText("Add preset").onClick(() => void redrawn.add()));
		this.text(el, "No section", "The heading over tasks outside any section, shown once a list has sections.", this.settings.groups.ungrouped, (value) =>
			this.groups({ ungrouped: value.trim() || DEFAULT_SETTINGS.groups.ungrouped }),
		);
	}

	/** A preset's row follows the grip up and down among the others; let go, the presets take that order. */
	private dragPreset(rows: HTMLElement, row: HTMLElement, from: number, e: PointerEvent, edits: PresetEdits): void {
		if (!e.isPrimary || e.button !== 0) return;
		e.preventDefault();
		row.addClass("is-dragging");
		let to = from;
		const move = (ev: PointerEvent) => {
			if (ev.pointerId !== e.pointerId) return;
			const others = Array.from(rows.children).filter((child): child is HTMLElement => child !== row);
			to = others.filter((other) => {
				const r = other.getBoundingClientRect();
				return ev.clientY > r.top + r.height / 2;
			}).length;
			rows.insertBefore(row, others[to] ?? null);
		};
		const up = (ev: PointerEvent) => {
			if (ev.pointerId !== e.pointerId) return;
			document.removeEventListener("pointermove", move);
			document.removeEventListener("pointerup", up);
			document.removeEventListener("pointercancel", up);
			row.removeClass("is-dragging");
			if (to !== from) void edits.move(from, to);
		};
		document.addEventListener("pointermove", move);
		document.addEventListener("pointerup", up);
		document.addEventListener("pointercancel", up);
	}

	private groups(patch: Partial<GroupSettings>): Partial<TaskCalendarSettings> {
		return { groups: { ...this.settings.groups, ...patch } };
	}

	private async updateLevels(priorities: readonly PriorityLevel[]): Promise<void> {
		await this.plugin.update({ priorities });
		this.display();
	}

	/** The cards' size, the same in the list, on New task and in a stack on the timeline: they change as the slider moves. */
	private cardsGroup(el: HTMLElement): void {
		new Setting(el).setName("Cards").setHeading();
		this.slider(el, "Card height", "Pixels. The ends of a card are round: half its height.", CARD_HEIGHT_MIN, CARD_HEIGHT_MAX, this.settings.cardHeight, (cardHeight) => ({ cardHeight }));
		this.slider(el, "Gap between cards", "Pixels between cards, in the list and in a stack on the timeline.", 0, CARD_GAP_MAX, this.settings.cardGap, (cardGap) => ({ cardGap }));
	}

	private timelineGroup(el: HTMLElement): void {
		new Setting(el).setName("Timeline").setHeading();
		this.number(el, "Long press delay", "Milliseconds before a touch becomes a drag.", this.settings.longPressMs, (longPressMs) => ({ longPressMs }));
		new Setting(el)
			.setName("Day starts at")
			.setDesc("Before this hour it is still the day before: today, due dates and the timeline count from here.")
			.addDropdown((d) => {
				for (let hour = 0; hour < HOURS_PER_DAY; hour++) d.addOption(String(hour), formatTime(hour * MINUTES_PER_HOUR));
				d.setValue(String(this.settings.dayStartHour)).onChange((value) => this.plugin.update({ dayStartHour: Number(value) }));
			});
		this.number(el, "Scroll to hour", "Hour another day opens at.", this.settings.scrollToHour, (scrollToHour) => ({ scrollToHour }));
		new Setting(el)
			.setName("Zoom levels")
			.setDesc("Pixels per hour the timeline settles on after a pinch, like 28, 56, 112, 224. Zoomed out all the way, it shows the whole day instead of the smallest one. A drag snaps to 30 minutes at 28, 15 at 56, 5 from 112 on.")
			.addText((t) =>
				t.setValue(formatZoomLevels(this.settings.zoomLevels)).onChange(async (value) => {
					const zoomLevels = parseZoomLevels(value);
					if (zoomLevels) await this.plugin.update({ zoomLevels });
				}),
			);
	}

	private googleGroup(el: HTMLElement): void {
		new Setting(el).setName("Calendar sources").setHeading();
		this.number(el, "Stale after", "Minutes without an update before a source gets the orange dot.", this.settings.staleAfterMinutes, (staleAfterMinutes) => ({ staleAfterMinutes }));
		new Setting(el).setName("Google Calendar").setHeading();
		this.text(el, "Client id", "OAuth client of type Web application with the redirect URI from the README.", this.settings.google.clientId, (clientId) => this.google({ clientId }));
		new Setting(el)
			.setName("Client secret")
			.addText((t) => {
				t.inputEl.type = "password";
				t.setValue(this.settings.google.clientSecret).onChange((clientSecret) => this.plugin.update(this.google({ clientSecret })));
			});
		this.loginRow(el);
		this.number(el, "Refresh interval", "Seconds between calendar fetches while the view is open; 0 turns the timer off. Coming back to Obsidian fetches at once.", this.settings.google.refreshSeconds, (refreshSeconds) =>
			this.google({ refreshSeconds }),
		);
		if (this.settings.google.refreshToken) void this.calendarRows(el.createDiv());
	}

	private loginRow(el: HTMLElement): void {
		const loggedIn = this.settings.google.refreshToken !== "";
		const row = new Setting(el).setName(loggedIn ? "Logged in" : "Not logged in");
		row.setDesc(loggedIn ? "The token syncs to your other devices." : "Opens the browser; Google sends you back to Obsidian. The token syncs to your other devices.");
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
		new Setting(el)
			.setName("Scriptable script")
			.setDesc("Paste once into a Scriptable script named Export Work Calendar. The export it runs comes with the plugin and updates with it.")
			.addButton((b) =>
				b.setButtonText("Copy").onClick(async () => {
					await navigator.clipboard.writeText(this.deps.scriptableLoader());
					new Notice("Scriptable script copied");
				}),
			);
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

	private slider(el: HTMLElement, name: string, desc: string, min: number, max: number, value: number, patch: (value: number) => Partial<TaskCalendarSettings>): void {
		new Setting(el)
			.setName(name)
			.setDesc(desc)
			.addSlider((s) =>
				s
					.setLimits(min, max, 1)
					.setValue(value)
					.setDynamicTooltip()
					.onChange((v) => this.plugin.update(patch(v))),
			);
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
