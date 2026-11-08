import { Motion } from "./Motion";

/** A row as a drawing takes it: its node, kept from the last drawing when its key was there, and the signal its listeners hang on until the next drawing. */
export interface TakenRow {
	readonly node: HTMLElement;
	/** Made for this drawing: no row of this key stood on the screen. */
	readonly fresh: boolean;
	/** Aborted when the row is drawn again or leaves: listeners given it are taken off then. */
	readonly signal: AbortSignal;
}

interface Row {
	readonly node: HTMLElement;
	listening: AbortController;
}

interface Leaving {
	readonly node: HTMLElement;
	readonly animation: Animation | null;
}

/**
 * The rows of a column drawn by key: a row lives as long as its key is drawn (a task by its id, a section by its id), is
 * filled anew in place, slides from where it stood to where it stands now, grows in when it is new and fades and folds
 * away when it is gone. Lists, the timeline's cards, the sections' headers, select mode and folding all draw through it.
 * A row holding the focus never moves in the page: the others are put around it, so a field keeps its caret and keyboard.
 * Anything else in the column (a drop line, a section's landing mark) stays where it stands.
 */
export class KeyedRows {
	private rows = new Map<string, Row>();
	private readonly leaving = new Map<string, Leaving>();
	/** Keys of rows that only mark a place (where a lifted section lands): they fold away without fading first. */
	readonly marks = new Set<string>();

	constructor(readonly host: HTMLElement) {}

	/** A new drawing; `moving` false draws it at once, as for another day or the first drawing. */
	begin(moving: boolean): RowsDrawing {
		return new RowsDrawing(this, moving);
	}

	/** The row of `key` goes from the page at once, not folding away: another row takes its place in the same frame. */
	forget(key: string): void {
		const row = this.rows.get(key);
		if (!row) return;
		row.listening.abort();
		row.node.remove();
		this.rows.delete(key);
	}

	/** The row of `key` as drawn now, if any. */
	nodeOf(key: string): HTMLElement | null {
		return this.rows.get(key)?.node ?? null;
	}

	/** @internal: `taken` says whether a row is already drawn in this drawing; `heir` names a row this key takes over when it has none of its own. */
	take(key: string, make: () => HTMLElement, moving: boolean, taken: (row: Row) => boolean, heir?: string): TakenRow & { readonly row: Row } {
		const own = this.rows.get(key);
		const inherited = heir === undefined ? undefined : this.rows.get(heir);
		const kept = own && !taken(own) ? own : inherited && !taken(inherited) && !(own && !taken(own)) ? inherited : undefined;
		if (kept) {
			kept.listening.abort();
			kept.listening = new AbortController();
			return { node: kept.node, fresh: false, signal: kept.listening.signal, row: kept };
		}
		const back = this.leaving.get(key);
		if (back) {
			this.leaving.delete(key);
			Motion.stay(back.node, back.animation);
			const row: Row = { node: back.node, listening: new AbortController() };
			return { node: row.node, fresh: !moving, signal: row.listening.signal, row };
		}
		const row: Row = { node: make(), listening: new AbortController() };
		return { node: row.node, fresh: true, signal: row.listening.signal, row };
	}

	/** @internal: the rows of this drawing, in order; those not drawn leave. */
	settle(drawn: Map<string, Row>, moving: boolean): HTMLElement[] {
		const gone: HTMLElement[] = [];
		const kept = new Set(drawn.values());
		for (const [key, row] of this.rows) {
			if (kept.has(row)) continue;
			row.listening.abort();
			if (!moving) {
				row.node.remove();
				continue;
			}
			gone.push(row.node);
			const animation = Motion.leave(
				row.node,
				() => {
					if (this.leaving.get(key)?.node === row.node) this.leaving.delete(key);
				},
				!this.marks.has(key),
			);
			if (row.node.isConnected) this.leaving.set(key, { node: row.node, animation });
		}
		if (!moving)
			for (const [key, leaving] of this.leaving) {
				leaving.animation?.cancel();
				leaving.node.remove();
				this.leaving.delete(key);
			}
		this.rows = drawn;
		return gone;
	}
}

export class RowsDrawing {
	private readonly before = new Map<Element, DOMRect>();
	private readonly drawn = new Map<string, Row>();
	private readonly order: HTMLElement[] = [];
	private readonly fresh = new Set<HTMLElement>();

	constructor(
		private readonly rows: KeyedRows,
		private readonly moving: boolean,
	) {
		if (moving) for (const child of rows.host.children) this.before.set(child, child.getBoundingClientRect());
	}

	/**
	 * The row of `key`, next in order: the one drawn for it last time, or `make`'s. A key with no row yet may take over
	 * the row of `heir` (a text typed that the file now has as a task), which then stays the same row on the screen.
	 */
	take(key: string, make: () => HTMLElement, heir?: string): TakenRow {
		const drawnRows = new Set(this.drawn.values());
		const taken = this.rows.take(key, make, this.moving, (row) => drawnRows.has(row), heir);
		this.drawn.set(key, taken.row);
		this.order.push(taken.node);
		if (taken.fresh) this.fresh.add(taken.node);
		return taken;
	}

	/** The row of `key` goes at once, measured where it stood: the row it stood in for takes its place in this frame. */
	forget(key: string): void {
		this.rows.forget(key);
	}

	/** A row that only marks a place: it grows in, slides between places, and folds away without fading first. */
	takeMark(key: string, make: () => HTMLElement): TakenRow {
		this.rows.marks.add(key);
		return this.take(key, make);
	}

	/** A new row that stands in for one of the same height in the same frame (a renamed card's field): it does not grow in. */
	standIn(node: HTMLElement): void {
		this.fresh.delete(node);
	}

	/**
	 * The rows stand in the page in the order taken; the new ones grow in, the moved ones slide, the rest leave. The new
	 * ones start growing first, from nothing: a moved row slides to where it stands with them at that height, and their
	 * growth carries it on.
	 */
	finish(): void {
		const host = this.rows.host;
		const old = [...host.children] as HTMLElement[];
		this.rows.settle(this.drawn, this.moving);
		const wanted = new Set(this.order);
		const stays = old.filter((node) => node.isConnected && node.parentElement === host && !wanted.has(node));
		arrange(host, withStays(this.order, old, stays));
		if (!this.moving) return;
		for (const node of this.fresh) Motion.enter(node);
		for (const node of this.order) {
			if (this.fresh.has(node)) continue;
			const from = this.before.get(node);
			/** A row that was not laid out (a renamed card, its field in its place) stands where it is at once. */
			if (from && (from.width > 0 || from.height > 0)) Motion.slide(node, from);
		}
	}
}

/** The rows in order, with what else stood in the column (rows leaving, a drop line) each after the row it stood after. */
function withStays(order: readonly HTMLElement[], old: readonly HTMLElement[], stays: readonly HTMLElement[]): HTMLElement[] {
	const wanted = new Set(order);
	const after = new Map<HTMLElement | null, HTMLElement[]>();
	let anchor: HTMLElement | null = null;
	const staying = new Set(stays);
	for (const node of old) {
		if (wanted.has(node)) anchor = node;
		else if (staying.has(node)) after.set(anchor, [...(after.get(anchor) ?? []), node]);
	}
	return [...(after.get(null) ?? []), ...order.flatMap((node) => [node, ...(after.get(node) ?? [])])];
}

/**
 * Puts the host's children in `final`'s order moving as few as it can: the longest run already in order stays, and a
 * child holding the focus is always among those that stay, so its field keeps the caret. `final` holds every child.
 */
function arrange(host: HTMLElement, final: readonly HTMLElement[]): void {
	const current = new Map([...host.children].map((node, i) => [node, i]));
	const focus = host.ownerDocument.activeElement;
	const pinned = final.findIndex((node) => current.has(node) && focus !== null && node.contains(focus));
	const stable = new Set<HTMLElement>();
	const keep = (part: readonly HTMLElement[], above: number, below: number) => {
		for (const node of longestRun(part.filter((n) => current.has(n) && current.get(n)! > above && current.get(n)! < below), current)) stable.add(node);
	};
	if (pinned < 0) keep(final, -1, Infinity);
	else {
		const at = current.get(final[pinned])!;
		stable.add(final[pinned]);
		keep(final.slice(0, pinned), -1, at);
		keep(final.slice(pinned + 1), at, Infinity);
	}
	let next: HTMLElement | null = null;
	for (let i = final.length - 1; i >= 0; i--) {
		const node = final[i];
		if (!stable.has(node) || node.parentElement !== host) host.insertBefore(node, next);
		next = node;
	}
}

/** The longest run of `nodes` whose places in the page already rise. */
function longestRun(nodes: readonly HTMLElement[], at: ReadonlyMap<Element, number>): HTMLElement[] {
	const tails: number[] = [];
	const previous: number[] = [];
	nodes.forEach((node, i) => {
		const value = at.get(node)!;
		let lo = 0;
		let hi = tails.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (at.get(nodes[tails[mid]])! < value) lo = mid + 1;
			else hi = mid;
		}
		previous[i] = lo > 0 ? tails[lo - 1] : -1;
		tails[lo] = i;
	});
	const run: HTMLElement[] = [];
	for (let i = tails.length > 0 ? tails[tails.length - 1] : -1; i >= 0; i = previous[i]) run.unshift(nodes[i]);
	return run;
}
