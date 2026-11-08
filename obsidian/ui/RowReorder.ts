import { ExtraButtonComponent } from "obsidian";
import { DURATION, tokenMs } from "./design";

const DRAGGING = "is-dragging";
const SHIFTING = "is-shifting";

/**
 * A list of rows in the settings put in order by hand, dragged as a task's card is: the row follows its grip under the
 * finger, the rows it passes slide aside to open its new place, and let go it glides into that place; only then does
 * `move(from, to)` get it. The pointer is followed in the rows' own document: on the desktop Obsidian shows the settings
 * in a window of their own.
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
		const all = Array.from(this.rows.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
		const tops = all.map((child) => child.getBoundingClientRect().top);
		const middles = all.map((child) => {
			const r = child.getBoundingClientRect();
			return r.top + r.height / 2;
		});
		/** How far a row passed over moves to give its place: the dragged row's own step in the list. */
		const step = row.getBoundingClientRect().height + (all.length > 1 ? Math.max(0, (tops[1] - tops[0]) - all[0].getBoundingClientRect().height) : 0);
		row.addClass(DRAGGING);
		for (const other of all) if (other !== row) other.addClass(SHIFTING);
		const doc = this.rows.ownerDocument;
		let to = from;
		const follow = (ev: PointerEvent) => {
			if (ev.pointerId !== e.pointerId) return;
			const dy = ev.clientY - e.clientY;
			row.style.transform = `translateY(${dy}px)`;
			const middle = middles[from] + dy;
			to = middles.filter((m, i) => i !== from && m < middle).length;
			all.forEach((other, i) => {
				if (other === row) return;
				const shift = from < i && i <= to ? -step : to <= i && i < from ? step : 0;
				other.style.transform = shift === 0 ? "" : `translateY(${shift}px)`;
			});
		};
		const up = (ev: PointerEvent) => {
			if (ev.pointerId !== e.pointerId) return;
			doc.removeEventListener("pointermove", follow);
			doc.removeEventListener("pointerup", up);
			doc.removeEventListener("pointercancel", up);
			const landing = to === from ? 0 : to > from ? step * (to - from) : -step * (from - to);
			row.removeClass(DRAGGING);
			row.addClass(SHIFTING);
			row.style.transform = landing === 0 ? "" : `translateY(${landing}px)`;
			const landed = () => {
				for (const other of all) {
					other.removeClass(SHIFTING);
					other.style.transform = "";
				}
				if (to === from) return;
				const others = all.filter((other) => other !== row);
				this.rows.insertBefore(row, others[to] ?? null);
				this.move(from, to);
			};
			const ms = tokenMs(row, DURATION.snap);
			if (ms > 0) (doc.defaultView ?? window).setTimeout(landed, ms);
			else landed();
		};
		doc.addEventListener("pointermove", follow);
		doc.addEventListener("pointerup", up);
		doc.addEventListener("pointercancel", up);
	}
}
