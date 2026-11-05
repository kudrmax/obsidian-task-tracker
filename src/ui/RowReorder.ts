import { ExtraButtonComponent } from "obsidian";

/**
 * A list of rows in the settings put in order by hand: a row follows its grip up and down among the others; let go, `move(from, to)` gets the new place.
 * The pointer is followed in the rows' own document: on the desktop Obsidian shows the settings in a window of their own.
 */
export class RowReorder {
	constructor(
		private readonly rows: HTMLElement,
		private readonly move: (from: number, to: number) => void,
	) {}

	/** The grip at the start of `row`, the `index`-th of the list. */
	grip(row: HTMLElement, index: number): void {
		const grip = new ExtraButtonComponent(row).setIcon("menu").setTooltip("Drag to reorder");
		grip.extraSettingsEl.addClass("tc-row-grip");
		grip.extraSettingsEl.addEventListener("pointerdown", (e) => this.drag(row, index, e));
	}

	private drag(row: HTMLElement, from: number, e: PointerEvent): void {
		if (!e.isPrimary || e.button !== 0) return;
		e.preventDefault();
		row.addClass("is-dragging");
		const doc = this.rows.ownerDocument;
		let to = from;
		const follow = (ev: PointerEvent) => {
			if (ev.pointerId !== e.pointerId) return;
			const others = Array.from(this.rows.children).filter((child): child is HTMLElement => child !== row);
			to = others.filter((other) => {
				const r = other.getBoundingClientRect();
				return ev.clientY > r.top + r.height / 2;
			}).length;
			this.rows.insertBefore(row, others[to] ?? null);
		};
		const up = (ev: PointerEvent) => {
			if (ev.pointerId !== e.pointerId) return;
			doc.removeEventListener("pointermove", follow);
			doc.removeEventListener("pointerup", up);
			doc.removeEventListener("pointercancel", up);
			row.removeClass("is-dragging");
			if (to !== from) this.move(from, to);
		};
		doc.addEventListener("pointermove", follow);
		doc.addEventListener("pointerup", up);
		doc.addEventListener("pointercancel", up);
	}
}
