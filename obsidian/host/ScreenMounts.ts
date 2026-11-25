import type { App } from "obsidian";
import type { CorePort } from "../adapters/CorePort";
import type { DeviceSettings } from "../adapters/DeviceSettings";
import type { TrackpadFingers } from "../ui/engine/gestures/trackpadFollow";
import type { Place } from "../ui/engine/layout/Layout";
import { type MountedScreen, mountScreen } from "../ui/engine/mount";
import type { ScreenContext } from "../ui/engine/port";
import type { VaultNotes } from "../ui/engine/view/host";
import type { Haptics } from "./haptics";

/**
 * What every screen of one host is mounted with (spec, «Haptics, theme, platform»: the host passes them in): the port,
 * what the device keeps, Obsidian's app for the editor, the haptics, Obsidian's markdown and notices, the platform and
 * macOS's fingers on the trackpad (null where none are heard).
 */
export interface ScreenParts {
	/** The port over the core: each screen mounts over a port of its own (`within` its context), never sharing one's context. */
	readonly port: CorePort;
	readonly device: DeviceSettings;
	readonly app: App;
	readonly haptics: Haptics;
	readonly markdown: (text: string, el: HTMLElement, sourcePath: string) => () => void;
	readonly notice: (text: string) => void;
	/** Obsidian on the desktop (`Platform.isMobile` false). */
	readonly desk: boolean;
	readonly fingers: TrackpadFingers | null;
	/** The vault's notes (a project's menu attaches one); null without a vault. */
	readonly notes: VaultNotes | null;
}

/** The screens one host has mounted, each over the same parts: the plugin's, the stand's and the checks' page's one way to mount `TaskScreen`. */
export class ScreenMounts {
	private readonly screens = new Map<MountedScreen, CorePort>();

	constructor(readonly parts: ScreenParts) {}

	/** `TaskScreen` at `place` in `el`, in `context` (every task when absent), counted among the open screens. */
	mount(el: HTMLElement, place: Place, sourcePath: string, context?: ScreenContext): MountedScreen {
		const { device, app, haptics, markdown, notice, desk, fingers, notes } = this.parts;
		const port = this.parts.port.within(context);
		const screen = mountScreen(el, { port, place, app, sourcePath, haptics, zoom: device.zoom(), listShare: { kept: device.listShare(), keep: (share) => void device.keepListShare(share) }, treeWidth: { kept: device.treeWidth(), keep: (width) => void device.keepTreeWidth(width) }, markdown, notice, desk, fingers, context, notes });
		this.screens.set(screen, port);
		return screen;
	}

	/** A screen this host mounted, taken off and no longer counted. */
	unmount(screen: MountedScreen | null): void {
		const port = screen && this.screens.get(screen);
		if (!screen || !port) return;
		this.screens.delete(screen);
		screen.unmount();
		port.release();
	}

	/** Every open screen. */
	get open(): readonly MountedScreen[] {
		return [...this.screens.keys()];
	}

	/** Every screen taken off: the host unloads. */
	dispose(): void {
		for (const screen of [...this.screens.keys()]) this.unmount(screen);
	}
}
