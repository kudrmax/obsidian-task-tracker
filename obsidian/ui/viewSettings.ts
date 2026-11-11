import type { ScreenSettings, ScreenSettingsStore } from "../../core/application/contracts";
import type { ScreenPlace } from "./screens";

/**
 * Which pair of neighbouring lists the window shows: Inbox and Soon, Soon and the day's list, or the day's list and the
 * calendar; or the Projects screen. The window's own layout: the services hear only which lists show (`SHOWN_LISTS`).
 */
export type RightMode = ScreenPlace;

/**
 * The settings of this frontend alone: how Obsidian's screen is laid out, zoomed and painted. They are kept in the
 * plugin's data.json beside the shared ones, but no service reads them and no other frontend has them.
 */

/** A height of the hour the timeline settles on after a pinch; the step a drag snaps to follows from the height itself. */
export type { Zoom } from "../../core/application/contracts";
import { DEFAULT_ZOOM_HOUR, type Zoom } from "../../core/application/contracts";

export interface ViewSettings {
	/** The left column's share of the width the two columns split, 0..1, set by dragging the divider: the line keeps its place as the window changes. */
	readonly listShare: number;
	/** What the right column shows; the segmented control in the day row sets it. */
	readonly rightMode: RightMode;
	/** The zoom a pinch last settled on: the timeline opens at it. */
	readonly zoom: Zoom;
	/** The Projects screen's tree, px, as its divider was last let go; null for the design's width. */
	readonly treeWidth: number | null;
}

export const VIEW_DEFAULTS: ViewSettings = {
	listShare: 0.5,
	rightMode: "calendar",
	zoom: DEFAULT_ZOOM_HOUR,
	treeWidth: null,
};

const VIEW_KEYS = Object.keys(VIEW_DEFAULTS) as (keyof ViewSettings)[];

/** What belongs to the device, not the vault: the dividers' places, the column shown and the zoom are set by hand on each screen, and must not travel through Sync. */
export const DEVICE_KEYS = ["listShare", "rightMode", "zoom", "treeWidth"] as const satisfies readonly (keyof ViewSettings)[];


/** The view's settings of what was saved, the defaults for any it lacks. */
export function viewSettingsFrom(saved: unknown): ViewSettings {
	const s = (saved ?? {}) as Partial<Record<keyof ViewSettings, unknown>>;
	return Object.fromEntries(VIEW_KEYS.map((key) => [key, s[key] ?? VIEW_DEFAULTS[key]])) as unknown as ViewSettings;
}

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
