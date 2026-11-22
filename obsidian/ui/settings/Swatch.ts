import { el } from "./dom";

export interface SwatchSpec {
	/** The colour's name for a screen reader. */
	readonly label: string;
	/** Its own purpose class, beside the swatch's look. */
	readonly cls?: string;
	readonly onPress: (e: MouseEvent) => void;
}

/** A colour's round button on the settings' priority and label rows: on while it is the row's colour. */
export class Swatch {
	readonly el: HTMLButtonElement;

	constructor(parent: HTMLElement, spec: SwatchSpec) {
		this.el = el(parent, "button", ["tc-btn", "is-swatch", "is-plain", spec.cls].filter(Boolean).join(" "));
		this.el.setAttribute("aria-label", spec.label);
		this.el.addEventListener("click", spec.onPress);
	}

	setOn(on: boolean): void {
		this.el.classList.toggle("is-on", on);
	}
}
