import { DEFAULT_SETTINGS, type GoogleSettings, type GroupSettings, PRIORITY_COLORS, type PriorityLevel, type SectionNames, type TaskCalendarSettings } from "../settings";
import type { CardField, CountField, Marker, PriorityColor, SecretField, SettingsForm, SettingsService } from "./contracts";
import type { SettingsStore } from "./ports";
import { formatZoomLevels, parseZoomLevels } from "./zoomLevelsText";

/** A count as typed: a number of zero or more, or nothing. */
function countOf(text: string): number | null {
	const n = Number(text);
	return text.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
}

/** The settings tab's commands over the settings store; see SettingsService. */
export class SettingsServiceImpl implements SettingsService {
	constructor(private readonly store: SettingsStore) {}

	form(): SettingsForm {
		const s = this.settings;
		return {
			tasksFile: s.tasksFile,
			sections: s.sections,
			markers: {
				dueDateMarker: s.dueDateMarker,
				slotMarker: s.slotMarker,
				alarmSlotMarker: s.alarmSlotMarker,
				liveSlotMarker: s.liveSlotMarker,
				silentSlotMarker: s.silentSlotMarker,
				repeatMarker: s.repeatMarker,
			},
			priorities: s.priorities,
			presets: s.groups.presets,
			ungrouped: s.groups.ungrouped,
			cardHeight: s.cardHeight,
			cardGap: s.cardGap,
			longPressMs: s.longPressMs,
			dayStartHour: s.dayStartHour,
			scrollToHour: s.scrollToHour,
			zoomLevels: formatZoomLevels(s.zoomLevels),
			staleAfterMinutes: s.staleAfterMinutes,
			googleClientId: s.google.clientId,
			refreshSeconds: s.google.refreshSeconds,
			workCalendarFile: s.workCalendarFile,
			workCalendars: s.workCalendarTitles.join(", "),
		};
	}

	setTasksFile(tasksFile: string): Promise<void> {
		return this.store.update({ tasksFile });
	}

	setSection(key: keyof SectionNames, name: string): Promise<void> {
		return this.store.update({ sections: { ...this.settings.sections, [key]: name } });
	}

	setMarker(marker: Marker, text: string): Promise<void> {
		return this.store.update({ [marker]: text });
	}

	async setCount(field: CountField, text: string): Promise<void> {
		const n = countOf(text);
		if (n === null) return;
		await this.store.update(field === "refreshSeconds" ? this.google({ refreshSeconds: n }) : { [field]: n });
	}

	setCardSize(field: CardField, px: number): Promise<void> {
		return this.store.update({ [field]: px });
	}

	setDayStartHour(dayStartHour: number): Promise<void> {
		return this.store.update({ dayStartHour });
	}

	async setZoomLevels(text: string): Promise<void> {
		const zoomLevels = parseZoomLevels(text);
		if (zoomLevels) await this.store.update({ zoomLevels });
	}

	renameLevel(index: number, prefix: string): Promise<void> {
		return this.patchLevel(index, { prefix: prefix.trim() });
	}

	recolourLevel(index: number, color: PriorityColor): Promise<void> {
		return this.patchLevel(index, { color });
	}

	removeLevel(index: number): Promise<void> {
		return this.saveLevels(this.settings.priorities.filter((_, i) => i !== index));
	}

	addLevel(): Promise<void> {
		const levels = this.settings.priorities;
		let n = levels.length + 1;
		while (levels.some((l) => l.prefix === `p${n}`)) n++;
		const color = PRIORITY_COLORS.find((c) => !levels.some((l) => l.color === c)) ?? PRIORITY_COLORS[0];
		return this.saveLevels([...levels, { prefix: `p${n}`, color }]);
	}

	renamePreset(index: number, name: string): Promise<void> {
		return this.savePresets(this.presets.map((preset, i) => (i === index ? name.trim() : preset)));
	}

	removePreset(index: number): Promise<void> {
		return this.savePresets(this.presets.filter((_, i) => i !== index));
	}

	addPreset(): Promise<void> {
		return this.savePresets([...this.presets, ""]);
	}

	movePreset(from: number, to: number): Promise<void> {
		const presets = [...this.presets];
		const [moved] = presets.splice(from, 1);
		presets.splice(to, 0, moved);
		return this.savePresets(presets);
	}

	setUngrouped(name: string): Promise<void> {
		return this.store.update(this.groups({ ungrouped: name.trim() || DEFAULT_SETTINGS.groups.ungrouped }));
	}

	setGoogleClientId(clientId: string): Promise<void> {
		return this.store.update(this.google({ clientId }));
	}

	bindClientSecret(field: SecretField): void {
		field.setValue(this.settings.google.clientSecret);
		field.onChange((clientSecret) => void this.store.update(this.google({ clientSecret })));
	}

	setWorkCalendarFile(workCalendarFile: string): Promise<void> {
		return this.store.update({ workCalendarFile });
	}

	setWorkCalendars(text: string): Promise<void> {
		return this.store.update({ workCalendarTitles: text.split(",").map((t) => t.trim()).filter((t) => t !== "") });
	}

	private get settings(): TaskCalendarSettings {
		return this.store.get();
	}

	private get presets(): readonly string[] {
		return this.settings.groups.presets;
	}

	private patchLevel(index: number, patch: Partial<PriorityLevel>): Promise<void> {
		return this.saveLevels(this.settings.priorities.map((level, i) => (i === index ? { ...level, ...patch } : level)));
	}

	private saveLevels(priorities: readonly PriorityLevel[]): Promise<void> {
		return this.store.update({ priorities });
	}

	private savePresets(presets: readonly string[]): Promise<void> {
		return this.store.update(this.groups({ presets }));
	}

	private groups(patch: Partial<GroupSettings>): Partial<TaskCalendarSettings> {
		return { groups: { ...this.settings.groups, ...patch } };
	}

	private google(patch: Partial<GoogleSettings>): Partial<TaskCalendarSettings> {
		return { google: { ...this.settings.google, ...patch } };
	}
}
