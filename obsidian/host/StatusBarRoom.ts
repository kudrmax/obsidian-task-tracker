export const STATUS_BAR_SHOWN = "tc-status-bar-shown";

const STATUS_BAR = ":scope > .app-container > .status-bar";
const APP_CONTAINER = ":scope > .app-container";
const HIDDEN = "display: none";

/**
 * Marks a document's body while Obsidian's desktop status bar shows, read as the stylesheet once read it: the bar's inline
 * style holds no "display: none". One per document, kept while any view holds it. It watches only the body's children, the
 * container's children and the bar's style, so the styles written on every frame of a drag do not wake it.
 */
export class StatusBarRoom {
	private static readonly rooms = new WeakMap<Document, StatusBarRoom>();

	private readonly observer: MutationObserver;
	private holders = 0;

	private constructor(private readonly doc: Document) {
		this.observer = new MutationObserver(() => this.refresh());
	}

	/** Holds the mark on the document's body; the returned call lets go, once. */
	static hold(doc: Document): () => void {
		let room = StatusBarRoom.rooms.get(doc);
		if (!room) {
			room = new StatusBarRoom(doc);
			StatusBarRoom.rooms.set(doc, room);
		}
		room.take();
		let held = true;
		const kept = room;
		return () => {
			if (!held) return;
			held = false;
			kept.letGo();
		};
	}

	private take(): void {
		if (this.holders++ === 0) this.refresh();
	}

	private letGo(): void {
		if (--this.holders > 0) return;
		this.observer.disconnect();
		this.doc.body.classList.remove(STATUS_BAR_SHOWN);
		StatusBarRoom.rooms.delete(this.doc);
	}

	private shown(): boolean {
		const bar = this.doc.body.querySelector(STATUS_BAR);
		return !!bar && !(bar.getAttribute("style") ?? "").includes(HIDDEN);
	}

	private refresh(): void {
		this.doc.body.classList.toggle(STATUS_BAR_SHOWN, this.shown());
		this.watch();
	}

	private watch(): void {
		this.observer.disconnect();
		const body = this.doc.body;
		this.observer.observe(body, { childList: true });
		const app = body.querySelector(APP_CONTAINER);
		if (app) this.observer.observe(app, { childList: true });
		const bar = body.querySelector(STATUS_BAR);
		if (bar) this.observer.observe(bar, { attributes: true, attributeFilter: ["style"] });
	}
}
