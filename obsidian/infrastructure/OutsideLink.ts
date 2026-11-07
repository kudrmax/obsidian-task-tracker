export interface OutsidePage {
	open(url: string): unknown;
	readonly location: { assign(url: string): void };
}

/**
 * Opens a link in another app. On the iPhone Obsidian's web view lets a script open a window only right after a tap,
 * so a link opened later (the Sync button's way back) would vanish; a navigation of the page is handed to iOS at any
 * time, and Obsidian stays where it is.
 */
export function openOutside(url: string, host: { isPhone: boolean; window: OutsidePage }): void {
	if (host.isPhone) host.window.location.assign(url);
	else host.window.open(url);
}
