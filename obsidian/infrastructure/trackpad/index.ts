import { type App, Notice, Platform, type Plugin } from "obsidian";
import type { Electron, MacTrackpadFingers } from "./MacTrackpadFingers";
import { TrackpadSwitch } from "./TrackpadSwitch";

export type { FingerSignal, MacTrackpadFingers } from "./MacTrackpadFingers";
export { TrackpadSwitch } from "./TrackpadSwitch";

/** «Trackpad through macOS», this Mac's switch for the module; read the next time the plugin loads. */
export function trackpadSwitch(app: App): TrackpadSwitch {
	return new TrackpadSwitch(app);
}

/**
 * macOS's touch and lift on the trackpad for the plugin's screens (Decision 126), or null: on the phone (and the Mac's
 * Obsidian showing its phone view), on Windows and Linux, with the switch off, and wherever the module can't load (the ribbon then reads the trackpad by its scrolling).
 * The module's code is imported only on the Mac's desktop app: it reads Node's files, which the phone refuses. It ends
 * with the plugin and with the window's page; `dispose` may end it sooner.
 */
export async function trackpadFingers(app: App, plugin: Plugin): Promise<MacTrackpadFingers | null> {
	const toggle = trackpadSwitch(app);
	if (!Platform.isDesktopApp || !Platform.isMacOS || Platform.isMobile || !toggle.on) return null;
	const [{ MacTrackpadFingers }, { TRACKPAD_MODULE }] = await Promise.all([import("./MacTrackpadFingers"), import("./module")]);
	const host = window as unknown as { require?: (id: string) => unknown };
	const fingers = MacTrackpadFingers.load(
		TRACKPAD_MODULE,
		{
			electron: () => (host.require?.("electron") ?? {}) as Electron,
			remoteFallback: () => {
				try {
					return (host.require?.("@electron/remote") as Electron["remote"]) ?? undefined;
				} catch {
					return undefined;
				}
			},
			switch: toggle,
			log: (message) => console.info(`[${plugin.manifest.id}] ${message}`),
			notice: (message) => new Notice(message, 0),
		},
		window,
	);
	if (!fingers) return null;
	const dispose = () => fingers.dispose();
	plugin.register(dispose);
	plugin.registerDomEvent(window, "pagehide", dispose);
	return fingers;
}
