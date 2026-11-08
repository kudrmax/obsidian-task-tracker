import { DURATION, PROPERTY, tokenMs } from "../design";
import { px } from "../dom";

/**
 * A scrolled list keeps its place while what it shows shrinks under it: rows folding away at its end would otherwise
 * leave less to scroll and pull everything down from under the finger. The list holds room at its end (`--tc-list-hold`,
 * under its last row) as long as its scroll needs it, and gives it back as the finger scrolls up, never moving what shows.
 */
export class ScrollHold {
	private hold = 0;
	private timer = 0;
	/** Rows are folding away: the room stays whole until they have. */
	private keeping = false;

	constructor(private readonly list: HTMLElement) {
		list.addEventListener(
			"scroll",
			() => {
				if (!this.keeping) this.fit();
			},
			{ passive: true },
		);
	}

	/** A drawing that may shrink the list begins: the list keeps a screen of room under its rows until they have settled. */
	keep(): void {
		if (this.list.scrollTop <= 0) return;
		const ms = 2 * tokenMs(this.list, DURATION.collapse);
		if (ms <= 0) return;
		this.keeping = true;
		this.set(Math.max(this.hold, this.list.clientHeight));
		const win = this.list.ownerDocument.defaultView ?? window;
		win.clearTimeout(this.timer);
		this.timer = win.setTimeout(() => {
			this.keeping = false;
			this.fit();
		}, ms);
	}

	/** Only as much room as the scroll needs now stays. */
	private fit(): void {
		if (this.hold === 0) return;
		const content = this.list.scrollHeight - this.hold;
		this.set(Math.max(0, Math.min(this.hold, this.list.scrollTop + this.list.clientHeight - content)));
	}

	private set(hold: number): void {
		if (hold === this.hold) return;
		this.hold = hold;
		if (hold === 0) this.list.style.removeProperty(PROPERTY.listHold);
		else this.list.style.setProperty(PROPERTY.listHold, px(hold));
		this.list.classList.toggle("is-holding", hold > 0);
	}
}
