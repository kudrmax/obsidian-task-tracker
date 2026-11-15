/** Lines kept around each changed block, to find it again in a file edited since. */
const CONTEXT = 2;

/** One changed block: the lines it had, the lines it has, where it stood on each side, and the lines around it. */
export interface Hunk {
	readonly before: number;
	readonly after: number;
	readonly removed: readonly string[];
	readonly added: readonly string[];
	readonly above: readonly string[];
	readonly below: readonly string[];
	/** The block began at the file's first line, or ended at its last: a find has to stand there too. */
	readonly atStart: boolean;
	readonly atEnd: boolean;
	/** Who the task on each removed line was (null: no task), as the change was made: taking it back gives each its own again. */
	readonly removedIds?: readonly (string | null)[];
	/** Who the task on each added line was: doing it again gives each its own again. */
	readonly addedIds?: readonly (string | null)[];
}

/** The tasks' ids by line, from 0, on each side of a change. */
export interface PatchIds {
	readonly before: ReadonlyMap<number, string>;
	readonly after: ReadonlyMap<number, string>;
}

/** A change taken back or made again: the text, each line's line in the text it was made over (null: put in), and the ids the change gave back by line. */
export interface Swapped {
	readonly text: string;
	readonly origins: readonly (number | null)[];
	readonly ids: ReadonlyMap<number, string>;
}

type Side = "removed" | "added";

/**
 * A change of a text, line by line. It is taken back or done again over the text as it is now: each changed block is
 * found by its lines and the lines around it, so lines edited elsewhere since stay as they are. When a block is no longer
 * there, nothing changes at all.
 */
export class TextPatch {
	private constructor(private readonly changes: readonly Hunk[]) {}

	/** `ids`, who the tasks are on each side: each changed block keeps its lines' (`Hunk.removedIds`, `addedIds`). */
	static between(before: string, after: string, ids?: PatchIds): TextPatch {
		const hunks = hunksOf(before.split("\n"), after.split("\n"));
		if (!ids) return new TextPatch(hunks);
		const of = (map: ReadonlyMap<number, string>, from: number, count: number) => Array.from({ length: count }, (_, k) => map.get(from + k) ?? null);
		return new TextPatch(hunks.map((h) => ({ ...h, removedIds: of(ids.before, h.before, h.removed.length), addedIds: of(ids.after, h.after, h.added.length) })));
	}

	/** The patch as plain data, for a host that keeps the steps itself; `TextPatch.of` reads it back. */
	get hunks(): readonly Hunk[] {
		return this.changes;
	}

	static of(hunks: readonly Hunk[]): TextPatch {
		return new TextPatch(hunks);
	}

	get empty(): boolean {
		return this.changes.length === 0;
	}

	/** `current` with the change taken back, or null when a changed block is no longer to be found. */
	revert(current: string): string | null {
		return this.reverted(current)?.text ?? null;
	}

	/** `current` with the change made again, or null when a block it changes is no longer to be found. */
	apply(current: string): string | null {
		return this.applied(current)?.text ?? null;
	}

	/** `revert`, with where each line came from and who the lines it gave back were. */
	reverted(current: string): Swapped | null {
		return this.swap(current, "added", "removed");
	}

	/** `apply`, with where each line came from and who the lines it made again were. */
	applied(current: string): Swapped | null {
		return this.swap(current, "removed", "added");
	}

	private swap(current: string, from: Side, to: Side): Swapped | null {
		const lines = current.split("\n");
		const shift = (hunk: Hunk) => (from === "added" ? hunk.after : hunk.before);
		const places = this.changes.map((hunk) => find(lines, hunk, hunk[from], shift(hunk)));
		if (places.some((place, i) => place === null || (i > 0 && place <= places[i - 1]! + this.changes[i - 1][from].length - 1))) return null;
		const rows: { line: string; origin: number | null; id: string | null }[] = lines.map((line, origin) => ({ line, origin, id: null }));
		for (let i = this.changes.length - 1; i >= 0; i--) {
			const hunk = this.changes[i];
			const ids = to === "removed" ? hunk.removedIds : hunk.addedIds;
			rows.splice(places[i]!, hunk[from].length, ...hunk[to].map((line, k) => ({ line, origin: null, id: ids?.[k] ?? null })));
		}
		const ids = new Map<number, string>();
		rows.forEach((row, i) => row.id !== null && ids.set(i, row.id));
		return { text: rows.map((row) => row.line).join("\n"), origins: rows.map((row) => row.origin), ids };
	}
}

/** Where `hunk`'s `lines` stand in `text` with its lines around them, the nearest to `near`; null when nowhere. */
function find(text: readonly string[], hunk: Hunk, lines: readonly string[], near: number): number | null {
	const block = [...hunk.above, ...lines, ...hunk.below];
	let best: number | null = null;
	for (let start = 0; start + block.length <= text.length; start++) {
		if (hunk.atStart && start !== 0) break;
		if (hunk.atEnd && start + block.length !== text.length) continue;
		if (!block.every((line, i) => text[start + i] === line)) continue;
		const at = start + hunk.above.length;
		if (best === null || Math.abs(at - near) < Math.abs(best - near)) best = at;
	}
	return best;
}

function hunksOf(before: readonly string[], after: readonly string[]): Hunk[] {
	const hunks: Hunk[] = [];
	for (const [b0, b1, a0, a1] of mergedBlocks(changedBlocks(before, after))) {
		const above = Math.max(0, b0 - CONTEXT);
		const below = Math.min(before.length, b1 + CONTEXT);
		hunks.push({
			before: b0,
			after: a0,
			removed: before.slice(b0, b1),
			added: after.slice(a0, a1),
			above: before.slice(above, b0),
			below: before.slice(b1, below),
			atStart: b0 < CONTEXT,
			atEnd: before.length - b1 < CONTEXT,
		});
	}
	return hunks;
}

/** Blocks close enough for their lines around to overlap become one, so taking back one never moves another's. */
function mergedBlocks(blocks: readonly (readonly [number, number, number, number])[]): (readonly [number, number, number, number])[] {
	const merged: [number, number, number, number][] = [];
	for (const block of blocks) {
		const last = merged[merged.length - 1];
		if (last && block[0] - last[1] <= 2 * CONTEXT) {
			last[1] = block[1];
			last[3] = block[3];
		} else merged.push([...block]);
	}
	return merged;
}

/** The changed blocks as [start, end) in `before` and in `after`, by the longest run of lines they share. */
function changedBlocks(before: readonly string[], after: readonly string[]): (readonly [number, number, number, number])[] {
	let head = 0;
	while (head < before.length && head < after.length && before[head] === after[head]) head++;
	let tail = 0;
	while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
	const b = before.slice(head, before.length - tail);
	const a = after.slice(head, after.length - tail);
	const same = sharedLines(b, a);
	const blocks: [number, number, number, number][] = [];
	let i = 0;
	let j = 0;
	let open: [number, number] | null = null;
	const close = () => {
		if (open) blocks.push([head + open[0], head + i, head + open[1], head + j]);
		open = null;
	};
	for (const [x, y] of [...same, [b.length, a.length] as const]) {
		if (i < x || j < y) {
			open ??= [i, j];
			i = x;
			j = y;
		}
		if (x === b.length && y === a.length) break;
		close();
		i++;
		j++;
	}
	close();
	return blocks;
}

/** Up to this many cells (about 2 MB) the table of common runs is kept: the blocks found are the ones it always found. */
const TABLE_CELLS = 1_000_000;

/** The pairs of lines `b` and `a` share, as [index in b, index in a] in order. */
export function sharedLines(b: readonly string[], a: readonly string[]): (readonly [number, number])[] {
	return (b.length + 1) * (a.length + 1) <= TABLE_CELLS ? tableLines(b, a) : myersLines(b, a);
}

/**
 * The longest run of shared lines by a table, taking a line added before a line removed where both keep it as long. The
 * table's cell for `b[i:]` and `a[j:]` is how many lines they share at most; its rows are kept a bit per line of `a`
 * (Hyyrö's bit-parallel count), so a row costs a word per 32 lines.
 */
function tableLines(b: readonly string[], a: readonly string[]): (readonly [number, number])[] {
	const common = new CommonRuns(b, a);
	const pairs: (readonly [number, number])[] = [];
	let i = 0;
	let j = 0;
	while (i < b.length || j < a.length) {
		if (i < b.length && j < a.length && b[i] === a[j]) pairs.push([i++, j++]);
		else if (j < a.length && (i === b.length || common.at(i, j + 1) >= common.at(i + 1, j))) j++;
		else i++;
	}
	return pairs;
}

const WORD = 32;

/** How many lines `b[i:]` and `a[j:]` share at most, for every `i` and `j`. */
class CommonRuns {
	private readonly words: number;
	private readonly width: number;
	/** Row `i`: bit `p` clear where the count grows past line `a.length - 1 - p` of `a`, reading `b[i:]`. */
	private readonly rows: Uint32Array;
	/** Row `i`: the clear bits below each word. */
	private readonly below: Uint32Array;

	constructor(b: readonly string[], a: readonly string[]) {
		const m = a.length;
		const words = Math.max(1, Math.ceil(m / WORD));
		this.words = words;
		this.width = m;
		const numbers = new Map<string, number>();
		const masks: Uint32Array[] = [];
		for (let p = 0; p < m; p++) {
			const line = a[m - 1 - p];
			let n = numbers.get(line);
			if (n === undefined) {
				n = numbers.size;
				numbers.set(line, n);
				masks.push(new Uint32Array(words));
			}
			masks[n][p >>> 5] |= 1 << (p & 31);
		}
		const rows = new Uint32Array((b.length + 1) * words);
		rows.fill(0xffffffff, b.length * words);
		for (let i = b.length - 1; i >= 0; i--) {
			const row = i * words;
			const next = row + words;
			const n = numbers.get(b[i]);
			if (n === undefined) {
				rows.copyWithin(row, next, next + words);
				continue;
			}
			const mask = masks[n];
			let carry = 0;
			for (let w = 0; w < words; w++) {
				const v = rows[next + w];
				const u = (v & mask[w]) >>> 0;
				const sum = v + u + carry;
				carry = sum > 0xffffffff ? 1 : 0;
				rows[row + w] = ((sum >>> 0) | (v & ~mask[w])) >>> 0;
			}
		}
		this.rows = rows;
		const below = new Uint32Array((b.length + 1) * (words + 1));
		for (let i = 0; i <= b.length; i++) {
			for (let w = 0; w < words; w++) below[i * (words + 1) + w + 1] = below[i * (words + 1) + w] + WORD - bitCount(rows[i * words + w]);
		}
		this.below = below;
	}

	at(i: number, j: number): number {
		const k = this.width - j;
		const word = k >>> 5;
		const bits = k & 31;
		const before = this.below[i * (this.words + 1) + word];
		if (bits === 0) return before;
		const low = this.rows[i * this.words + word] & ((1 << bits) - 1);
		return before + bits - bitCount(low >>> 0);
	}
}

function bitCount(x: number): number {
	x = x - ((x >>> 1) & 0x55555555);
	x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
	return Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24;
}

/** Myers' shortest edit script, for a change too wide for the table: time and memory by the lines changed, not the file. */
function myersLines(b: readonly string[], a: readonly string[]): (readonly [number, number])[] {
	const n = b.length;
	const m = a.length;
	const offset = n + m + 1;
	const v = new Int32Array(2 * offset + 1);
	const trace: Int32Array[] = [];
	const down = (k: number, d: number, at: (k: number) => number) => k === -d || (k !== d && at(k - 1) < at(k + 1));
	let found = n === 0 && m === 0 ? 0 : -1;
	for (let d = 0; found < 0; d++) {
		trace.push(v.slice(offset - d, offset + d + 1));
		for (let k = -d; k <= d; k += 2) {
			let x = down(k, d, (i) => v[offset + i]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
			let y = x - k;
			while (x < n && y < m && b[x] === a[y]) {
				x++;
				y++;
			}
			v[offset + k] = x;
			if (x >= n && y >= m) {
				found = d;
				break;
			}
		}
	}
	const pairs: (readonly [number, number])[] = [];
	let x = n;
	let y = m;
	for (let d = found; d > 0; d--) {
		const before = trace[d];
		const at = (k: number) => before[k + d];
		const k = x - y;
		const prevK = down(k, d, at) ? k + 1 : k - 1;
		const prevX = at(prevK);
		const prevY = prevX - prevK;
		const startX = prevK === k + 1 ? prevX : prevX + 1;
		while (x > startX) pairs.push([--x, --y]);
		x = prevX;
		y = prevY;
	}
	while (x > 0) pairs.push([--x, --y]);
	return pairs.reverse();
}
