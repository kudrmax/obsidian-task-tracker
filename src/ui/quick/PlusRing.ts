import { LAYOUT } from "../design";
import type { DropTarget } from "../drag/DropTarget";
import { el } from "../dom";
import { icon, type IconName } from "../icons";

/**
 * The plus's own place while the plus is carried: a dashed ring that lights up when the card comes back to it. Let go
 * there, the drop is a cancel: nothing is created and the card flies back to where the plus was. While several picked
 * tasks are carried the plus's place is such a ring too, with a cross: a drop there puts them all back.
 */
export class PlusRing implements DropTarget {
	private ring: HTMLElement | null = null;

	constructor(
		private readonly parent: HTMLElement,
		private readonly mark: IconName = "plus",
	) {}

	show(): void {
		if (this.ring) return;
		this.ring = el(this.parent, "div", `tc-plus-ring is-${this.mark}`);
		this.ring.appendChild(icon(this.mark));
	}

	hide(): void {
		this.ring?.remove();
		this.ring = null;
	}

	/** Near enough: the finger is closer to the ring's centre than its radius plus the reach. */
	hitTest(x: number, y: number): boolean {
		const rect = this.landing();
		if (!rect) return false;
		const distance = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
		return distance < rect.width / 2 + LAYOUT.plusRingReach;
	}

	preview(): void {
		this.ring?.classList.add("is-hot");
	}

	landing(): DOMRect | null {
		return this.ring?.getBoundingClientRect() ?? null;
	}

	leave(): void {
		this.clear();
	}

	clear(): void {
		this.ring?.classList.remove("is-hot");
	}

	drop(): null {
		return null;
	}
}
