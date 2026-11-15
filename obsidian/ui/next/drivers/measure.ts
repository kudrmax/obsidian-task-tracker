/**
 * The measure driver (§Architecture): every observer, and the sizes only the browser knows. Each watch tells at most
 * once a frame and stops with `dispose`.
 */
import type { CarryGeometry, MeasuredList, MeasuredRow } from "../model/carry";

/** A box in client pixels. */
export interface Box {
	readonly left: number;
	readonly top: number;
	readonly width: number;
	readonly height: number;
}

/** An element's top and left against `ancestor`'s content (its offsets summed up the offset parents), transforms aside: a box at rest, never mid-motion. */
function offsetIn(el: HTMLElement, ancestor: HTMLElement): { readonly left: number; readonly top: number } {
	let left = 0;
	let top = 0;
	let at: Element | null = el;
	while (at instanceof HTMLElement && at !== ancestor) {
		left += at.offsetLeft;
		top += at.offsetTop;
		const parent: Element | null = at.offsetParent;
		if (parent instanceof HTMLElement && parent !== ancestor && ancestor.contains(parent)) {
			left -= parent.scrollLeft;
			top -= parent.scrollTop;
		}
		at = parent;
	}
	return { left, top };
}

const px = (value: string): number => parseFloat(value) || 0;

export class Measure {
	/** The box of the row keyed `key` inside `root` as it stands now; null when none is drawn. */
	static row(root: ParentNode, key: string): Box | null {
		for (const el of root.querySelectorAll<HTMLElement>("[data-n-key]")) {
			if (el.dataset.nKey !== key) continue;
			const r = el.getBoundingClientRect();
			return { left: r.left, top: r.top, width: r.width, height: r.height };
		}
		return null;
	}

	/** A scroller's edges on the screen, and whether it holds more than it shows. */
	static scrollEdges(el: HTMLElement): { readonly top: number; readonly bottom: number; readonly scrolls: boolean } {
		const r = el.getBoundingClientRect();
		return { top: r.top, bottom: r.bottom, scrolls: el.scrollHeight > el.clientHeight };
	}

	/** The block's stack: the point (`x`, `y`) of the screen in its content pixels (where the carry's geometry stands). */
	static inStack(stack: HTMLElement, x: number, y: number): { readonly x: number; readonly y: number } {
		const r = stack.getBoundingClientRect();
		return { x: x - r.left - stack.clientLeft + stack.scrollLeft, y: y - r.top - stack.clientTop + stack.scrollTop };
	}

	/**
	 * The lists of the block's stack (`data-n-list`) as they rest, for a carry (P4): each list's box and each row's, in
	 * the stack's content pixels, and the card's size and step in from the stylesheet.
	 */
	static carry(stack: HTMLElement): CarryGeometry {
		const lists: MeasuredList[] = [];
		for (const list of stack.querySelectorAll<HTMLElement>("[data-n-list]")) {
			const column = list.dataset.nList;
			if (column !== "inbox" && column !== "soon" && column !== "day" && column !== "backlog" && column !== "projects") continue;
			const at = offsetIn(list, stack);
			const rows: MeasuredRow[] = [];
			for (const row of list.children) {
				if (!(row instanceof HTMLElement) || row.dataset.nKey === undefined) continue;
				const box = offsetIn(row, stack);
				rows.push({ key: row.dataset.nKey, top: box.top, left: box.left, width: row.offsetWidth, height: row.offsetHeight });
			}
			lists.push({ column, left: at.left, top: at.top, width: list.offsetWidth, bottom: at.top + list.offsetHeight, rows });
		}
		const style = stack.ownerDocument.defaultView?.getComputedStyle(stack);
		const token = (name: string) => px(style?.getPropertyValue(name) ?? "");
		return { lists, indent: token("--tc-subtask-indent"), cardHeight: token("--tc-card-h"), cardGap: token("--tc-card-gap"), dot: token("--tc-drop-dot") };
	}

	private readonly stops = new Set<() => void>();

	/**
	 * A page watched for any change of its own (a note's view: its mode switched, the reading view drawn again, the
	 * editor's content replaced), what changes inside `own` left out: `changed` once a frame.
	 */
	watchPage(page: HTMLElement, own: () => Node | null, changed: () => void): () => void {
		const view = page.ownerDocument.defaultView;
		if (!view) return () => undefined;
		let frame = 0;
		const observer = new view.MutationObserver((records) => {
			const mine = own();
			if (!records.some((record) => !(mine && mine.contains(record.target)))) return;
			if (frame) return;
			frame = view.requestAnimationFrame(() => {
				frame = 0;
				changed();
			});
		});
		observer.observe(page, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style"] });
		const stop = () => {
			observer.disconnect();
			if (frame) view.cancelAnimationFrame(frame);
			frame = 0;
			this.stops.delete(stop);
		};
		this.stops.add(stop);
		return stop;
	}

	dispose(): void {
		[...this.stops].forEach((stop) => stop());
	}
}
