/** Lines kept around each changed block, to find it again in a file edited since. */
const CONTEXT = 2;

/** One changed block: the lines it had, the lines it has, where it stood on each side, and the lines around it. */
interface Hunk {
	readonly before: number;
	readonly after: number;
	readonly removed: readonly string[];
	readonly added: readonly string[];
	readonly above: readonly string[];
	readonly below: readonly string[];
	/** The block began at the file's first line, or ended at its last: a find has to stand there too. */
	readonly atStart: boolean;
	readonly atEnd: boolean;
}

type Side = "removed" | "added";

/**
 * A change of a text, line by line. It is taken back or done again over the text as it is now: each changed block is
 * found by its lines and the lines around it, so lines edited elsewhere since stay as they are. When a block is no longer
 * there, nothing changes at all.
 */
export class TextPatch {
	private constructor(private readonly hunks: readonly Hunk[]) {}

	static between(before: string, after: string): TextPatch {
		return new TextPatch(hunksOf(before.split("\n"), after.split("\n")));
	}

	get empty(): boolean {
		return this.hunks.length === 0;
	}

	/** `current` with the change taken back, or null when a changed block is no longer to be found. */
	revert(current: string): string | null {
		return this.swap(current, "added", "removed");
	}

	/** `current` with the change made again, or null when a block it changes is no longer to be found. */
	apply(current: string): string | null {
		return this.swap(current, "removed", "added");
	}

	private swap(current: string, from: Side, to: Side): string | null {
		const lines = current.split("\n");
		const shift = (hunk: Hunk) => (from === "added" ? hunk.after : hunk.before);
		const places = this.hunks.map((hunk) => find(lines, hunk, hunk[from], shift(hunk)));
		if (places.some((place, i) => place === null || (i > 0 && place <= places[i - 1]! + this.hunks[i - 1][from].length - 1))) return null;
		for (let i = this.hunks.length - 1; i >= 0; i--) {
			const hunk = this.hunks[i];
			lines.splice(places[i]!, hunk[from].length, ...hunk[to]);
		}
		return lines.join("\n");
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

/** Up to this many cells the table of common runs is kept: about 8 MB, and the blocks found are the ones it always found. */
const TABLE_CELLS = 4_000_000;

/** The pairs of lines `b` and `a` share, as [index in b, index in a] in order. */
function sharedLines(b: readonly string[], a: readonly string[]): (readonly [number, number])[] {
	return (b.length + 1) * (a.length + 1) <= TABLE_CELLS ? tableLines(b, a) : myersLines(b, a);
}

/** The longest run of shared lines by a table, taking a line added before a line removed where both keep it as long. */
function tableLines(b: readonly string[], a: readonly string[]): (readonly [number, number])[] {
	const width = a.length + 1;
	const common = new Uint16Array((b.length + 1) * width);
	for (let i = b.length - 1; i >= 0; i--) {
		for (let j = a.length - 1; j >= 0; j--) {
			common[i * width + j] = b[i] === a[j] ? common[(i + 1) * width + j + 1] + 1 : Math.max(common[(i + 1) * width + j], common[i * width + j + 1]);
		}
	}
	const pairs: (readonly [number, number])[] = [];
	let i = 0;
	let j = 0;
	while (i < b.length || j < a.length) {
		if (i < b.length && j < a.length && b[i] === a[j]) pairs.push([i++, j++]);
		else if (j < a.length && (i === b.length || common[i * width + j + 1] >= common[(i + 1) * width + j])) j++;
		else i++;
	}
	return pairs;
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
