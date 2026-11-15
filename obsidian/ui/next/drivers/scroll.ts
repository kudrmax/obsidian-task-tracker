/** The scroll driver (§Architecture): every programmatic scroll, smooth as the plugin's one smooth scroll is. */
export class Scroll {
	/** `scroller` glides to `top`. */
	static glide(scroller: HTMLElement, top: number): void {
		scroller.scrollTo({ top, behavior: "smooth" });
	}
}
