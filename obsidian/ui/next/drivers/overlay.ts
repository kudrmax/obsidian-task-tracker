/**
 * The overlay host (§Architecture): the one place every sheet of a screen mounts, a node of its own over the window the
 * screen stands in (a popout's menu opens there). Made once, never diffed by anyone but the view rendered into it.
 */
export class OverlayHost {
	readonly node: HTMLElement;

	constructor(near: Node) {
		const doc = near.ownerDocument ?? (near as Document);
		this.node = doc.createElement("div");
		doc.body.appendChild(this.node);
	}

	dispose(): void {
		this.node.remove();
	}
}
