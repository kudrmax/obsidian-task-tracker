const STATUS_BAR = ":scope > .app-container > .status-bar";

/**
 * Obsidian's own chrome around the view: the desktop status bar. It is looked
 * up once and kept while it stays on the page; once it is gone, or not there yet, it is looked up again.
 */
export class ObsidianChrome {
	private statusBar: HTMLElement | null = null;

	constructor(private readonly doc: Document) {}

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
