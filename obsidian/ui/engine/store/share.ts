/**
 * Structural sharing (as TanStack Query's `replaceEqualDeep` and Redux's immutable updates keep it): the new value with
 * every part that is equal to the old one replaced by the old one's object. A card whose data did not change keeps its
 * identity, so its selector answers the same object and its face is not drawn again (spec, principle 8).
 */
export function share<T>(prev: T, next: T): T {
	if (Object.is(prev, next)) return prev;
	if (Array.isArray(prev) && Array.isArray(next)) {
		const out = next.map((item, i) => share(prev[i], item));
		return (out.length === prev.length && out.every((item, i) => Object.is(item, prev[i])) ? prev : out) as T;
	}
	if (isPlain(prev) && isPlain(next)) {
		const keys = Object.keys(next);
		const out: Record<string, unknown> = {};
		let same = keys.length === Object.keys(prev).length;
		for (const key of keys) {
			out[key] = share((prev as Record<string, unknown>)[key], (next as Record<string, unknown>)[key]);
			if (!Object.is(out[key], (prev as Record<string, unknown>)[key])) same = false;
		}
		return (same ? prev : out) as T;
	}
	return next;
}

const isPlain = (value: unknown): value is object => typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
