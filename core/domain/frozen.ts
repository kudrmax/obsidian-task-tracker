/** `value` and every object and array in it frozen, in place: for data shared between readers, which none may change. */
export function deepFrozen<T>(value: T): T {
	if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const v of Object.values(value)) deepFrozen(v);
	}
	return value;
}

/** A copy of plain data (objects, arrays, values), nothing of it shared with `value`. */
export function plainCopy<T>(value: T): T {
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map(plainCopy) as T;
	return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plainCopy(v)])) as T;
}
