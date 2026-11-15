/**
 * The input driver (§Architecture): the raw presses a host listens to outside the view's own JSX handlers. A note's
 * block stops its presses at itself (the note's editor would put the cursor at its end), and a press anywhere in it
 * gives it the focus first.
 */
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
	acts(root: HTMLElement, told: (act: { readonly act: string; readonly key: string | null; readonly value: string | null }) => void): void {
		const read = (e: Event, press: boolean) => {
			const target = e.target instanceof Element ? e.target : null;
			const marked = target?.closest("[data-n-act]");
			if (!(marked instanceof HTMLElement) || !root.contains(marked)) return;
			const act = marked.dataset.nAct ?? "";
			if ((act === "dismiss") !== press) return;
			if (press && marked !== target) return;
			const row = marked.closest("[data-n-key]");
			told({ act, key: row instanceof HTMLElement ? (row.dataset.nKey ?? null) : null, value: marked.dataset.nValue ?? null });
		};
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
