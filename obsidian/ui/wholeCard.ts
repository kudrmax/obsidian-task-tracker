import { wholeWidth } from "../../core/application/contracts";
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

export function windowRoom(el: Element): Room {
	return { width: activeWindow.innerWidth, height: activeWindow.innerHeight, margin: tokenPx(el, "--tc-whole-margin") };
}

/**
 * A copy of a card, pressed, shows its whole title: a title cut by the card's edge or faded by its mask stretches the
 * copy to the right on its one line, as far as the core's `wholeWidth` says; one longer than that still fades at the end.
 * A title that is shown whole leaves the copy as it is. Returns the copy's width, and whether the title is still cut.
 */
export function stretchWhole(copy: HTMLElement, size: Size, room: Room): { readonly width: number; readonly cut: boolean } {
	copy.style.width = px(size.width);
	copy.style.height = px(size.height);
	const title = copy.querySelector<HTMLElement>(".tc-card-title");
	if (!title) return { width: size.width, cut: false };
	const grown = wholeWidth({ width: size.width, titleWidth: title.clientWidth, textWidth: textWidth(title), fade: tokenPx(copy, "--tc-fade-card") }, room);
	if (!grown) return { width: size.width, cut: false };
	copy.classList.toggle("is-stretched", !grown.cut);
	copy.style.width = px(grown.width);
	return grown;
}

/** The width of a title's text on one line, however much of it its box shows. */
function textWidth(title: HTMLElement): number {
	const range = document.createRange();
	range.selectNodeContents(title);
	return range.getBoundingClientRect().width;
}

/** The copy over the menu goes further: a title still cut after stretching wraps onto more lines, and the copy grows down. */
export function showWhole(copy: HTMLElement, size: Size, room: Room): Size {
	const { width, cut } = stretchWhole(copy, size, room);
	if (!cut) return { width, height: size.height };
	const title = copy.querySelector<HTMLElement>(".tc-card-title")!;
	copy.classList.add("is-whole");
	const body = getComputedStyle(copy.querySelector(".tc-block-card") ?? copy);
	const height = Math.max(size.height, Math.ceil(title.getBoundingClientRect().height + parseFloat(body.paddingTop) + parseFloat(body.paddingBottom)));
	copy.style.height = px(height);
	return { width, height };
}

/** How tall an event grows to show its wrapped title: no shorter than it was, its own padding around the lines. */
export function wholeHeight(height: number, lines: number, padding: number): number {
	return Math.max(height, Math.ceil(lines + padding));
}

/**
 * An event is tall already: the copy of one, pressed, wraps a title it cuts inside its own width and grows down only when
 * the lines need more than its height. A tiny event takes the usual title size to wrap. Its width never changes.
 */
export function showWholeEvent(copy: HTMLElement, size: Size): Size {
	copy.style.width = px(size.width);
	copy.style.height = px(size.height);
	const title = copy.querySelector<HTMLElement>(".tc-item-title");
	const body = copy.querySelector<HTMLElement>(".tc-event-body");
	if (!title || !body || textWidth(title) <= title.clientWidth - tokenPx(copy, "--tc-fade-block")) return size;
	copy.classList.add("is-whole");
	copy.querySelector(".tc-event")?.classList.remove("is-tiny");
	const style = getComputedStyle(body);
	const height = wholeHeight(size.height, title.getBoundingClientRect().height, parseFloat(style.paddingTop) + parseFloat(style.paddingBottom));
	copy.style.height = px(height);
	return { width: size.width, height };
}
