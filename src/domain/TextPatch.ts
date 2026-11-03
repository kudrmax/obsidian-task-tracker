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
	const common: number[][] = Array.from({ length: b.length + 1 }, () => new Array<number>(a.length + 1).fill(0));
	for (let i = b.length - 1; i >= 0; i--) {
		for (let j = a.length - 1; j >= 0; j--) common[i][j] = b[i] === a[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
	}
	const blocks: [number, number, number, number][] = [];
	let i = 0;
	let j = 0;
	let open: [number, number] | null = null;
	const close = () => {
		if (open) blocks.push([head + open[0], head + i, head + open[1], head + j]);
		open = null;
	};
	while (i < b.length || j < a.length) {
		if (i < b.length && j < a.length && b[i] === a[j]) {
			close();
			i++;
			j++;
			continue;
		}
		open ??= [i, j];
		if (j < a.length && (i === b.length || common[i][j + 1] >= common[i + 1][j])) j++;
		else i++;
	}
	close();
	return blocks;
}
