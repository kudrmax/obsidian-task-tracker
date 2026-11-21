import type { App } from "obsidian";
import type { DeviceSettings } from "../adapters/DeviceSettings";
import type { TrackpadFingers } from "../ui/engine/gestures/trackpadFollow";
import type { Place } from "../ui/engine/layout/Layout";
import { type MountedScreen, mountScreen } from "../ui/engine/mount";
import type { ScreenContext, ScreenPort } from "../ui/engine/port";
import type { Haptics } from "./haptics";

/**
 * What every screen of one host is mounted with (spec, «Haptics, theme, platform»: the host passes them in): the port,
 * what the device keeps, Obsidian's app for the editor, the haptics, Obsidian's markdown and notices, the platform and
 * macOS's fingers on the trackpad (null where none are heard).
 */
export interface ScreenParts {
	readonly port: ScreenPort;
	readonly device: DeviceSettings;
	readonly app: App;
	readonly haptics: Haptics;
	readonly markdown: (text: string, el: HTMLElement, sourcePath: string) => () => void;
	readonly notice: (text: string) => void;
	/** Obsidian on the desktop (`Platform.isMobile` false). */
	readonly desk: boolean;
	readonly fingers: TrackpadFingers | null;
}

/** The screens one host has mounted, each over the same parts: the plugin's, the stand's and the checks' page's one way to mount `TaskScreen`. */
export class ScreenMounts {
	private readonly screens = new Set<MountedScreen>();

	constructor(readonly parts: ScreenParts) {}

	/** `TaskScreen` at `place` in `el`, in `context` (every task when absent), counted among the open screens. */
	mount(el: HTMLElement, place: Place, sourcePath: string, context?: ScreenContext): MountedScreen {
		const { port, device, app, haptics, markdown, notice, desk, fingers } = this.parts;
		const screen = mountScreen(el, { port, place, app, sourcePath, haptics, zoom: device.zoom(), listShare: { kept: device.listShare(), keep: (share) => void device.keepListShare(share) }, markdown, notice, desk, fingers, context });
		this.screens.add(screen);
		return screen;
	}

	/** A screen this host mounted, taken off and no longer counted. */
	unmount(screen: MountedScreen | null): void {
		if (!screen || !this.screens.delete(screen)) return;
		screen.unmount();
	}

	/** Every open screen. */
	get open(): readonly MountedScreen[] {
		return [...this.screens];
	}

	/** Every screen taken off: the host unloads. */
	dispose(): void {
		for (const screen of this.screens) screen.unmount();
		this.screens.clear();
	}
}
