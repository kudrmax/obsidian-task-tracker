import { ExtraButtonComponent, Notice, Plugin, PluginSettingTab, Setting, TextComponent, type App } from "obsidian";
import { hexColor, isPresetColor, type CalendarOption, type GoogleAccount, type PriorityColor, type WorkCalendarSetup } from "../application/contracts";
import type { SettingsStore } from "../application/ports";
import { CARD_GAP_MAX, CARD_HEIGHT_MAX, CARD_HEIGHT_MIN, DEFAULT_SETTINGS, type GoogleSettings, type GroupSettings, PRIORITY_COLORS, type PriorityLevel, type SectionNames, type TaskCalendarSettings } from "../settings";
import type { Theme } from "./eventColors";
import { inkOf, showPriorityColors } from "./priorityColors";
import { LevelEdits } from "./priorityLevels";
import { formatZoomLevels, parseZoomLevels } from "./zoomLevelsText";
import { PresetEdits } from "./presetEdits";
import { formatTime } from "./dates";
import { Button } from "./kit/Button";
import { el } from "./dom";

export interface SettingsTabDeps {
	readonly google: GoogleAccount;
	readonly work: WorkCalendarSetup;
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
		this.text(el, "Alarm marker", "Precedes the time slot of a task that rings as an alarm on the phone.", this.settings.alarmSlotMarker, (alarmSlotMarker) => ({ alarmSlotMarker }));
		this.text(el, "No-reminder marker", "Precedes the time slot of a task the phone does not remind of.", this.settings.silentSlotMarker, (silentSlotMarker) => ({ silentSlotMarker }));
		this.text(el, "Repeat marker", "Precedes the repeat rule on a task line.", this.settings.repeatMarker, (repeatMarker) => ({ repeatMarker }));
	}

	/**
	 * A row per level: its prefix, the six colours and the circle that picks any other, the chosen one ringed, the colour's
	 * code, a card in that colour, a bin; then Add priority. The circles are drawn in the shade a card takes, so the colour
	 * here is the colour on the screen.
	 */
	private prioritiesGroup(group: HTMLElement): void {
		new Setting(group).setName("Priorities").setHeading();
		const saved = new LevelEdits(() => this.settings.priorities, (priorities) => this.plugin.update({ priorities }));
		const redrawn = new LevelEdits(() => this.settings.priorities, (priorities) => this.updateLevels(priorities));
		this.settings.priorities.forEach((level, index) => {
			const row = group.createDiv("setting-item tc-level-row");
			const prefix = new TextComponent(row).setValue(level.prefix).onChange((value) => void saved.rename(index, value));
			prefix.inputEl.addClass("tc-level-prefix");
			const swatches = row.createDiv("tc-swatches");
			for (const color of PRIORITY_COLORS) {
				const swatch = Button.create(swatches, { kind: "swatch", label: color, onPress: () => void redrawn.recolour(index, color) });
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
			new ExtraButtonComponent(row).setIcon("trash-2").setTooltip("Delete level").onClick(() => void redrawn.remove(index));
			picker.addEventListener("input", () => {
				const color = this.colorOf(picker.value);
				if (!color) return;
				this.previewLevel(index, color, preview, code);
			});
			picker.addEventListener("change", () => {
				const color = this.colorOf(picker.value);
				if (color) void redrawn.recolour(index, color);
			});
			code.onChange((value) => {
				const color = this.colorOf(value);
				if (color) this.previewLevel(index, color, preview);
			});
			code.inputEl.addEventListener("blur", () => {
				const color = this.colorOf(code.getValue());
				if (color && color !== level.color) void redrawn.recolour(index, color);
				else this.previewLevel(index, level.color, preview, code);
			});
			code.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") code.inputEl.blur();
			});
		});
		new Setting(group)
			.setDesc("A task whose text starts with the prefix gets its colour. Pick one of the six, open the last circle to choose any colour, or type its code. Levels show in this order in the task menu and in the bar shown while a task is typed.")
			.addButton((b) => b.setButtonText("Add priority").onClick(() => void redrawn.add()));
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

	/** The cards' size, the same in the list and in a stack on the timeline: they change as the slider moves. */
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
			.setDesc("Pixels per hour, like 28, 56, 112, 224: a pinch stops wherever the fingers lift, up to the largest. Zoomed out all the way, it shows the whole day instead of the smallest one. A drag snaps to 30 minutes at 28, 15 at 56, 5 from 112 on.")
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
		if (this.deps.google.isLoggedIn()) void this.calendarRows(el.createDiv());
	}

	private loginRow(el: HTMLElement): void {
		const loggedIn = this.deps.google.isLoggedIn();
		const row = new Setting(el).setName(loggedIn ? "Logged in" : "Not logged in");
		row.setDesc(loggedIn ? "The token syncs to your other devices." : "Opens the browser; Google sends you back to Obsidian. The token syncs to your other devices.");
		row.addButton((b) =>
			b.setButtonText(loggedIn ? "Log out" : "Log in").onClick(async () => {
				try {
					if (loggedIn) await this.deps.google.logout();
					else await this.deps.google.login();
					this.display();
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
			new Setting(el).setName("Calendars").setDesc(`Could not load: ${e instanceof Error ? e.message : String(e)}`);
			return;
		}
		new Setting(el).setName("Calendars").setDesc("Which calendars to show. All of them when none is unchecked.");
		for (const calendar of calendars) {
			new Setting(el).setName(calendar.title).addToggle((t) =>
				t.setValue(this.deps.google.isShown(calendar.id)).onChange((shown) => this.deps.google.setShown(calendars, calendar.id, shown)),
			);
		}
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
					await navigator.clipboard.writeText(this.deps.work.scriptableLoader());
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
