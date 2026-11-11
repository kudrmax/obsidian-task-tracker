import { googleLoggedIn } from "./googleLogin";
import { labelNameOf, usableLabelTag } from "../domain/Label";
import { hexColor, type PresetColor } from "../domain/Priority";
import { CARD_GAPS, CARD_HEIGHTS, DEFAULT_SETTINGS, type GoogleSettings, type GroupSettings, LABEL_PAINTS, type LabelLevel, PRIORITY_COLORS, type PriorityLevel, type SectionNames, type TaskCalendarSettings, usableLevels, usableResultMark } from "../settings";
import type { CountField, Marker, PriorityColor, SecretField, SettingsForm, SettingsService } from "./contracts";
import type { SettingsStore } from "./ports";
import { formatZoomLevels, parseZoomLevels } from "./timelineZoom";

/** A count as typed: a number of zero or more, or nothing. */
function countOf(text: string): number | null {
	const n = Number(text);
	return text.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
}

/** The sections' names the settings edit, in their order on the tab. */
const SECTION_ORDER: readonly (keyof SectionNames)[] = ["inbox", "now", "soon", "backlog", "done"];

/** The line markers the settings edit, in their order on the tab. */
const MARKER_ORDER: readonly Marker[] = ["dueDateMarker", "slotMarker", "alarmSlotMarker", "liveSlotMarker", "silentSlotMarker", "repeatMarker", "collapsedMarker"];

/** Day starts at: any hour of the day. */
const DAY_START_HOURS: readonly number[] = Array.from({ length: 24 }, (_, hour) => hour);

/** The settings tab's commands over the settings store; see SettingsService. */
export class SettingsServiceImpl implements SettingsService {
	constructor(private readonly store: SettingsStore) {}

	form(): SettingsForm {
		const s = this.settings;
		return {
			tasksFile: s.tasksFile,
			sections: s.sections,
			sectionOrder: SECTION_ORDER,
			markerOrder: MARKER_ORDER,
			markers: {
				dueDateMarker: s.dueDateMarker,
				slotMarker: s.slotMarker,
				alarmSlotMarker: s.alarmSlotMarker,
				liveSlotMarker: s.liveSlotMarker,
				silentSlotMarker: s.silentSlotMarker,
				repeatMarker: s.repeatMarker,
				collapsedMarker: s.collapsedMarker,
			},
			priorities: s.priorities,
			resultMark: s.resultMark,
			defaultResultMark: DEFAULT_SETTINGS.resultMark,
			labelTag: s.labelTag,
			labels: s.labels,
			labelPaint: s.labelPaint,
			labelPaints: LABEL_PAINTS,
			cardHeight: s.cardHeight,
			cardGap: s.cardGap,
			cardHeights: CARD_HEIGHTS,
			cardGaps: CARD_GAPS,
			zoomLevels: formatZoomLevels(s.zoomLevels),
			projectTag: s.projectTag,
			presets: s.groups.presets,
			ungrouped: s.groups.ungrouped,
			longPressMs: s.longPressMs,
			dayStartHour: s.dayStartHour,
			scrollToHour: s.scrollToHour,
			staleAfterMinutes: s.staleAfterMinutes,
			googleClientId: s.google.clientId,
			refreshSeconds: s.google.refreshSeconds,
			workCalendarFile: s.workCalendarFile,
			dayStartHours: DAY_START_HOURS,
			googleClientReady: s.google.clientId !== "",
			googleLoggedIn: googleLoggedIn(s),
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

	setDayStartHour(dayStartHour: number): Promise<void> {
		return this.store.update({ dayStartHour });
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

	moveLevel(from: number, to: number): Promise<void> {
		return this.saveLevels(moved(this.settings.priorities, from, to));
	}

	async setLabelTag(tag: string): Promise<void> {
		const labelTag = tag.trim();
		if (usableLabelTag(labelTag)) await this.store.update({ labelTag });
	}

	async setLabelPaint(paint: string): Promise<void> {
		const labelPaint = LABEL_PAINTS.find((offered) => offered === paint);
		if (labelPaint) await this.store.update({ labelPaint });
	}

	async setCardHeight(px: number): Promise<void> {
		const cardHeight = withinBounds(px, CARD_HEIGHTS);
		if (cardHeight !== null) await this.store.update({ cardHeight });
	}

	async setCardGap(px: number): Promise<void> {
		const cardGap = withinBounds(px, CARD_GAPS);
		if (cardGap !== null) await this.store.update({ cardGap });
	}

	async setZoomLevels(text: string): Promise<void> {
		const zoomLevels = parseZoomLevels(text);
		if (zoomLevels) await this.store.update({ zoomLevels });
	}

	async setResultMark(mark: string): Promise<void> {
		const word = mark.trim();
		if (usableResultMark(word, usableLevels(this.settings.priorities).map((l) => l.prefix)) !== null) await this.store.update({ resultMark: word });
	}

	async setProjectTag(tag: string): Promise<void> {
		const bare = tag.trim().replace(/^#/, "");
		if (/^[^\s#]+$/.test(bare)) await this.store.update({ projectTag: `#${bare}` });
	}

	renameLabel(index: number, title: string): Promise<void> {
		return this.patchLabel(index, { name: labelNameOf(title) });
	}

	recolourLabel(index: number, color: PriorityColor): Promise<void> {
		return this.patchLabel(index, { color });
	}

	removeLabel(index: number): Promise<void> {
		return this.saveLabels(this.settings.labels.filter((_, i) => i !== index));
	}

	addLabel(): Promise<void> {
		const labels = this.settings.labels;
		let n = labels.length + 1;
		while (labels.some((l) => l.name === `Label_${n}`)) n++;
		const color = PRIORITY_COLORS.find((c) => !labels.some((l) => l.color === c)) ?? PRIORITY_COLORS[0];
		return this.saveLabels([...labels, { name: `Label_${n}`, color }]);
	}

	moveLabel(from: number, to: number): Promise<void> {
		return this.saveLabels(moved(this.settings.labels, from, to));
	}

	colourOf(text: string, shades: Readonly<Record<PresetColor, string>>): PriorityColor | null {
		const hex = hexColor(text);
		if (!hex) return null;
		return PRIORITY_COLORS.find((preset) => shades[preset].toUpperCase() === hex) ?? hex;
	}

	typedColour(of: "level" | "label", index: number, text: string, shades: Readonly<Record<PresetColor, string>>): PriorityColor | null {
		const color = this.colourOf(text, shades);
		const own = (of === "level" ? this.settings.priorities : this.settings.labels)[index]?.color;
		return color === own ? null : color;
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
		return this.savePresets(moved(this.presets, from, to));
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

	private patchLabel(index: number, patch: Partial<LabelLevel>): Promise<void> {
		return this.saveLabels(this.settings.labels.map((label, i) => (i === index ? { ...label, ...patch } : label)));
	}

	private saveLabels(labels: readonly LabelLevel[]): Promise<void> {
		return this.store.update({ labels });
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

/** The list with the item at `from` taken out and put back at `to`. */
function moved<T>(list: readonly T[], from: number, to: number): T[] {
	const items = [...list];
	const [item] = items.splice(from, 1);
	items.splice(to, 0, item);
	return items;
}

/** A number rounded, when it stands within the bounds; null for anything else. */
function withinBounds(value: unknown, bounds: { readonly min: number; readonly max: number }): number | null {
	if (typeof value !== "number" || !Number.isFinite(value)) return null;
	const whole = Math.round(value);
	return whole >= bounds.min && whole <= bounds.max ? whole : null;
}
