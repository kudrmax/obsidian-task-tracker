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
		root.addEventListener("click", click);
		root.addEventListener("pointerdown", press);
		this.stops.push(
			() => root.removeEventListener("click", click),
			() => root.removeEventListener("pointerdown", press),
		);
	}

	/** Escape pressed in `doc` while `wanted()`: taken (Obsidian would take it as a step back) and told. */
	escape(doc: Document, wanted: () => boolean, told: () => void): () => void {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== "Escape" || !wanted()) return;
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
