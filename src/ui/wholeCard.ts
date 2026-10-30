import { tokenPx } from "./design";
import { px } from "./dom";

export interface Size {
	readonly width: number;
	readonly height: number;
}

/** The window a grown card stays inside, and the margin it keeps from the window's edges. */
export interface Room extends Size {
	readonly margin: number;
}

/** How wide a card grows to show its title on one line: by what the title lacks, up to `widest`, never narrower than it was. */
export function wholeWidth(width: number, missing: number, widest: number): number {
	return Math.max(width, Math.min(width + missing, widest));
}

/** The widest a card standing still grows: the window less its margins. */
export function roomWidth(room: Room): number {
	return room.width - 2 * room.margin;
}

/**
 * Where a grown card starts on one axis: where it did, pulled back only as far as it takes to end inside the window's
 * margin (or where the card ended, if that is further), and never pulled past the near margin.
 */
export function grownStart(start: number, size: number, grown: number, room: number, margin: number): number {
	const end = Math.max(start + size, room - margin);
	return Math.max(Math.min(start, margin), Math.min(start, end - grown));
}

export function windowRoom(el: Element): Room {
	return { width: window.innerWidth, height: window.innerHeight, margin: tokenPx(el, "--tc-whole-margin") };
}

/**
 * A copy of a card, pressed, shows its whole title: a title cut by the card's edge or faded by its mask makes the copy
 * grow up to `widest`, then wrap onto more lines. A title that is shown whole leaves the copy as it is.
 */
export function showWhole(copy: HTMLElement, size: Size, widest: number): Size {
	copy.style.width = px(size.width);
	copy.style.height = px(size.height);
	const title = copy.querySelector<HTMLElement>(".tc-card-title");
	if (!title) return size;
	const range = document.createRange();
	range.selectNodeContents(title);
	const textWidth = range.getBoundingClientRect().width;
	if (textWidth <= title.clientWidth - tokenPx(copy, "--tc-fade-card")) return size;
	const width = wholeWidth(size.width, textWidth - title.clientWidth, widest);
	copy.classList.add("is-whole");
	copy.style.width = px(width);
	const body = getComputedStyle(copy.querySelector(".tc-block-card") ?? copy);
	const height = Math.max(size.height, Math.ceil(title.getBoundingClientRect().height + parseFloat(body.paddingTop) + parseFloat(body.paddingBottom)));
	copy.style.height = px(height);
	return { width, height };
}
