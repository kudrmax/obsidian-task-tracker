import { DURATION, EASING, tokenMs } from "./design";
import { type Easing, easingOf } from "./easing";

/** How the phone keyboard slides: its time and its easing, which what rides on it takes too. */
export interface Glide {
	readonly ms: number;
	readonly ease: Easing;
	/** How far what stands on the keyboard rises with it: the keyboard's height as it slides in, 0 as it slides out. */
	readonly rise: number;
}

/** Obsidian's app says so on the window just before the keyboard starts to slide. */
const SLIDES = ["keyboardWillShow", "keyboardWillHide"] as const;

/** The view's mark while the keyboard is up: Obsidian hides its navigation then, yet still keeps room for it under the view. */
export const KEYBOARD_UP = "is-keyboard-up";

/**
 * The phone keyboard as Obsidian moves it. Just before it slides in or out the app says so, with the keyboard's height, and
 * by then the page knows that height; the view keeps its height until the keyboard stops.
 * `onSlide` hears that moment with the keyboard's glide, so what rides on the keyboard goes with it instead of after it.
 * From that moment the view is marked as standing over the keyboard or not.
 */
export class Keyboard {
	private readonly slides = (e: Event) => {
		const rise = e.type === "keyboardWillShow" ? keyboardHeight(e, this.root.ownerDocument) : 0;
		this.root.classList.toggle(KEYBOARD_UP, rise > 0);
		this.onSlide(this.glide(rise));
	};

	constructor(private readonly root: HTMLElement, private readonly onSlide: (glide: Glide) => void) {
		for (const type of SLIDES) root.ownerDocument.defaultView?.addEventListener(type, this.slides);
	}

	destroy(): void {
		for (const type of SLIDES) this.root.ownerDocument.defaultView?.removeEventListener(type, this.slides);
	}

	private glide(rise: number): Glide {
		return { ms: tokenMs(this.root, DURATION.keyboard), ease: easingOf(getComputedStyle(this.root).getPropertyValue(EASING.keyboard)), rise };
	}
}

/** The height Obsidian's app gives with the slide, else the one it has already put on the page. */
function keyboardHeight(e: Event, doc: Document): number {
	const given = (e as Event & { keyboardHeight?: unknown }).keyboardHeight;
	if (typeof given === "number") return given;
	return parseFloat(getComputedStyle(doc.documentElement).getPropertyValue("--keyboard-height")) || 0;
}
