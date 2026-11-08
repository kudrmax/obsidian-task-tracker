import { DURATION } from "../design";
import { px } from "../dom";
import { timingOf } from "../motion/Motion";

/** A part of a menu's panel as it stood before a change: shown or not, and its box. */
interface Stood {
	readonly shown: boolean;
	readonly rect: DOMRect;
	readonly above: boolean;
}

const MORPHS = new WeakMap<HTMLElement, Animation>();

/**
 * The pages of a menu's panel (the menu, Section, Project, Repeat, Pick a date, a question): another page, or the same
 * one changed, grows or shrinks the panel from its old size and place to its new ones, a part split off over the card
 * folding into it or out of it, and each page keeps its own scroll. `parts`: the panel, then the part over the card.
 */
export class PanelPages {
	private page: string | null = null;
	private readonly scrolls = new Map<string, readonly number[]>();

	constructor(private readonly parts: () => readonly HTMLElement[]) {}

	/** Page `name` laid out and placed by `build`; the same name again is the page changed in place, its scroll kept. */
	show(name: string, build: () => void): void {
		const parts = this.parts();
		if (this.page !== null) this.scrolls.set(this.page, parts.map((part) => part.scrollTop));
		const open = parts[0].classList.contains("is-shown");
		const before = open ? parts.map(standing) : null;
		for (const part of parts) MORPHS.get(part)?.cancel();
		build();
		this.page = name;
		const scrolls = this.scrolls.get(name) ?? [];
		parts.forEach((part, i) => (part.scrollTop = scrolls[i] ?? 0));
		if (before) parts.forEach((part, i) => morph(part, before[i]));
	}
}

function standing(part: HTMLElement): Stood {
	return { shown: !part.hidden, rect: part.getBoundingClientRect(), above: part.classList.contains("is-above") };
}

/** One part from where it stood to where it stands now: its size, and its place from the edge it hangs from. */
function morph(part: HTMLElement, from: Stood): void {
	const timing = timingOf(part, DURATION.menu);
	if (!timing) return;
	const shown = !part.hidden;
	if (!from.shown && !shown) return;
	if (!shown) {
		part.hidden = false;
		const fold = part.animate(
			[
				{ height: px(from.rect.height), opacity: "1" },
				{ height: "0px", opacity: "0" },
			],
			{ ...timing, fill: "forwards" },
		);
		MORPHS.set(part, fold);
		part.style.overflow = "hidden";
		const done = () => {
			part.style.overflow = "";
			if (MORPHS.get(part) !== fold) return;
			part.hidden = true;
			fold.cancel();
		};
		fold.addEventListener("finish", done);
		return;
	}
	const to = part.getBoundingClientRect();
	const start = from.shown ? from.rect : new DOMRect(to.left, part.classList.contains("is-above") ? to.bottom : to.top, to.width, 0);
	const above = part.classList.contains("is-above");
	const dy = from.shown && from.above === above ? 0 : above ? start.bottom - to.bottom : start.top - to.top;
	const dx = start.left - to.left;
	if (Math.abs(start.width - to.width) < 0.5 && Math.abs(start.height - to.height) < 0.5 && Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
	part.style.overflow = "hidden";
	const grow = part.animate(
		[
			{ width: px(start.width), height: px(start.height), transform: `translate(${dx}px, ${dy}px)`, opacity: from.shown ? "1" : "0" },
			{ width: px(to.width), height: px(to.height), transform: "none", opacity: "1" },
		],
		timing,
	);
	MORPHS.set(part, grow);
	const done = () => {
		if (MORPHS.get(part) === grow) part.style.overflow = "";
	};
	grow.addEventListener("finish", done);
	grow.addEventListener("cancel", done);
}
