import { restingTop } from "../dom";

const KEYBOARD_TOOLBAR = ".mobile-toolbar .mobile-toolbar-options-container";
const STATUS_BAR = ":scope > .app-container > .status-bar";

/**
 * Obsidian's own chrome around the view: the toolbar over the phone keyboard and the desktop status bar. Each is looked
 * up once and kept while it stays on the page; one that is gone, or not there yet, is looked up again.
 */
export class ObsidianChrome {
	private toolbar: HTMLElement | null = null;
	private statusBar: HTMLElement | null = null;

	constructor(private readonly doc: Document) {}

	/** Where the buttons of Obsidian's toolbar over the phone keyboard stop while it shows, though still sliding there; null otherwise. */
	toolbarTop(): number | null {
		this.toolbar = this.found(this.toolbar, KEYBOARD_TOOLBAR);
		return this.toolbar && topOf(this.toolbar) !== undefined ? restingTop(this.toolbar) : null;
	}

	/** The top of Obsidian's desktop status bar while it shows; Infinity on the phone or while it is hidden. */
	statusBarTop(): number {
		this.statusBar = this.found(this.statusBar, STATUS_BAR);
		return topOf(this.statusBar) ?? Infinity;
	}

	private found(kept: HTMLElement | null, selector: string): HTMLElement | null {
		return kept?.isConnected ? kept : this.doc.body.querySelector<HTMLElement>(selector);
	}
}

/** The element's top while it shows: it takes some height. */
function topOf(element: HTMLElement | null): number | undefined {
	const box = element?.getBoundingClientRect();
	return box && box.height > 0 ? box.top : undefined;
}
