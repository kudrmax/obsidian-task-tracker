import { sharedLines } from "./TextPatch";

/**
 * Which line of `after` each line of `before` is, as [index in before, index in after] in order: the longest run of lines
 * the two share, then, in a changed block between two shared lines, lines edited in place: a block with as many lines on
 * each side, every pair of them `alike`, pairs them one for one. Any other changed block pairs nothing.
 */
export function matchLines(before: readonly string[], after: readonly string[], alike: (b: number, a: number) => boolean): (readonly [number, number])[] {
	let head = 0;
	while (head < before.length && head < after.length && before[head] === after[head]) head++;
	let tail = 0;
	while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;
	const shared = sharedLines(before.slice(head, before.length - tail), after.slice(head, after.length - tail)).map(([b, a]) => [b + head, a + head] as const);
	const anchors = [...Array.from({ length: head }, (_, i) => [i, i] as const), ...shared, ...Array.from({ length: tail }, (_, i) => [before.length - tail + i, after.length - tail + i] as const)];
	const pairs: (readonly [number, number])[] = [];
	let b = 0;
	let a = 0;
	for (const anchor of [...anchors, [before.length, after.length] as const]) {
		pairs.push(...inPlace(b, anchor[0], a, anchor[1], alike));
		if (anchor[0] < before.length) pairs.push(anchor);
		b = anchor[0] + 1;
		a = anchor[1] + 1;
	}
	return pairs;
}

/** A changed block's lines edited in place: one for one when both sides are as long and every pair is alike. */
function inPlace(b0: number, b1: number, a0: number, a1: number, alike: (b: number, a: number) => boolean): (readonly [number, number])[] {
	if (b1 - b0 !== a1 - a0 || b1 === b0) return [];
	const pairs = Array.from({ length: b1 - b0 }, (_, k) => [b0 + k, a0 + k] as const);
	return pairs.every(([x, y]) => alike(x, y)) ? pairs : [];
}
