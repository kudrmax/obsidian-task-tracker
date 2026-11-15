/**
 * A section named in a call's arguments by its id (`ListSection.id`): the runtime hands the door the section's name as the
 * file has it when the call runs, so a call replayed after another device renamed the section names it as it is now.
 * Tasks need nothing of the kind: the door finds every task key by its id (`tasks.freshArgs`).
 */
export interface SectionRef {
	readonly sectionRef: string;
}

export function sectionRef(id: string): SectionRef {
	return { sectionRef: id };
}

/** A section a call names is gone: the call is stale. */
export class GoneSection extends Error {
	constructor(readonly id: string) {
		super(`section ${id} is no longer in the file`);
	}
}

type Plain = Readonly<Record<string, unknown>>;

function isSectionRef(value: unknown): value is SectionRef {
	return typeof value === "object" && value !== null && typeof (value as Plain).sectionRef === "string" && Object.keys(value).length === 1;
}

/** `value` with every section ref replaced by `swap`, sharing what did not change. */
function swapped(value: unknown, swap: (ref: SectionRef) => unknown): unknown {
	if (isSectionRef(value)) return swap(value);
	if (Array.isArray(value)) {
		const parts = value.map((v) => swapped(v, swap));
		return parts.every((p, i) => p === value[i]) ? value : parts;
	}
	if (typeof value !== "object" || value === null) return value;
	let changed = false;
	const entries = Object.entries(value).map(([k, v]) => {
		const next = swapped(v, swap);
		changed ||= next !== v;
		return [k, next] as const;
	});
	return changed ? Object.fromEntries(entries) : value;
}

/** The arguments with each section ref following the ids a replay's creates gave anew (`created`, old → new). */
export function followSections<T>(args: T, idMap: ReadonlyMap<string, string>): T {
	if (idMap.size === 0) return args;
	return swapped(args, (ref) => (idMap.has(ref.sectionRef) ? sectionRef(idMap.get(ref.sectionRef)!) : ref)) as T;
}

/** The arguments as the door takes them: each section ref its name now (`tasks.sectionOf`); a section gone throws. */
export function namedSections<T>(args: T, nameOf: (id: string) => string | null): T {
	return swapped(args, (ref) => {
		const name = nameOf(ref.sectionRef);
		if (name === null) throw new GoneSection(ref.sectionRef);
		return name;
	}) as T;
}
