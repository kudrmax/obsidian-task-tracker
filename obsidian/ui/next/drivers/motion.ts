/**
 * The motion driver (§Architecture): every inline style and CSS variable the model gives, every animation, and the
 * reading of the boxes it animates, in the commit phase only. A drawing moves as the model says why it changed (P5):
 * `move` slides each keyed row that stood somewhere else before; `replace` draws in place. A row new to the drawing fades
 * in; nothing moves that the model did not cause. A transition runs once and is cancelled before the next measure.
 */

/** What a keyed row's box was before a drawing: read in the commit phase, right before the render. */
type Boxes = ReadonlyMap<string, DOMRect>;

/** A panel grows from its anchor's side: from its top left under the anchor, from its bottom left over it. */
const ORIGIN_BELOW = "0 0";
const ORIGIN_ABOVE = "0 100%";

/** A token of the stylesheet as milliseconds (`150ms`, `0.3s`). */
export function tokenMs(el: Element, token: string): number {
	const view = el.ownerDocument.defaultView;
	const value = view ? view.getComputedStyle(el).getPropertyValue(token).trim() : "";
	const n = parseFloat(value);
	if (!Number.isFinite(n)) return 0;
	return value.endsWith("ms") ? n : value.endsWith("s") ? n * 1000 : n;
}

function keyOf(el: Element): string | null {
	return el instanceof HTMLElement ? (el.dataset.nKey ?? null) : null;
}

export class Motion {
	private running: Animation[] = [];
	private boxes: Boxes = new Map();
	private readonly set = new Map<HTMLElement, Set<string>>();

	constructor(private readonly root: HTMLElement) {}

	/** The commit phase, before the render: running motions are cancelled, and the keyed rows' boxes read as they stand. */
	before(): void {
		this.cancel();
		const boxes = new Map<string, DOMRect>();
		for (const el of this.root.querySelectorAll("[data-n-key]")) {
			const key = keyOf(el);
			if (key !== null && !key.includes("/")) boxes.set(key, el.getBoundingClientRect());
		}
		this.boxes = boxes;
	}

	/**
	 * After the render: each row's variables from the model, then the drawing's motion. `move`: a row that stood elsewhere
	 * slides from there, a row new to it fades in. `replace`: nothing moves.
	 */
	after(cause: "move" | "replace" | "none", vars: ReadonlyMap<string, Readonly<Record<string, string>>>): void {
		this.applyVars(vars);
		if (cause !== "move") return;
		const ms = tokenMs(this.root, "--tc-duration-collapse");
		if (ms <= 0) return;
		const easing = this.root.ownerDocument.defaultView?.getComputedStyle(this.root).getPropertyValue("--tc-ease-out").trim() || "ease-out";
		for (const el of this.root.querySelectorAll<HTMLElement>("[data-n-key]")) {
			const key = keyOf(el);
			if (key === null || key.includes("/")) continue;
			const was = this.boxes.get(key);
			if (!was) {
				if (this.boxes.size > 0) this.running.push(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing }));
				continue;
			}
			const now = el.getBoundingClientRect();
			const dx = was.left - now.left;
			const dy = was.top - now.top;
			if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
			this.running.push(el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: ms, easing }));
		}
	}

	/** Every motion under way stops where it ends: what is drawn stands at once. */
	cancel(): void {
		for (const animation of this.running.splice(0)) animation.cancel();
	}

	/** Each keyed element's variables as the model gives them; a variable the model no longer gives is taken away. */
	private applyVars(vars: ReadonlyMap<string, Readonly<Record<string, string>>>): void {
		const seen = new Set<HTMLElement>();
		for (const el of this.root.querySelectorAll<HTMLElement>("[data-n-key]")) {
			const key = keyOf(el);
			const given = key === null ? undefined : vars.get(key);
			const had = this.set.get(el);
			if (!given && !had) continue;
			seen.add(el);
			const names = new Set(Object.keys(given ?? {}));
			for (const name of had ?? []) if (!names.has(name)) el.style.removeProperty(name);
			for (const [name, value] of Object.entries(given ?? {})) if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
			this.set.set(el, names);
		}
		for (const el of [...this.set.keys()]) if (!seen.has(el)) this.set.delete(el);
	}

	/** One variable or property on an element the host places (the block's room over Live Preview's end). */
	static put(el: HTMLElement, name: string, value: string): void {
		if (value === "") el.style.removeProperty(name);
		else if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
	}

	/** An inline value Obsidian set on its own element: the room Live Preview keeps past the note's end (`.cm-content`'s padding). */
	static inline(el: HTMLElement, name: string): string {
		return el.style.getPropertyValue(name);
	}

	/** Layer parts shown, and the ones whose close has begun: each fades once. */
	private readonly shown = new WeakSet<HTMLElement>();
	private readonly leaving = new WeakSet<HTMLElement>();

	/**
	 * The layers' parts in the overlay host (`data-n-part`), after the render: a new part is stood by its anchor in the
	 * screen (`data-n-place` names a `data-n-anchor`) and fades in with the others of its layer; a part whose layer closes
	 * (`data-n-closing`) fades out, and `gone(layer)` is told once every part of that layer has.
	 */
	layers(host: HTMLElement, screen: ParentNode, gone: (layer: number) => void): void {
		const view = host.ownerDocument.defaultView;
		if (!view) return;
		const style = view.getComputedStyle(this.root);
		const menuMs = tokenMs(this.root, "--tc-duration-menu");
		const outMs = tokenMs(this.root, "--tc-duration-collapse");
		const easing = style.getPropertyValue("--tc-ease-out").trim() || "ease-out";
		const closing = new Map<number, Promise<unknown>[]>();
		for (const part of host.querySelectorAll<HTMLElement>("[data-n-part]")) {
			const layer = Number(part.dataset.nLayer ?? "0");
			if (part.dataset.nClosing !== undefined) {
				if (this.leaving.has(part)) continue;
				this.leaving.add(part);
				const fade = part.animate([{ opacity: 1 }, { opacity: 0 }], { duration: outMs, easing, fill: "forwards" });
				part.style.pointerEvents = "none";
				closing.set(layer, [...(closing.get(layer) ?? []), fade.finished.catch(() => undefined)]);
				continue;
			}
			if (this.shown.has(part)) continue;
			this.shown.add(part);
			const above = this.place(part, screen, view);
			if (part.dataset.nPart === "panel") {
				const rise = parseFloat(style.getPropertyValue("--tc-menu-rise")) || 0;
				const scale = style.getPropertyValue("--tc-menu-scale").trim() || "1";
				part.style.transformOrigin = above ? ORIGIN_ABOVE : ORIGIN_BELOW;
				part.animate([{ opacity: 0, transform: `translate3d(0, ${above ? rise : -rise}px, 0) scale(${scale})` }, { opacity: 1, transform: "none" }], { duration: menuMs, easing });
			} else part.animate([{ opacity: 0 }, { opacity: 1 }], { duration: menuMs, easing });
		}
		for (const [layer, fades] of closing) void Promise.all(fades).then(() => gone(layer));
	}

	/** A part stood by its anchor: a copy on it; a panel under it, or over it when it does not fit under; answers whether over. */
	private place(part: HTMLElement, screen: ParentNode, view: Window): boolean {
		const name = part.dataset.nPlace;
		if (name === undefined) return false;
		let anchor: HTMLElement | null = null;
		for (const el of screen.querySelectorAll<HTMLElement>("[data-n-anchor]")) if (el.dataset.nAnchor === name) anchor = el;
		if (!anchor) return false;
		const rect = anchor.getBoundingClientRect();
		const how = part.dataset.nHow;
		if (how === "copy") {
			part.style.left = `${rect.left}px`;
			part.style.top = `${rect.top}px`;
			part.style.width = `${rect.width}px`;
			part.style.height = `${rect.height}px`;
			return false;
		}
		const style = view.getComputedStyle(part);
		const gap = parseFloat(style.getPropertyValue("--tc-menu-gap")) || 0;
		const margin = parseFloat(style.getPropertyValue("--tc-whole-margin")) || 0;
		const width = part.offsetWidth;
		const height = part.offsetHeight;
		const wanted = how === "centre" ? rect.left + (rect.width - width) / 2 : rect.left;
		const left = Math.max(0, Math.min(wanted, view.innerWidth - gap - width));
		const below = view.innerHeight - margin - rect.bottom - gap;
		const above = height > below;
		part.style.left = `${left}px`;
		if (above) {
			part.style.top = "auto";
			part.style.bottom = `${view.innerHeight - rect.top + gap}px`;
		} else part.style.top = `${rect.bottom + gap}px`;
		return above;
	}

	dispose(): void {
		this.cancel();
		this.set.clear();
	}
}
