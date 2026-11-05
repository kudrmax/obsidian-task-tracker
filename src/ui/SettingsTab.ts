import { ExtraButtonComponent, Notice, Plugin, PluginSettingTab, Setting, TextComponent, type App } from "obsidian";
import { CARD_GAP_MAX, CARD_HEIGHT_MAX, CARD_HEIGHT_MIN, type CalendarOption, type CountField, type GoogleAccount, hexColor, isPresetColor, type Marker, PRIORITY_COLORS, type PriorityColor, type SectionNames, type SettingsForm, type SettingsService, type WorkCalendarSetup } from "../application/contracts";
import type { Theme } from "./eventColors";
import { inkOf, showPriorityColors } from "./priorityColors";
import { formatTime } from "./dates";
import { Button } from "./kit/Button";
import { el } from "./dom";
import { RowReorder } from "./RowReorder";
import { SettingsPage } from "./SettingsPage";

export interface SettingsTabDeps {
	readonly settings: SettingsService;
	readonly google: GoogleAccount;
	readonly work: WorkCalendarSetup;
}

const HOURS_PER_DAY = 24;
const MINUTES_PER_HOUR = 60;

const MARKERS: readonly (readonly [Marker, string, string])[] = [
	["dueDateMarker", "Due date marker", "Precedes the due date on a task line."],
	["slotMarker", "Slot marker", "Precedes the time slot on a task line."],
	["alarmSlotMarker", "Alarm marker", "Precedes the time slot of a task that rings as an alarm on the phone."],
	["liveSlotMarker", "Live Activity marker", "Precedes the time slot of a task the phone shows as a Live Activity on the lock screen."],
	["silentSlotMarker", "No-reminder marker", "Precedes the time slot of a task the phone does not remind of."],
	["repeatMarker", "Repeat marker", "Precedes the repeat rule on a task line."],
];

const SECTION_LABELS: Readonly<Record<keyof SectionNames, string>> = {
	inbox: "Inbox",
	now: "Now",
	soon: "Soon",
	backlog: "Backlog",
	done: "Done",
};

export class TaskCalendarSettingsTab extends PluginSettingTab {
	constructor(
		app: App,
		plugin: Plugin,
		private readonly deps: SettingsTabDeps,
	) {
		super(app, plugin);
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.prioritiesGroup(containerEl);
		this.sectionsGroup(containerEl);
		this.cardsGroup(containerEl);
		this.moreGroup(containerEl);
	}

	private get settings(): SettingsForm {
		return this.deps.settings.form();
	}

	private get service(): SettingsService {
		return this.deps.settings;
	}

	/** The set-up-once part, each on a page of its own behind a row. */
	private moreGroup(el: HTMLElement): void {
		new Setting(el).setName("More").setHeading();
		this.pageRow(el, "Calendars", "Google account and which calendars show, the work calendar from the iPhone.", (page, redraw) => this.calendarsPage(page, redraw));
		this.pageRow(el, "Day and timeline", "When a day starts, the hour a day opens at, long press, zoom levels.", (page) => this.dayPage(page));
		this.pageRow(el, "Tasks file", this.settings.tasksFile, (page) => this.tasksFilePage(page));
	}

	private pageRow(el: HTMLElement, name: string, desc: string, build: (page: HTMLElement, redraw: () => void) => void): void {
		const row = new Setting(el)
			.setName(name)
			.setDesc(desc)
			.addExtraButton((b) => b.setIcon("chevron-right"));
		row.settingEl.addClass("tc-settings-link", "mod-navigable");
		row.settingEl.addEventListener("click", () => new SettingsPage(this.app, name, build, () => this.display()).open());
	}

	private tasksFilePage(el: HTMLElement): void {
		this.text(el, "File path", "Markdown file with the task sections.", this.settings.tasksFile, (path) => this.service.setTasksFile(path));
		new Setting(el).setName("Section headings").setDesc("Heading text after ##.").setHeading();
		for (const key of Object.keys(SECTION_LABELS) as (keyof SectionNames)[]) {
			this.text(el, SECTION_LABELS[key], "", this.settings.sections[key], (name) => this.service.setSection(key, name));
		}
		new Setting(el).setName("Line markers").setDesc("Lines written with an old marker are no longer read: change them in the file by hand.").setHeading();
		for (const [marker, name, desc] of MARKERS) {
			this.text(el, name, desc, this.settings.markers[marker], (text) => this.service.setMarker(marker, text));
		}
	}

	/**
	 * A row per level: its prefix, the six colours and the circle that picks any other, the chosen one ringed, the colour's
	 * code, a card in that colour, a bin; then Add priority. The circles are drawn in the shade a card takes, so the colour
	 * here is the colour on the screen.
	 */
	private prioritiesGroup(group: HTMLElement): void {
		new Setting(group).setName("Priorities").setHeading();
		const rows = group.createDiv("tc-level-rows");
		const reorder = new RowReorder(rows, (from, to) => void this.redrawn(this.service.moveLevel(from, to)));
		this.settings.priorities.forEach((level, index) => {
			const row = rows.createDiv("setting-item tc-level-row");
			reorder.grip(row, index);
			const prefix = new TextComponent(row).setValue(level.prefix).onChange((value) => void this.service.renameLevel(index, value));
			prefix.inputEl.addClass("tc-level-prefix");
			const swatches = row.createDiv("tc-swatches");
			for (const color of PRIORITY_COLORS) {
				const swatch = Button.create(swatches, { kind: "swatch", label: color, onPress: () => void this.redrawn(this.service.recolourLevel(index, color)) });
				swatch.el.dataset.priority = color;
				swatch.setOn(color === level.color);
			}
			const custom = !isPresetColor(level.color);
			const well = el(swatches, "div", "tc-swatch-well");
			if (custom) well.dataset.priority = level.color;
			well.toggleClass("is-on", custom);
			el(well, "span", "tc-swatch-well-inner");
			const picker = well.createEl("input", { cls: "tc-swatch-well-input", type: "color", attr: { "aria-label": "Any colour" } });
			picker.value = inkOf(level.color, this.theme).toLowerCase();
			const hex = el(row, "div", "tc-level-hex");
			el(hex, "span", "tc-level-hex-mark", "#");
			const code = new TextComponent(hex).setValue(inkOf(level.color, this.theme).slice(1));
			code.inputEl.addClass("tc-level-hex-input");
			code.inputEl.setAttribute("aria-label", "Colour code");
			const preview = el(row, "div", "tc-level-preview");
			preview.dataset.priority = level.color;
			el(preview, "span", "tc-progress-dot");
			el(preview, "span", "tc-level-preview-title", "Call mom");
			el(preview, "span", "tc-level-preview-time", "10:00");
			new ExtraButtonComponent(row).setIcon("trash-2").setTooltip("Delete level").onClick(() => void this.redrawn(this.service.removeLevel(index)));
			picker.addEventListener("input", () => {
				const color = this.colorOf(picker.value);
				if (!color) return;
				this.previewLevel(index, color, preview, code);
			});
			picker.addEventListener("change", () => {
				const color = this.colorOf(picker.value);
				if (color) void this.redrawn(this.service.recolourLevel(index, color));
			});
			code.onChange((value) => {
				const color = this.colorOf(value);
				if (color) this.previewLevel(index, color, preview);
			});
			code.inputEl.addEventListener("blur", () => {
				const color = this.colorOf(code.getValue());
				if (color && color !== level.color) void this.redrawn(this.service.recolourLevel(index, color));
				else this.previewLevel(index, level.color, preview, code);
			});
			code.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") code.inputEl.blur();
			});
		});
		new Setting(group)
			.setDesc("A task whose text starts with the prefix gets its colour. Pick one of the six, open the last circle to choose any colour, or type its code. Drag a level by its grip: levels show in this order in the task menu and in the bar shown while a task is typed.")
			.addButton((b) => b.setButtonText("Add priority").onClick(() => void this.redrawn(this.service.addLevel())));
	}

	private get theme(): Theme {
		return document.body.hasClass("theme-light") ? "light" : "dark";
	}

	/** A code read as a level's colour: a preset's own shade in this theme is that preset, so it keeps its other shade. */
	private colorOf(text: string): PriorityColor | null {
		const hex = hexColor(text);
		if (!hex) return null;
		return PRIORITY_COLORS.find((preset) => inkOf(preset, this.theme) === hex) ?? hex;
	}

	/** The colour being picked, on the row's card and everywhere else, before it is saved; with `code`, its code there too. */
	private previewLevel(index: number, color: PriorityColor, preview: HTMLElement, code?: TextComponent): void {
		showPriorityColors(this.settings.priorities.map((level, i) => (i === index ? { ...level, color } : level)));
		preview.dataset.priority = color;
		code?.setValue(inkOf(color, this.theme).slice(1));
	}

	/** The `###` sections inside a list: the presets the zones offer while a task is dragged, and the name of the tasks outside any. */
	private sectionsGroup(el: HTMLElement): void {
		new Setting(el).setName("Sections").setHeading();
		const rows = el.createDiv("tc-preset-rows");
		const reorder = new RowReorder(rows, (from, to) => void this.redrawn(this.service.movePreset(from, to)));
		this.settings.presets.forEach((name, index) => {
			const row = rows.createDiv("setting-item tc-level-row tc-preset-row");
			reorder.grip(row, index);
			const field = new TextComponent(row).setValue(name).onChange((value) => void this.service.renamePreset(index, value));
			field.inputEl.addClass("tc-preset-name");
			new ExtraButtonComponent(row).setIcon("trash-2").setTooltip("Delete preset").onClick(() => void this.redrawn(this.service.removePreset(index)));
		});
		new Setting(el)
			.setDesc("While a task is dragged, presets the list doesn’t have yet show under it as places to drop, in this order.")
			.addButton((b) => b.setButtonText("Add preset").onClick(() => void this.redrawn(this.service.addPreset())));
		this.text(el, "No section", "The heading over tasks outside any section, shown once a list has sections.", this.settings.ungrouped, (name) => this.service.setUngrouped(name));
	}

	/** A change that adds, drops or reorders rows: once written, the rows are drawn anew. */
	private async redrawn(change: Promise<void>): Promise<void> {
		await change;
		this.display();
	}

	/** The cards' size, the same in the list and in a stack on the timeline: they change as the slider moves. */
	private cardsGroup(el: HTMLElement): void {
		new Setting(el).setName("Cards").setHeading();
		this.slider(el, "Card height", "Pixels. The ends of a card are round: half its height.", CARD_HEIGHT_MIN, CARD_HEIGHT_MAX, this.settings.cardHeight, (px) => this.service.setCardSize("cardHeight", px));
		this.slider(el, "Gap between cards", "Pixels between cards, in the list and in a stack on the timeline.", 0, CARD_GAP_MAX, this.settings.cardGap, (px) => this.service.setCardSize("cardGap", px));
	}

	private dayPage(el: HTMLElement): void {
		new Setting(el)
			.setName("Day starts at")
			.setDesc("Before this hour it is still the day before: today, due dates and the timeline count from here.")
			.addDropdown((d) => {
				for (let hour = 0; hour < HOURS_PER_DAY; hour++) d.addOption(String(hour), formatTime(hour * MINUTES_PER_HOUR));
				d.setValue(String(this.settings.dayStartHour)).onChange((value) => this.service.setDayStartHour(Number(value)));
			});
		this.count(el, "scrollToHour", "Scroll to hour", "Hour another day opens at.");
		this.count(el, "longPressMs", "Long press delay", "Milliseconds before a touch becomes a drag.");
		new Setting(el)
			.setName("Zoom levels")
			.setDesc("Pixels per hour, like 28, 56, 112, 224: a pinch stops wherever the fingers lift, up to the largest. Zoomed out all the way, it shows the whole day instead of the smallest one. A drag snaps to 30 minutes at 28, 15 at 56, 5 from 112 on.")
			.addText((t) => t.setValue(this.settings.zoomLevels).onChange((text) => this.service.setZoomLevels(text)));
	}

	/** The account and its calendars first, then the client they need; the work calendar; when a source counts as stale. */
	private calendarsPage(el: HTMLElement, redraw: () => void): void {
		new Setting(el).setName("Google Calendar").setHeading();
		this.loginRow(el, redraw);
		if (this.deps.google.isLoggedIn()) void this.calendarRows(el.createDiv());
		this.text(el, "Client id", "OAuth client of type Web application with the redirect URI from the README.", this.settings.googleClientId, (id) => this.service.setGoogleClientId(id));
		new Setting(el)
			.setName("Client secret")
			.addText((t) => {
				t.inputEl.type = "password";
				this.service.bindClientSecret({ setValue: (value) => t.setValue(value), onChange: (listener) => t.onChange(listener) });
			});
		this.count(el, "refreshSeconds", "Refresh interval", "Seconds between calendar fetches while the view is open; 0 turns the timer off. Coming back to Obsidian fetches at once.");
		this.workGroup(el);
		new Setting(el).setName("Both sources").setHeading();
		this.count(el, "staleAfterMinutes", "Stale after", "Minutes without an update before a source gets the orange dot.");
	}

	private loginRow(el: HTMLElement, redraw: () => void): void {
		const loggedIn = this.deps.google.isLoggedIn();
		const row = new Setting(el).setName("Account");
		if (loggedIn) row.setDesc("Logged in. The token syncs to your other devices.");
		else if (!this.settings.googleClientId) row.setDesc("Not logged in. Fill in the client id and secret below first.");
		else row.setDesc("Not logged in. Opens the browser; Google sends you back to Obsidian. The token syncs to your other devices.");
		row.addButton((b) =>
			b.setButtonText(loggedIn ? "Log out" : "Log in").onClick(async () => {
				try {
					if (loggedIn) await this.deps.google.logout();
					else await this.deps.google.login();
					redraw();
				} catch (e) {
					new Notice(`Google: ${e instanceof Error ? e.message : String(e)}`);
				}
			}),
		);
	}

	private async calendarRows(el: HTMLElement): Promise<void> {
		let calendars: readonly CalendarOption[];
		try {
			calendars = await this.deps.google.listCalendars();
		} catch (e) {
			new Setting(el).setName("Shown calendars").setDesc(`Could not load: ${e instanceof Error ? e.message : String(e)}`);
			return;
		}
		new Setting(el).setName("Shown calendars").setDesc("Which calendars to show. All of them when none is unchecked.");
		for (const calendar of calendars) {
			new Setting(el).setName(calendar.title).addToggle((t) =>
				t.setValue(this.deps.google.isShown(calendar.id)).onChange((shown) => this.deps.google.setShown(calendars, calendar.id, shown)),
			);
		}
	}

	private workGroup(el: HTMLElement): void {
		new Setting(el).setName("Work calendar").setDesc("The iPhone's calendars, exported by Scriptable.").setHeading();
		this.text(el, "File path", "JSON written by the Scriptable export.", this.settings.workCalendarFile, (path) => this.service.setWorkCalendarFile(path));
		this.text(el, "Calendar titles", "Titles to take from the file, comma-separated. Empty means all.", this.settings.workCalendars, (text) => this.service.setWorkCalendars(text));
		new Setting(el)
			.setName("Scriptable script")
			.setDesc("Paste once into a Scriptable script named Export Work Calendar. The export it runs comes with the plugin and updates with it.")
			.addButton((b) =>
				b.setButtonText("Copy").onClick(async () => {
					await navigator.clipboard.writeText(this.deps.work.scriptableLoader());
					new Notice("Scriptable script copied");
				}),
			);
	}

	private text(el: HTMLElement, name: string, desc: string, value: string, write: (value: string) => Promise<void>): void {
		new Setting(el)
			.setName(name)
			.setDesc(desc)
			.addText((t) => t.setValue(value).onChange(write));
	}

	private slider(el: HTMLElement, name: string, desc: string, min: number, max: number, value: number, write: (value: number) => Promise<void>): void {
		new Setting(el)
			.setName(name)
			.setDesc(desc)
			.addSlider((s) =>
				s
					.setLimits(min, max, 1)
					.setValue(value)
					.setDynamicTooltip()
					.onChange(write),
			);
	}

	/** A count typed as text: the service writes it when it reads as one. */
	private count(el: HTMLElement, field: CountField, name: string, desc: string): void {
		new Setting(el)
			.setName(name)
			.setDesc(desc)
			.addText((t) => t.setValue(String(this.settings[field])).onChange((text) => this.service.setCount(field, text)));
	}
}
