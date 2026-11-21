import { FileSystemAdapter, Platform, type Plugin } from "obsidian";
import type { MacTrackpadFingers } from "../infrastructure/trackpad/MacTrackpadFingers";

/**
 * macOS's touch and lift on the trackpad (Decision 126), for `plugin`'s screens: null on the phone, on Windows and
 * Linux, and wherever the native module can't load (the ribbon then reads the fingers from the deltas). Loaded only on
 * the Mac's desktop app, by a dynamic import: the module reads Node's files, which the phone's Obsidian refuses at the
 * plugin's load (Decision 135).
 */
export async function hearFingers(plugin: Plugin): Promise<MacTrackpadFingers | null> {
	const adapter = plugin.app.vault.adapter;
	if (!Platform.isDesktopApp || !Platform.isMacOS || !(adapter instanceof FileSystemAdapter) || !plugin.manifest.dir) return null;
	const host = window as unknown as { require?: (id: string) => unknown };
	const [{ MacTrackpadFingers }, { TRACKPAD_MODULE }] = await Promise.all([import("../infrastructure/trackpad/MacTrackpadFingers"), import("../infrastructure/trackpad/module")]);
	return MacTrackpadFingers.load(
		TRACKPAD_MODULE,
		{
			dir: adapter.getFullPath(plugin.manifest.dir),
			electron: () => host.require?.("electron") as never,
			remoteFallback: () => {
				try {
					return host.require?.("@electron/remote") as never;
				} catch {
					return undefined;
				}
			},
			log: (message) => console.info(`[${plugin.manifest.id}] ${message}`),
		},
		window,
	);
}
