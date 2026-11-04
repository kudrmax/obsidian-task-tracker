import { el } from "../dom";
import { icon, type IconName } from "./icons";

/** How a button is drawn: its shape and padding. */
export type ButtonKind = "round" | "icon" | "bar" | "text" | "pill" | "swatch";
/** What a button means: each kind draws a tone its own way. */
export type ButtonTone = "plain" | "accent" | "quiet" | "strong" | "danger";

export interface ButtonSpec {
	readonly kind: ButtonKind;
	readonly tone?: ButtonTone;
	/** The button's name for a screen reader; a text or pill button shows it, unless `text` says something else. */
	readonly label: string;
	readonly icon?: IconName;
	/** What the button shows, beside its icon or alone. */
	readonly text?: string;
	readonly title?: string;
	/** The purpose: where the button stands and what is its own. */
	readonly cls?: string;
	readonly onPress: (e: MouseEvent) => void;
}

const SHOWS_LABEL: ReadonlySet<ButtonKind> = new Set(["text", "pill"]);

function shapeClass(kind: ButtonKind, tone: ButtonTone, cls?: string): string {
	return ["tc-btn", `is-${kind}`, `is-${tone}`, cls].filter(Boolean).join(" ");
}

/** The plugin's one button: a kind and a tone give it its look, the purpose class its place. */
export class Button {
	readonly el: HTMLButtonElement;
	/** Where the text goes: a label beside the icon, or the button itself. */
	private readonly textEl: HTMLElement;

	static create(parent: HTMLElement, spec: ButtonSpec): Button {
		return new Button(parent, spec);
	}

	private constructor(parent: HTMLElement, spec: ButtonSpec) {
		this.el = el(parent, "button", shapeClass(spec.kind, spec.tone ?? "plain", spec.cls));
		const shown = spec.text ?? (SHOWS_LABEL.has(spec.kind) ? spec.label : undefined);
		if (spec.text !== undefined || shown === undefined) this.el.setAttribute("aria-label", spec.label);
		if (spec.title) this.el.title = spec.title;
		if (spec.icon) this.el.appendChild(icon(spec.icon));
		this.textEl = spec.icon && shown !== undefined ? el(this.el, "span", "tc-btn-label") : this.el;
		if (shown) this.textEl.textContent = shown;
		this.el.addEventListener("click", spec.onPress);
	}

	setOn(on: boolean): void {
		this.el.classList.toggle("is-on", on);
	}

	/** Nothing to do for now: the button stays, dim. */
	setOff(off: boolean): void {
		this.el.classList.toggle("is-off", off);
	}

	setHidden(hidden: boolean): void {
		this.el.classList.toggle("is-hidden", hidden);
	}

	setText(text: string): void {
		this.textEl.textContent = text;
	}

	setIcon(name: IconName): void {
		this.el.querySelector(":scope > svg")?.remove();
		this.el.prepend(icon(name));
	}
}

/** The round button's look on what is not a button: the plus under the finger, the plus's ring. */
export function roundShape(parent: HTMLElement, name: IconName, tone: ButtonTone, cls?: string): HTMLElement {
	const shape = el(parent, "div", shapeClass("round", tone, cls));
	shape.appendChild(icon(name));
	return shape;
}
