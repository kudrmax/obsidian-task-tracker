import { Platform } from "obsidian";

/**
 * The chrome driver (§Architecture): what the host's platform and theme are, as Obsidian has them. The only part that
 * writes body classes; it reads none (Obsidian's `Platform` says the platform).
 */
export class Chrome {
	/** A wide screen (the desktop): the core lays the view out for it. Obsidian's phone view counts as the phone. */
	static wide(): boolean {
		return !Platform.isMobile;
	}
}
