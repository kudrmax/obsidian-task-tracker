/**
 * The input driver (§Architecture): the raw presses a host listens to outside the view's own JSX handlers. A note's
 * block stops its presses at itself (the note's editor would put the cursor at its end), and a press anywhere in it
 * gives it the focus first.
 */
/** The parts of a card a press may lift it by: their taps come from the press recognizer, never as a click. */
export const PRESSED: ReadonlySet<string> = new Set(["card", "counter", "mark"]);

/** A raw event of the pointer's stream, as the press recognizer reads it (`recognizers/press.ts`'s `PressInput`). */
export type RawPress =
	| { readonly kind: "down"; readonly id: number; readonly at: { readonly x: number; readonly y: number }; readonly mouse: boolean; readonly primary: boolean; readonly button: number; readonly target: { readonly act: string; readonly key: string | null }; readonly mod: boolean; readonly shift: boolean }
	| { readonly kind: "move" | "up"; readonly id: number; readonly at: { readonly x: number; readonly y: number } }
	| { readonly kind: "cancel"; readonly id: number; readonly at: { readonly x: number; readonly y: number } }
	| { readonly kind: "context"; readonly target: { readonly act: string; readonly key: string | null } };

/** The pointer kept by `el` (its moves and release heard there wherever it goes), or let go; a pointer the page no longer knows is no failure. */
function capture(el: HTMLElement, id: number, on: boolean): void {
	try {
		if (on && el.isConnected) el.setPointerCapture(id);
		else if (!on && el.hasPointerCapture(id)) el.releasePointerCapture(id);
	} catch {
		/* a pointer already gone (a finger lifted as the press began): nothing to keep */
	}
}

export class Input {
	private readonly stops: (() => void)[] = [];

	/** Presses stop at `el`; `pressed` hears each pointerdown in it. */
	shield(el: HTMLElement, pressed: () => void): void {
		const stop = (e: Event) => e.stopPropagation();
		for (const type of ["mousedown", "click", "dblclick"] as const) {
			el.addEventListener(type, stop);
			this.stops.push(() => el.removeEventListener(type, stop));
		}
		el.addEventListener("pointerdown", pressed);
		this.stops.push(() => el.removeEventListener("pointerdown", pressed));
	}

	/**
	 * Taps on what the view marked (`data-n-act`) inside `root`, told with the row they are in and the value they carry;
	 * the sheet (`dismiss`) is told on its press, so what stands under it is never pressed through it.
	 */
	acts(root: HTMLElement, told: (act: { readonly act: string; readonly key: string | null; readonly value: string | null }) => void, pressed: ReadonlySet<string> = new Set()): void {
		const read = (e: Event, press: boolean) => {
			const target = e.target instanceof Element ? e.target : null;
			const marked = target?.closest("[data-n-act]");
			if (!(marked instanceof HTMLElement) || !root.contains(marked)) return;
			const act = marked.dataset.nAct ?? "";
			if (press && marked.closest("[data-n-keep-focus]")) e.preventDefault();
			if (pressed.has(act)) return;
			if (act.endsWith("dismiss") !== press) return;
			if (press && marked !== target) return;
			const row = marked.closest("[data-n-key]");
			told({ act, key: row instanceof HTMLElement ? (row.dataset.nKey ?? null) : null, value: marked.dataset.nValue ?? null });
		};
		/** A double click on a list's own room (not on a row in it): the act it is marked with (`data-n-dblact`). */
		const twice = (e: Event) => {
			const target = e.target instanceof HTMLElement ? e.target : null;
			if (!target || !root.contains(target) || target.dataset.nDblact === undefined) return;
			told({ act: target.dataset.nDblact, key: null, value: target.dataset.nValue ?? null });
		};
		/** A press on what keeps the focus where it is (the bar of a field being typed): the field keeps typing. */
		const keep = (e: Event) => {
			const target = e.target instanceof Element ? e.target : null;
			if (target?.closest("[data-n-keep-focus]")) e.preventDefault();
		};
		root.addEventListener("dblclick", twice, true);
		root.addEventListener("mousedown", keep, true);
		this.stops.push(
			() => root.removeEventListener("dblclick", twice, true),
			() => root.removeEventListener("mousedown", keep, true),
		);
		const click = (e: Event) => read(e, false);
		const press = (e: Event) => read(e, true);
		/** Heard on the way down: the block stops its presses at its frame, inside `root`. */
		root.addEventListener("click", click, true);
		root.addEventListener("pointerdown", press, true);
		this.stops.push(
			() => root.removeEventListener("click", click, true),
			() => root.removeEventListener("pointerdown", press, true),
		);
	}

	/**
	 * The pointer's stream over what the view marked (`data-n-act`) in `root`, for the press recognizer: each press, move
	 * and release of the pointer that pressed (captured by `root`, so it is heard wherever it goes), a second pointer's
	 * press, a right click. While `carrying()`, a finger's move scrolls nothing: `preventDefault` decided in the event
	 * from the gesture's state.
	 */
	presses(root: HTMLElement, feed: (input: RawPress) => void, carrying: () => boolean): void {
		const mark = (target: EventTarget | null) => {
			const marked = target instanceof Element ? target.closest("[data-n-act]") : null;
			if (!(marked instanceof HTMLElement) || !root.contains(marked)) return null;
			const row = marked.closest("[data-n-key]");
			return { act: marked.dataset.nAct ?? "", key: row instanceof HTMLElement ? (row.dataset.nKey ?? null) : null };
		};
		const at = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY });
		let held: number | null = null;
		const down = (e: PointerEvent) => {
			const target = mark(e.target) ?? { act: "", key: null };
			const mouse = e.pointerType === "mouse";
			feed({ kind: "down", id: e.pointerId, at: at(e), mouse, primary: e.isPrimary, button: e.button, target, mod: e.metaKey || e.ctrlKey, shift: e.shiftKey });
			if (held === null && e.isPrimary && e.button === 0 && PRESSED.has(target.act)) {
				held = e.pointerId;
				capture(root, e.pointerId, true);
				if (mouse) e.preventDefault();
			}
		};
		const move = (e: PointerEvent) => {
			if (e.pointerId === held) feed({ kind: "move", id: e.pointerId, at: at(e) });
		};
		const up = (e: PointerEvent) => {
			if (e.pointerId !== held) return;
			held = null;
			capture(root, e.pointerId, false);
			feed({ kind: e.type === "pointercancel" ? "cancel" : "up", id: e.pointerId, at: at(e) });
		};
		const context = (e: MouseEvent) => {
			const target = mark(e.target);
			if (!target || !PRESSED.has(target.act)) return;
			e.preventDefault();
			feed({ kind: "context", target });
		};
		const touch = (e: TouchEvent) => {
			if (carrying()) e.preventDefault();
		};
		root.addEventListener("pointerdown", down);
		root.addEventListener("pointermove", move);
		root.addEventListener("pointerup", up);
		root.addEventListener("pointercancel", up);
		root.addEventListener("contextmenu", context);
		root.addEventListener("touchmove", touch, { passive: false });
		this.stops.push(() => {
			root.removeEventListener("pointerdown", down);
			root.removeEventListener("pointermove", move);
			root.removeEventListener("pointerup", up);
			root.removeEventListener("pointercancel", up);
			root.removeEventListener("contextmenu", context);
			root.removeEventListener("touchmove", touch);
		});
	}

	/**
	 * The keys of a field the view marked (`data-n-field`): Enter is told as its `data-n-enter` act with the text typed,
	 * Escape and the focus leaving as its `data-n-escape` act (with `data-n-escape-value`). The text stays the field's
	 * (P1) until then.
	 */
	fields(root: HTMLElement, told: (act: { readonly act: string; readonly key: string | null; readonly value: string | null }) => void): void {
		const fieldOf = (e: Event): HTMLInputElement | null => (e.target instanceof HTMLInputElement && e.target.dataset.nField !== undefined && root.contains(e.target) ? e.target : null);
		/** Fields whose Enter or Escape was told: the focus leaving them after is no second answer. */
		const done = new WeakSet<HTMLInputElement>();
		const leave = (field: HTMLInputElement) => {
			const act = field.dataset.nEscape;
			if (act !== undefined) told({ act, key: null, value: field.dataset.nEscapeValue ?? null });
		};
		const key = (e: KeyboardEvent) => {
			const field = fieldOf(e);
			if (!field || (e.key !== "Enter" && e.key !== "Escape") || e.isComposing) return;
			e.preventDefault();
			e.stopPropagation();
			done.add(field);
			if (e.key === "Escape") return leave(field);
			const act = field.dataset.nEnter;
			if (act !== undefined) told({ act, key: null, value: field.value });
		};
		const blur = (e: FocusEvent) => {
			const field = fieldOf(e);
			if (field && !done.has(field) && field.isConnected) leave(field);
		};
		root.addEventListener("keydown", key);
		root.addEventListener("focusout", blur);
		this.stops.push(
			() => root.removeEventListener("keydown", key),
			() => root.removeEventListener("focusout", blur),
		);
	}

	/** Enter pressed in `doc` while `wanted()`, outside a field: taken and told (a question's confirm). */
	enter(doc: Document, wanted: () => boolean, told: () => void): void {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Enter" || !wanted() || (e.target instanceof HTMLInputElement && e.target.dataset.nField !== undefined)) return;
			e.preventDefault();
			e.stopPropagation();
			told();
		};
		doc.addEventListener("keydown", onKey, true);
		this.stops.push(() => doc.removeEventListener("keydown", onKey, true));
	}

	/**
	 * The view's fields (`data-n-field`) inside `root`: each input told with the field's text; each key offered first to
	 * `key`, which answers whether the block takes it (then the field and Obsidian never see it).
	 */
	typing(root: HTMLElement, typed: (field: string, value: string) => void, key: (field: string, key: string) => boolean): void {
		const fieldOf = (e: Event): HTMLInputElement | null => {
			const target = e.target;
			return target instanceof HTMLInputElement && target.dataset.nField !== undefined && root.contains(target) ? target : null;
		};
		const input = (e: Event) => {
			const field = fieldOf(e);
			if (field) typed(field.dataset.nField ?? "", field.value);
		};
		const down = (e: KeyboardEvent) => {
			const field = fieldOf(e);
			if (!field || e.isComposing || !key(field.dataset.nField ?? "", e.key)) return;
			e.preventDefault();
			e.stopPropagation();
		};
		root.addEventListener("input", input);
		root.addEventListener("keydown", down);
		this.stops.push(
			() => root.removeEventListener("input", input),
			() => root.removeEventListener("keydown", down),
		);
	}

	/** Escape pressed in `doc` while `wanted()`: taken (Obsidian would take it as a step back) and told. */
	escape(doc: Document, wanted: () => boolean, told: () => void): () => void {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape" || !wanted()) return;
			/** A field that takes Escape itself (a name typed on a menu's page goes back a page). */
			if (e.target instanceof HTMLInputElement && e.target.dataset.nField !== undefined) return;
			e.preventDefault();
			e.stopPropagation();
			told();
		};
		doc.addEventListener("keydown", onKey, true);
		const stop = () => doc.removeEventListener("keydown", onKey, true);
		this.stops.push(stop);
		return stop;
	}

	private readonly timers = new Map<string, { readonly view: Window; readonly id: number }>();

	/** A wait with a bound (a long press, a pick's close), by name: `fire` after `ms`, unless cancelled or set again first. */
	timer(near: Node, name: string, ms: number, fire: () => void): void {
		this.cancelTimer(name);
		const view = (near.ownerDocument ?? (near as Document)).defaultView;
		if (!view) return;
		const id = view.setTimeout(() => {
			this.timers.delete(name);
			fire();
		}, ms);
		this.timers.set(name, { view, id });
	}

	cancelTimer(name: string): void {
		const timer = this.timers.get(name);
		if (!timer) return;
		timer.view.clearTimeout(timer.id);
		this.timers.delete(name);
	}

	dispose(): void {
		this.stops.splice(0).forEach((stop) => stop());
		for (const name of [...this.timers.keys()]) this.cancelTimer(name);
	}
}
