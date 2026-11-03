/** A scrolling list as read once for a move: its box on the screen and how far it is scrolled. */
export interface ListFrame {
	readonly box: DOMRect;
	readonly scrollTop: number;
	readonly scrollLeft: number;
	readonly clientTop: number;
	readonly clientLeft: number;
}

/** One read of the layout: the box and the four numbers that turn the list's own pixels into the screen's. */
export function readFrame(el: HTMLElement): ListFrame {
	return {
		box: el.getBoundingClientRect(),
		scrollTop: el.scrollTop,
		scrollLeft: el.scrollLeft,
		clientTop: el.clientTop,
		clientLeft: el.clientLeft,
	};
}

/** A point on the screen in the list's content pixels, where `offsetTop` and the dashed places stand. */
export function toContent(frame: ListFrame, clientX: number, clientY: number): { x: number; y: number } {
	return {
		x: clientX - frame.box.left - frame.clientLeft + frame.scrollLeft,
		y: clientY - frame.box.top - frame.clientTop + frame.scrollTop,
	};
}

/** A point of the list's content on the screen. */
export function toClient(frame: ListFrame, x: number, y: number): { x: number; y: number } {
	return {
		x: frame.box.left + frame.clientLeft + x - frame.scrollLeft,
		y: frame.box.top + frame.clientTop + y - frame.scrollTop,
	};
}
