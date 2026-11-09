import { DURATION, tokenMs } from "../design";
import { el } from "../dom";
import { Picks } from "../kit/Panel";

/** How an overlay was closed by the user: Escape, or a tap on the sheet. */
export type CloseHow = "escape" | "away";

const SHOWN = "is-shown";
const CLOSING = "is-closing";

/**
 * What a press opens over the view: the blurred dark sheet and the parts laid over it, a copy of what was pressed and its
 * panel. Every part opens and closes through it, on one pair of motion tokens (`--tc-duration-menu` in,
 * `--tc-duration-collapse` out) and one curve: they show together and go together, and leave the page once the fade has
 * ended, which `closed` resolves on. A tap on the sheet closes it. It stands in the window of the element it opens over.
 */
export class Overlay {
	private readonly backdrop: HTMLElement;
	private readonly parts: HTMLElement[] = [];
	/** Holds the parts that stand at one depth, so one shadow falls from all of them and none on another. */
	private level: HTMLElement | null = null;
	private ending: Promise<void> | null = null;
	/** Every part has left the page. */
	private gone = false;
	/** Parts faded away while the overlay stays: showing it shows them no more. */
	private readonly retired = new Set<HTMLElement>();
	/** Escape closes this and nothing else: Obsidian would otherwise take it as a step back. */
	private readonly onKey = (e: KeyboardEvent) => {
		if (e.key !== "Escape") return;
		e.preventDefault();
		e.stopPropagation();
		this.onClose("escape");
	};
	private readonly onSheet = (e: PointerEvent) => {
		if (e.target === this.backdrop) this.onClose("away");
	};

	/**
	 * The picks of every window over this overlay, one set for all: the first closes the overlay as its owner closes it
	 * (`onClose`), and acts once its parts have gone; any pick after it does nothing.
	 */
	readonly picks: Picks;

	/** The window it opened in: a popout window's menu stands and hears its keys there. */
	private readonly doc: Document;

	/** `source`: what it opens over; its window is the overlay's. A sheet handed over by the window this one replaces is taken as it stands. */
	constructor(
		private readonly onClose: (how: CloseHow) => void,
		source?: Node | null,
		sheet?: HTMLElement,
	) {
		this.doc = sheet?.ownerDocument ?? source?.ownerDocument ?? activeDocument;
		this.picks = new Picks(
			() => onClose("away"),
			(then) => this.afterClose(then),
		);
		this.backdrop = sheet ?? el(this.doc.body, "div", "tc-backdrop");
		this.backdrop.classList.remove(CLOSING);
		this.backdrop.addEventListener("pointerdown", this.onSheet);
		this.doc.addEventListener("keydown", this.onKey, true);
	}

	/** Lays a part over the sheet: it shows and goes with it. A part `onLevel` stands at the depth of the others there. */
	add<T extends HTMLElement>(part: T, onLevel = false): T {
		(onLevel ? this.levelEl() : this.doc.body).appendChild(part);
		this.parts.push(part);
		if (this.backdrop.classList.contains(SHOWN) && this.ending === null) this.doc.defaultView?.requestAnimationFrame(() => part.classList.add(SHOWN));
		return part;
	}

	/** A part that stands inside `parent` rather than over the sheet (the phone's search covers the view itself): it shows and goes with the overlay all the same. */
	addIn<T extends HTMLElement>(parent: HTMLElement, part: T): T {
		parent.appendChild(part);
		this.parts.push(part);
		if (this.backdrop.classList.contains(SHOWN) && this.ending === null) this.doc.defaultView?.requestAnimationFrame(() => part.classList.add(SHOWN));
		return part;
	}

	/** The sheet fades away while the parts stay: a window that covers the view itself needs no blur under it. */
	dropSheet(): void {
		this.retire(this.backdrop);
	}

	private levelEl(): HTMLElement {
		if (!this.level) {
			this.level = el(this.doc.body, "div", "tc-level");
			if (this.backdrop.classList.contains(SHOWN)) this.doc.defaultView?.requestAnimationFrame(() => this.level?.classList.add(SHOWN));
		}
		return this.level;
	}

	show(): void {
		(this.doc.defaultView ?? window).requestAnimationFrame(() => {
			if (this.ending === null) this.all().forEach((part) => part.classList.toggle(SHOWN, !this.retired.has(part)));
		});
	}

	/** It has begun to close, or closed. */
	get isClosed(): boolean {
		return this.ending !== null;
	}

	/** Resolves once every part has faded out and left the page; null once they have (a close with no fade, as in a test). */
	get closed(): Promise<void> | null {
		return this.gone ? null : (this.ending ?? new Promise(() => undefined));
	}

	/** `then` runs once the overlay has closed and its parts have left the page: at once when they have. */
	afterClose(then: () => void | Promise<void>): void {
		const closing = this.closed;
		if (closing) void closing.then(then);
		else void then();
	}


	/** Every part fades out at once and they leave the page together; resolves then. Closing again gives the same end. */
	close(): Promise<void> {
		if (this.ending) return this.ending;
		this.release();
		const parts = this.all();
		this.ending = this.fadeOut(parts);
		return this.ending;
	}

	/**
	 * A window that replaces this one takes its sheet as it stands, shown: this one's parts fade out and go, the sheet
	 * stays under the next window, which gets it through the overlay this answers, closing on `onClose`.
	 */
	handOver(onClose: (how: CloseHow) => void): Overlay {
		if (this.ending) return new Overlay(onClose, this.backdrop);
		this.release();
		this.ending = this.fadeOut(this.all().filter((part) => part !== this.backdrop));
		return new Overlay(onClose, null, this.backdrop);
	}

	/** One part fades out and stays away, the rest of the overlay open: a menu's panel giving its room to a field. */
	retire(part: HTMLElement): void {
		this.retired.add(part);
		part.classList.add(CLOSING);
		part.classList.remove(SHOWN);
		part.style.pointerEvents = "none";
	}

	private release(): void {
		this.doc.removeEventListener("keydown", this.onKey, true);
		this.backdrop.removeEventListener("pointerdown", this.onSheet);
	}

	/** The parts fade out under the finger, taking no press: what stands under them is pressed through them at once. */
	private fadeOut(parts: readonly HTMLElement[]): Promise<void> {
		for (const part of parts) {
			part.classList.add(CLOSING);
			part.classList.remove(SHOWN);
			part.style.pointerEvents = "none";
		}
		const leave = () => {
			parts.forEach((part) => part.remove());
			if (this.level && [...this.level.children].every((child) => parts.includes(child as HTMLElement))) this.level.remove();
			this.gone = true;
		};
		const ms = tokenMs(this.backdrop, DURATION.collapse);
		/** A fade of no length has ended as it begins: what waits for it goes on at once. */
		if (ms <= 0) this.gone = true;
		return new Promise((resolve) =>
			(this.doc.defaultView ?? window).setTimeout(() => {
				leave();
				resolve();
			}, ms),
		);
	}

	private all(): HTMLElement[] {
		return [this.backdrop, ...(this.level ? [this.level] : []), ...this.parts];
	}
}
