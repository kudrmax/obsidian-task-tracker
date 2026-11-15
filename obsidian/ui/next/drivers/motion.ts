import { grownStart, wholeWidth } from "../../../../core/application/contracts";
import type { MenuPlace, PanelPlace } from "../model/taskMenu";
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
/** A side left to the other: a panel hanging from the bar stands by one of its edges only. */
const AUTO = "auto";
const ORIGIN_ABOVE = "0 100%";
/** A panel hanging from its anchor's top grows from its own top middle. */
const ORIGIN_TOP = "50% 0";

/** A token of the stylesheet as pixels (`12px`), 0 when it says no number. */
export function tokenPx(el: Element, token: string): number {
	const view = el.ownerDocument.defaultView;
	return parseFloat(view ? view.getComputedStyle(el).getPropertyValue(token) : "") || 0;
}

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
	/** The variables written on each element, as written: compared here, never read back from its style. */
	private readonly set = new Map<HTMLElement, ReadonlyMap<string, string>>();

	constructor(private readonly root: HTMLElement) {}

	/** The commit phase, before the render: running motions are cancelled, and the keyed rows' boxes read as they stand. */
	before(moving = true): void {
		this.cancel();
		const boxes = new Map<string, DOMRect>();
		/** A drawing that moves nothing (a layer opened, another context) reads no box: nothing slides from where it stood. */
		if (!moving) {
			this.boxes = boxes;
			return;
		}
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
	after(cause: "move" | "replace" | "none", vars: ReadonlyMap<string, Readonly<Record<string, string>>>, heirs: ReadonlyMap<string, string> = new Map()): void {
		this.applyVars(vars);
		if (cause !== "move") return;
		const ms = tokenMs(this.root, "--tc-duration-collapse");
		if (ms <= 0) return;
		const easing = this.root.ownerDocument.defaultView?.getComputedStyle(this.root).getPropertyValue("--tc-ease-out").trim() || "ease-out";
		for (const el of this.root.querySelectorAll<HTMLElement>("[data-n-key]")) {
			const key = keyOf(el);
			if (key === null || key.includes("/")) continue;
			/** A row new to the drawing that takes another's place (a written line's card, the field's) starts from that one's box. */
			const heir = heirs.get(key);
			const was = this.boxes.get(key) ?? (heir === undefined ? undefined : this.boxes.get(heir));
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

	/** The variables of the overlay host's keyed parts (a project's depth on a menu's page), as `after` writes the screen's. */
	layerVars(host: HTMLElement, vars: ReadonlyMap<string, Readonly<Record<string, string>>>): void {
		this.applyVars(vars, host);
	}

	/** Each keyed element's variables as the model gives them; a variable the model no longer gives is taken away. */
	private applyVars(vars: ReadonlyMap<string, Readonly<Record<string, string>>>, root: HTMLElement = this.root): void {
		const seen = new Set<HTMLElement>();
		for (const el of root.querySelectorAll<HTMLElement>("[data-n-key]")) {
			const key = keyOf(el);
			const given = key === null ? undefined : vars.get(key);
			const had = this.set.get(el);
			if (!given && !had) continue;
			seen.add(el);
			const now = new Map(Object.entries(given ?? {}));
			for (const name of had?.keys() ?? []) if (!now.has(name)) el.style.removeProperty(name);
			for (const [name, value] of now) if (had?.get(name) !== value) el.style.setProperty(name, value);
			this.set.set(el, now);
		}
		for (const el of [...this.set.keys()]) if (!el.isConnected || (root.contains(el) && !seen.has(el))) this.set.delete(el);
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
		/** Nothing new to stand or fade: no style is read, so a drawing with no layer to move costs no recalculation. */
		const parts = [...host.querySelectorAll<HTMLElement>("[data-n-part]")].filter((part) => (part.dataset.nClosing !== undefined ? !this.leaving.has(part) : !this.shown.has(part)));
		if (parts.length === 0) return;
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
			if (this.shown.has(part) || part.dataset.nOwn !== undefined) continue;
			this.shown.add(part);
			const above = this.place(part, screen, view);
			const kind = part.dataset.nPart;
			if (kind === "panel") {
				const rise = parseFloat(style.getPropertyValue("--tc-menu-rise")) || 0;
				const scale = style.getPropertyValue("--tc-menu-scale").trim() || "1";
				part.style.transformOrigin = part.dataset.nHow === "top" ? ORIGIN_TOP : above ? ORIGIN_ABOVE : ORIGIN_BELOW;
				part.animate([{ opacity: 0, transform: `translate3d(0, ${above ? rise : -rise}px, 0) scale(${scale})` }, { opacity: 1, transform: "none" }], { duration: menuMs, easing });
			} else if (kind === "sheet" || kind === "search") {
				/** A sheet over the block (the full card; the phone's search) rises in as it shows. */
				const rise = parseFloat(style.getPropertyValue("--tc-rise")) || 0;
				const ms = kind === "sheet" ? tokenMs(this.root, "--tc-duration-fade") : menuMs;
				part.animate([{ opacity: 0, transform: `translate3d(0, ${rise}px, 0)` }, { opacity: 1, transform: "none" }], { duration: ms, easing });
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
		if (how === "top") {
			/** Hanging from the anchor's top, in its middle (the desktop's search over the block). */
			part.style.setProperty("--tc-n-hang-left", `${rect.left + rect.width / 2}px`);
			part.style.setProperty("--tc-n-hang-top", `${rect.top}px`);
			part.style.setProperty("--tc-n-hang-room", `${rect.height}px`);
			return false;
		}
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

	/** The carried float's parts in the overlay host (`data-n-float`). */
	private static floats(host: ParentNode): { readonly card: HTMLElement | null; readonly all: readonly HTMLElement[] } {
		const all = [...host.querySelectorAll<HTMLElement>("[data-n-float]")];
		return { card: all.find((el) => el.dataset.nFloat === "card") ?? null, all };
	}

	/**
	 * The transient channel (P5): the carried float under the finger at (`x`, `y`), held as it was grabbed (`grab`, from
	 * the card's top left; a grab further right than the float reaches holds it by its middle), kept inside the window's
	 * margin. Only transforms are written: nothing is laid out or drawn again.
	 */
	floatAt(host: ParentNode, x: number, y: number, grab: { readonly dx: number; readonly dy: number }): void {
		const { card, all } = Motion.floats(host);
		if (!card) return;
		const view = card.ownerDocument.defaultView;
		const margin = parseFloat(view?.getComputedStyle(card).getPropertyValue("--tc-whole-margin") ?? "") || 0;
		if (!this.stretched.has(card)) {
			this.stretched.add(card);
			Motion.stretch(card, all, view?.innerWidth ?? 0, margin);
		}
		const width = card.offsetWidth;
		const held = width > 0 && grab.dx > width ? width / 2 : grab.dx;
		const room = view?.innerWidth ?? width;
		const left = Math.max(margin, Math.min(x - held, room - margin - width));
		const transform = `translate3d(${left}px, ${y - grab.dy}px, 0)`;
		for (const part of all) part.style.transform = transform;
	}

	/**
	 * The float's flight, a declared transition run once (P5): onto `to`'s box (the card where the drop landed, or its
	 * place a cancel goes back to), taking its size and a resting card's look; with no `to`, fading where it is. `done`
	 * once it has ended, or at once with nothing to fly.
	 */
	fly(host: ParentNode, key: string | null, done: () => void, later = false): void {
		const view = this.root.ownerDocument.defaultView;
		if (later && view) {
			view.requestAnimationFrame(() => this.fly(host, key, done));
			return;
		}
		const to = key === null ? null : Motion.target(this.root, key);
		const { card, all } = Motion.floats(host);
		if (!card) return done();
		const ms = tokenMs(this.root, "--tc-duration-fly");
		const easing = view?.getComputedStyle(this.root).getPropertyValue("--tc-ease-out").trim() || "ease-out";
		for (const part of all) if (part !== card) part.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing, fill: "forwards" });
		const from = card.getBoundingClientRect();
		const box = to?.getBoundingClientRect() ?? null;
		const frames = Motion.flight(card.dataset.nFloatKind ?? "card", from, box, to !== null && to.hasAttribute("data-n-anchor") && !to.hasAttribute("data-n-key"));
		const flight = card.animate(frames, { duration: ms, easing, fill: "forwards" });
		this.running.push(flight);
		flight.finished.then(done, done);
	}

	/** The element a flight ends on: the row keyed `key`, else the part the view anchors by that name. */
	private static target(root: ParentNode, key: string): Element | null {
		for (const el of root.querySelectorAll<HTMLElement>("[data-n-key]")) if (el.dataset.nKey === key) return el;
		for (const el of root.querySelectorAll<HTMLElement>("[data-n-anchor]")) if (el.dataset.nAnchor === key) return el;
		return null;
	}

	/**
	 * A float's flight (the old screen's `FloatingCard`, `PlusFloat`, `SectionFloat`): a card onto the card where it landed,
	 * taking its size; the plus back into its place (`home`), or into the field it opened, as tall as the field, fading
	 * there; a section folding shut onto its header; with nowhere to go, fading where it is.
	 */
	private static flight(kind: string, from: DOMRect, box: DOMRect | null, home: boolean): Keyframe[] {
		const at = `translate3d(${from.left}px, ${from.top}px, 0)`;
		if (!box) return [{ opacity: 1 }, { opacity: 0 }];
		if (kind === "plus") {
			if (home) return [{ transform: at }, { transform: `translate3d(${box.left}px, ${box.top}px, 0)` }];
			const scale = Math.min(1, box.height / (from.height || 1));
			return [
				{ transform: at, opacity: 1 },
				{ transform: `translate3d(${box.left}px, ${box.top + box.height / 2 - (from.height * scale) / 2}px, 0) scale(${scale})`, opacity: 0 },
			];
		}
		if (kind === "section") return [{ transform: at }, { transform: `translate3d(${box.left}px, ${box.top}px, 0) scale(1, 0)` }];
		return [
			{ transform: at, width: `${from.width}px`, height: `${from.height}px` },
			{ transform: `translate3d(${box.left}px, ${box.top}px, 0)`, width: `${box.width}px`, height: `${box.height}px` },
		];
	}

	private readonly stretched = new WeakSet<HTMLElement>();

	/**
	 * The float stretched to show its whole title on one line (the old screen's `stretchWhole`), as far as the core's
	 * `wholeWidth` says inside the window's margin; the layers under it narrower by the same.
	 */
	private static stretch(card: HTMLElement, all: readonly HTMLElement[], room: number, margin: number): void {
		const title = card.querySelector<HTMLElement>("[data-n-title]");
		if (!title) return;
		const range = card.ownerDocument.createRange();
		range.selectNodeContents(title);
		const fade = parseFloat(card.ownerDocument.defaultView?.getComputedStyle(card).getPropertyValue("--tc-fade-card") ?? "") || 0;
		const width = card.offsetWidth;
		const grown = wholeWidth({ width, titleWidth: title.clientWidth, textWidth: range.getBoundingClientRect().width, fade }, { width: room, margin });
		if (!grown) return;
		if (!grown.cut) card.style.setProperty("--tc-n-title-mask", "none");
		const more = grown.width - width;
		for (const part of all) if (part.dataset.nFloat !== "count") part.style.setProperty("width", `${part.offsetWidth + more}px`);
		for (const part of all) if (part.dataset.nFloat === "count") part.style.setProperty("margin-left", `calc(${more}px + ${part.ownerDocument.defaultView?.getComputedStyle(part).marginLeft ?? "0px"})`);
	}

	/** The block's frame keeps the height it has while a carry stands (P6): what changes in the lists under the finger never refits it. */
	static holdHeight(frame: HTMLElement, held: boolean): void {
		if (!held) return void frame.style.removeProperty("height");
		if (frame.style.getPropertyValue("height") === "") frame.style.setProperty("height", `${frame.getBoundingClientRect().height}px`);
	}

	/**
	 * A task's menu or the bulk menu in the overlay host, after the render. Drawn for a panel not yet measured
	 * (`data-n-measure` holds its seq), it is measured and `report`ed where its parts stand (P4): the copy of the card grown
	 * to show its title (`wholeWidth`, `grownStart`), the panel under the copy or over it, split when it fits on neither
	 * side, the labels too long for their boxes. Drawn for one measured (`place`), its parts are stood there, and grow in
	 * the first time they show.
	 */
	menu(host: HTMLElement, screen: ParentNode, measured: MenuPlace | null, report: (place: MenuPlace) => void): void {
		const view = host.ownerDocument.defaultView;
		const panel = host.querySelector<HTMLElement>('[data-n-part="menu-panel"]');
		if (!view || !panel || panel.dataset.nClosing !== undefined) return;
		const seq = panel.dataset.nMeasure;
		if (seq !== undefined) {
			report(this.measureMenu(host, screen, panel, Number(seq), view, measured?.copy ?? null));
			return;
		}
		const place = measured;
		if (!place) return;
		const lifted = host.querySelector<HTMLElement>('[data-n-part="lifted"]');
		if (lifted && place.copy) this.box(lifted, place.copy.box);
		for (const copy of host.querySelectorAll<HTMLElement>('[data-n-part="lifted-copy"]')) {
			const box = place.copies.get(copy.dataset.nKey ?? "");
			if (box) this.box(copy, box);
		}
		this.stand(panel, place.panel);
		const upper = host.querySelector<HTMLElement>('[data-n-part="menu-upper"]');
		if (upper && place.upper) this.stand(upper, place.upper);
		const style = view.getComputedStyle(this.root);
		const ms = tokenMs(this.root, "--tc-duration-menu");
		const easing = style.getPropertyValue("--tc-ease-out").trim() || "ease-out";
		const rise = parseFloat(style.getPropertyValue("--tc-menu-rise")) || 0;
		const scale = style.getPropertyValue("--tc-menu-scale").trim() || "1";
		for (const part of [panel, upper]) {
			if (!part || this.shown.has(part)) continue;
			this.shown.add(part);
			const over = part === upper || place.panel.top === null;
			part.style.transformOrigin = over ? ORIGIN_ABOVE : ORIGIN_BELOW;
			part.animate([{ opacity: 0, transform: `translate3d(0, ${over ? rise : -rise}px, 0) scale(${scale})` }, { opacity: 1, transform: "none" }], { duration: ms, easing });
		}
	}

	private box(el: HTMLElement, box: { readonly left: number; readonly top: number; readonly width: number; readonly height: number }): void {
		el.style.left = `${box.left}px`;
		el.style.top = `${box.top}px`;
		el.style.width = `${box.width}px`;
		el.style.height = `${box.height}px`;
	}

	private stand(el: HTMLElement, place: PanelPlace): void {
		el.style.left = `${place.left}px`;
		el.style.top = place.top === null ? "auto" : `${place.top}px`;
		el.style.bottom = place.bottom === null ? "auto" : `${place.bottom}px`;
		el.style.maxHeight = place.maxHeight === null ? "" : `${place.maxHeight}px`;
	}

	/** `copy`: where the copy of the card stands already (a page changed in place): it stays there, measured once a menu. */
	private measureMenu(host: HTMLElement, screen: ParentNode, panel: HTMLElement, seq: number, view: Window, kept: MenuPlace["copy"]): MenuPlace {
		/** Measured by its layout, whole: a room it was kept to before is no part of it. */
		panel.style.maxHeight = "";
		const margin = parseFloat(view.getComputedStyle(panel).getPropertyValue("--tc-whole-margin")) || 0;
		const gap = parseFloat(view.getComputedStyle(panel).getPropertyValue("--tc-menu-gap")) || 0;
		const probe = host.querySelector<HTMLElement>('[data-n-probe="safe"]');
		const safe = probe ? view.getComputedStyle(probe) : null;
		const room = { top: (parseFloat(safe?.paddingTop ?? "") || 0) + margin, bottom: view.innerHeight - (parseFloat(safe?.paddingBottom ?? "") || 0) - margin, right: view.innerWidth, height: view.innerHeight };
		const anchorOf = (key: string): DOMRect | null => {
			for (const el of screen.querySelectorAll<HTMLElement>("[data-n-key]")) if (el.dataset.nKey === key) return el.getBoundingClientRect();
			return null;
		};
		const copies = new Map<string, { left: number; top: number; width: number; height: number }>();
		for (const copy of host.querySelectorAll<HTMLElement>('[data-n-part="lifted-copy"]')) {
			const key = copy.dataset.nKey ?? "";
			const rect = anchorOf(key);
			if (rect && rect.width > 0 && rect.bottom >= 0 && rect.top <= view.innerHeight) copies.set(key, { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
		}
		const lifted = host.querySelector<HTMLElement>('[data-n-part="lifted"]');
		let copy: MenuPlace["copy"] = null;
		let anchor: { left: number; top: number; bottom: number } | null = null;
		const cardKey = panel.dataset.nAnchorKey;
		const card = cardKey === undefined ? null : anchorOf(cardKey);
		if (kept) {
			copy = kept;
			anchor = { left: kept.box.left, top: kept.box.top, bottom: kept.box.top + kept.box.height };
		} else if (lifted && card) {
			this.box(lifted, { left: card.left, top: card.top, width: card.width, height: card.height });
			const title = lifted.querySelector<HTMLElement>('[data-n-part="title"]');
			const range = host.ownerDocument.createRange();
			if (title) range.selectNodeContents(title);
			const fade = parseFloat(view.getComputedStyle(lifted).getPropertyValue("--tc-fade-card")) || 0;
			const grown = title ? wholeWidth({ width: card.width, titleWidth: title.clientWidth, textWidth: range.getBoundingClientRect().width, fade }, { width: view.innerWidth, margin }) : null;
			const width = grown?.width ?? card.width;
			let height = card.height;
			if (grown?.cut) {
				const whole = host.querySelector<HTMLElement>('[data-n-probe="whole"]');
				if (whole) {
					whole.style.width = `${width}px`;
					height = Math.max(card.height, Math.ceil(whole.getBoundingClientRect().height));
				}
			}
			const box = { left: grownStart(card.left, card.width, width, view.innerWidth, margin), top: grownStart(card.top, card.height, height, view.innerHeight, margin), width, height };
			copy = { box, stretched: grown !== null && !grown.cut, whole: grown?.cut === true };
			anchor = { left: box.left, top: box.top, bottom: box.top + box.height };
		} else {
			const named = panel.dataset.nAnchor;
			let rect: DOMRect | null = null;
			for (const el of screen.querySelectorAll<HTMLElement>("[data-n-anchor]")) if (el.dataset.nAnchor === named) rect = el.getBoundingClientRect();
			const beside = copies.size > 0 && named === undefined ? [...copies.values()].find(() => true) : undefined;
			if (rect) anchor = { left: rect.right - panel.offsetWidth, top: rect.top, bottom: rect.bottom };
			else if (beside) {
				const column = panel.dataset.nBeside !== undefined ? anchorOf(panel.dataset.nBeside) : null;
				anchor = { left: (column?.right ?? beside.left + beside.width) + gap, top: beside.top - gap, bottom: beside.top - gap };
			}
		}
		anchor ??= { left: margin, top: room.top, bottom: room.top };
		const long: string[] = [];
		for (const label of host.querySelectorAll<HTMLElement>("[data-n-long]")) if (label.scrollWidth > label.clientWidth) long.push(label.dataset.nLong ?? "");
		const groups = [...panel.children].filter((child): child is HTMLElement => child instanceof HTMLElement);
		const total = panel.offsetHeight;
		const cuts = groups.slice(1).map((group) => group.offsetTop);
		const above = anchor.top - gap - room.top;
		const below = room.bottom - anchor.bottom - gap;
		const keep = panel.dataset.nKeep;
		const split = panel.dataset.nSplit !== undefined && groups.length > 1;
		const count = keep !== undefined ? Math.min(Number(keep), groups.length) : groupsAbove(cuts, total, above, below, split);
		const left = Math.max(0, Math.min(anchor.left, room.right - gap - panel.offsetWidth));
		const overY = room.height - anchor.top + gap;
		const whole = count === groups.length && groups.length > 0;
		const fit = (height: number, space: number) => (height > space ? Math.max(0, space) : null);
		const cut = count > 0 && !whole ? (cuts.slice(count - 1).find(() => true) ?? 0) : 0;
		const upper: PanelPlace | null = count > 0 && !whole ? { left, top: null, bottom: overY, maxHeight: fit(cut, above) } : null;
		const lower: PanelPlace = whole ? { left, top: null, bottom: overY, maxHeight: fit(total, above) } : { left, top: anchor.bottom + gap, bottom: null, maxHeight: fit(total - cut, below) };
		return { seq, copy, copies, above: count, panel: lower, upper, long };
	}

	/**
	 * The parts that stand by the field a task is typed in (`data-n-place="field"`), inside `frame`: on the desktop the bar
	 * right under the field, its right edge on the field's, or over the field where the frame shows no room under it; the
	 * section's capsule on the bar's row by the field's left edge (the old screen's `barBesideField`).
	 */
	besideField(frame: HTMLElement): void {
		const view = frame.ownerDocument.defaultView;
		if (!view) return;
		let field: HTMLElement | null = null;
		for (const el of frame.querySelectorAll<HTMLElement>("[data-n-island]")) field = el;
		const parts = [...frame.querySelectorAll<HTMLElement>("[data-n-place]")].filter((el) => el.dataset.nPlace === "field");
		if (!field || parts.length === 0) return;
		const box = frame.getBoundingClientRect();
		const at = field.getBoundingClientRect();
		const gap = parseFloat(view.getComputedStyle(frame).getPropertyValue("--tc-desk-bar-gap")) || 0;
		const room = { top: box.top, bottom: box.bottom };
		const bar = parts.find((el) => el.dataset.nHow === "beside") ?? null;
		const size = bar?.getBoundingClientRect() ?? at;
		let panel: HTMLElement | null = null;
		for (const el of bar?.querySelectorAll<HTMLElement>("[data-n-panel]") ?? []) panel = el;
		const below = at.bottom + gap;
		const above = at.top - gap - size.height;
		const fitsBelow = (extra: number) => below + size.height + extra <= room.bottom;
		const fitsAbove = (extra: number) => above - extra >= room.top;
		/** An open panel hangs from the bar away from the field: the side is chosen for the two while they fit on one, else for the bar. */
		const extra = panel ? panel.offsetHeight + gap : 0;
		const side = [extra, 0].map((more) => (fitsBelow(more) ? "below" : fitsAbove(more) ? "above" : null)).find((found) => found !== null) ?? "below";
		const top = side === "below" ? below : above;
		if (panel) {
			const panelBelow = top + size.height + gap + panel.offsetHeight <= room.bottom;
			const panelAbove = top - gap - panel.offsetHeight >= room.top;
			const down = side === "below" ? panelBelow || !panelAbove : !(panelAbove || !panelBelow);
			const off = `${size.height + gap}px`;
			Motion.put(panel, "top", down ? off : AUTO);
			Motion.put(panel, "bottom", down ? AUTO : off);
		}
		const barLeft = at.right - size.width;
		for (const part of parts) {
			const width = part.getBoundingClientRect().width;
			const left = part === bar ? barLeft : bar ? Math.min(at.left, barLeft - gap - width) : at.left;
			Motion.put(part, "left", `${left - box.left - frame.clientLeft}px`);
			Motion.put(part, "top", `${top - box.top - frame.clientTop + frame.scrollTop}px`);
		}
	}

	dispose(): void {
		this.cancel();
		this.set.clear();
	}
}

/**
 * How many of a panel's groups stand over the anchor: none (the panel under it), all (over it), or the first few, the
 * rest under it, when the whole fits on neither side. `cuts` are the heights of the panel down to each inner border
 * between groups, `total` its whole height. The first way that fits wins, in that order and with the fewest groups over
 * the anchor; when none fits, the one that leaves the least to scroll. A panel that can't split goes whole to one side.
 */
export function groupsAbove(cuts: readonly number[], total: number, above: number, below: number, canSplit: boolean): number {
	const groups = cuts.length + 1;
	const over = (height: number, space: number) => Math.max(0, height - space);
	const ways = [
		{ count: 0, overflow: over(total, below) },
		{ count: groups, overflow: over(total, above) },
		...(canSplit ? cuts.map((cut, i) => ({ count: i + 1, overflow: over(cut, above) + over(total - cut, below) })) : []),
	];
	return (ways.find((way) => way.overflow === 0) ?? ways.reduce((best, way) => (way.overflow < best.overflow ? way : best))).count;
}
