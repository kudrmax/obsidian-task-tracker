import { DURATION, EASING, tokenMs } from "./design";
import { type Easing, easingOf } from "./easing";

/** How the phone keyboard slides: its time and its easing, which what rides on it takes too. */
export interface Glide {
	readonly ms: number;
	readonly ease: Easing;
}

/** Obsidian's app says so on the window just before the keyboard starts to slide. */
const SLIDES = ["keyboardWillShow", "keyboardWillHide"] as const;

/**
 * The phone keyboard as Obsidian moves it. Just before it slides in or out the app says so, and by then the toolbar over
 * it stands where it will stop, though it is still drawn on its way; the view keeps its height until the keyboard stops.
 * `onSlide` hears that moment with the keyboard's glide, so what rides on the keyboard goes with it instead of after it.
 */
export class Keyboard {
	private readonly slides = () => this.onSlide(this.glide());

	constructor(private readonly root: HTMLElement, private readonly onSlide: (glide: Glide) => void) {
		for (const type of SLIDES) root.ownerDocument.defaultView?.addEventListener(type, this.slides);
	}

	destroy(): void {
		for (const type of SLIDES) this.root.ownerDocument.defaultView?.removeEventListener(type, this.slides);
	}

	private glide(): Glide {
		return { ms: tokenMs(this.root, DURATION.keyboard), ease: easingOf(getComputedStyle(this.root).getPropertyValue(EASING.keyboard)) };
	}
}
