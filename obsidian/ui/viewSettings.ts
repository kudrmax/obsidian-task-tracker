import type { ScreenSettings, ScreenSettingsStore } from "../../core/application/contracts";

/**
 * Which pair of neighbouring lists the window shows: Inbox and Soon, Soon and the day's list, or the day's list and the
 * calendar. The window's own layout: the services hear only which lists show (`SHOWN_LISTS`).
 */
export type RightMode = "calendar" | "soon" | "inbox";

/**
 * The settings of this frontend alone: how Obsidian's screen is laid out, zoomed and painted. They are kept in the
 * plugin's data.json beside the shared ones, but no service reads them and no other frontend has them.
 */

/** A height of the hour the timeline settles on after a pinch; the step a drag snaps to follows from the height itself. */
export type { ZoomLevel } from "../../core/application/contracts";
import { DEFAULT_ZOOM_HOUR, DEFAULT_ZOOM_LEVELS, parseZoomLevels, type ZoomLevel } from "../../core/application/contracts";
export { formatZoomLevels, parseZoomLevels } from "../../core/application/contracts";

/** Where the timeline was zoomed to: an hour's height, or the whole day, whatever the screen's height. */
export type Zoom = number | "wholeDay";

/** How a card of several labels is painted: narrow diagonal stripes of their colours in turn, or one colour flowing into the next. */
export type LabelPaint = "stripes" | "blend";
export const LABEL_PAINTS: readonly LabelPaint[] = ["stripes", "blend"];

export interface ViewSettings {
	/** The left column's share of the width the two columns split, 0..1, set by dragging the divider: the line keeps its place as the window changes. */
	readonly listShare: number;
	/** What the right column shows; the segmented control in the day row sets it. */
	readonly rightMode: RightMode;
	/** The zoom a pinch last settled on: the timeline opens at it. */
	readonly zoom: Zoom;
	readonly zoomLevels: readonly ZoomLevel[];
	/** A task card's height, px: the list, New task and the timeline's stack; its ends are round, half of it. */
	readonly cardHeight: number;
	/** Between two cards, px: in the list and in a stack on the timeline alike. */
	readonly cardGap: number;
	/** How a card of several labels is painted. */
	readonly labelPaint: LabelPaint;
}

export const VIEW_DEFAULTS: ViewSettings = {
	listShare: 0.5,
	rightMode: "calendar",
	zoom: DEFAULT_ZOOM_HOUR,
	zoomLevels: DEFAULT_ZOOM_LEVELS,
	cardHeight: 35,
	cardGap: 2,
	labelPaint: "stripes",
};

const VIEW_KEYS = Object.keys(VIEW_DEFAULTS) as (keyof ViewSettings)[];

/** What belongs to the device, not the vault: the divider's place, the column shown and the zoom are set by hand on each screen, and must not travel through Sync. */
export const DEVICE_KEYS = ["listShare", "rightMode", "zoom"] as const satisfies readonly (keyof ViewSettings)[];

export const LIST_WIDTH_MIN = 110;
export const LIST_WIDTH_MAX = 280;
export const CARD_HEIGHT_MIN = 28;
export const CARD_HEIGHT_MAX = 40;
export const CARD_GAP_MAX = 10;

/** A card's height and the gap between cards before the settings are read. */
export const DEFAULT_CARD_SIZE: { readonly height: number; readonly gap: number } = { height: VIEW_DEFAULTS.cardHeight, gap: VIEW_DEFAULTS.cardGap };

/** The view's settings of what was saved, the defaults for any it lacks. */
export function viewSettingsFrom(saved: unknown): ViewSettings {
	const s = (saved ?? {}) as Partial<Record<keyof ViewSettings, unknown>>;
	return Object.fromEntries(VIEW_KEYS.map((key) => [key, s[key] ?? VIEW_DEFAULTS[key]])) as unknown as ViewSettings;
}

/** `28, 56, 112` — the hour's heights in pixels, as the settings tab shows them. */

/** Where the view's settings are kept: the plugin's settings file. */
export interface ViewSettingsFile {
	get(): ViewSettings;
	update(patch: Partial<ViewSettings>): Promise<void>;
	/** Fires after the settings changed, here or through Sync. Returns the unsubscribe. */
	onChange(listener: () => void): () => void;
}

/** The view's settings, read and set. */
export class ViewSettingsStore {
	private source: ViewSettings | null = null;
	private shown: ViewSettings | null = null;

	constructor(private readonly file: ViewSettingsFile) {}

	/** The same object while the settings stay the same. */
	get(): ViewSettings {
		const saved = this.file.get();
		if (saved !== this.source || !this.shown) {
			this.source = saved;
			this.shown = viewSettingsFrom(saved);
		}
		return this.shown;
	}

	set(patch: Partial<ViewSettings>): Promise<void> {
		return this.file.update(patch);
	}

	/** Written when the text reads as the hour's heights. */
	async setZoomLevels(text: string): Promise<void> {
		const zoomLevels = parseZoomLevels(text);
		if (zoomLevels) await this.set({ zoomLevels });
	}

	onChange(listener: () => void): () => void {
		return this.file.onChange(listener);
	}
}

/** What the screen reads: the shared settings it draws, and its own. */
export type ShownSettings = ScreenSettings & ViewSettings;

/** The screen's settings: the shared ones from the services and the view's own, as one; the screen sets only its own. */
export class ShownSettingsStore {
	private seen: readonly [ScreenSettings, ViewSettings] | null = null;
	private shown: ShownSettings | null = null;

	constructor(
		private readonly screen: ScreenSettingsStore,
		private readonly view: ViewSettingsStore,
	) {}

	/** The same object while neither part changes. */
	get(): ShownSettings {
		const screen = this.screen.get();
		const view = this.view.get();
		if (!this.seen || this.seen[0] !== screen || this.seen[1] !== view || !this.shown) {
			this.seen = [screen, view];
			this.shown = { ...screen, ...view };
		}
		return this.shown;
	}

	set(patch: Partial<Pick<ViewSettings, (typeof DEVICE_KEYS)[number]>>): Promise<void> {
		return this.view.set(patch);
	}

	/** Fires once for a change of either part, however many of them tell of it. Returns the unsubscribe. */
	onChange(listener: () => void): () => void {
		let last = this.get();
		const changed = () => {
			const now = this.get();
			if (now === last) return;
			last = now;
			listener();
		};
		const offs = [this.screen.onChange(changed), this.view.onChange(changed)];
		return () => offs.forEach((off) => off());
	}
}
