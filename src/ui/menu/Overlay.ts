import { DURATION, tokenMs } from "../design";
import { el } from "../dom";

/**
 * What a press opens over the view: the blurred dark sheet and the parts laid over it, a copy of what was pressed and its
 * panel. They show together and go together, in one fade, and leave the page at once. A tap on the sheet closes it.
 */
export class Overlay {
	private readonly backdrop: HTMLElement;
	private readonly parts: HTMLElement[] = [];
	private closed = false;
	/** Escape closes this and nothing else: Obsidian would otherwise take it as a step back. */
	private readonly onKey = (e: KeyboardEvent) => {
		if (e.key !== "Escape") return;
		e.preventDefault();
		e.stopPropagation();
		this.onClose();
	};

	constructor(private readonly onClose: () => void) {
		this.backdrop = el(document.body, "div", "tc-backdrop");
		this.backdrop.addEventListener("pointerdown", (e) => {
			if (e.target === this.backdrop) onClose();
		});
		document.addEventListener("keydown", this.onKey, true);
	}

	/** Lays a part over the sheet: it shows and goes with it. */
	add<T extends HTMLElement>(part: T): T {
		document.body.appendChild(part);
		this.parts.push(part);
		return part;
	}

	show(): void {
		requestAnimationFrame(() => this.all().forEach((part) => part.classList.add("is-shown")));
	}

	/** Every part fades out at once and they leave the page together; false when it was already closing. */
	close(): boolean {
		if (this.closed) return false;
		this.closed = true;
		document.removeEventListener("keydown", this.onKey, true);
		for (const part of this.all()) {
			part.classList.add("is-closing");
			part.classList.remove("is-shown");
		}
		window.setTimeout(() => this.all().forEach((part) => part.remove()), tokenMs(this.backdrop, DURATION.collapse));
		return true;
	}

	private all(): HTMLElement[] {
		return [this.backdrop, ...this.parts];
	}
}
