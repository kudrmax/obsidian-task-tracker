import type { TaskKey } from "../../../core/application/contracts";
import type { TaskIdState } from "../../../core/application/TaskIdentity";

/**
 * A section named in a call's arguments by its id (`ListSection.id`): the runtime hands the door the section's name as the
 * file has it when the call runs, so a call replayed after another device renamed the section names it as it is now.
 */
export interface SectionRef {
	readonly sectionRef: string;
}

export function sectionRef(id: string): SectionRef {
	return { sectionRef: id };
}

/** How a call's references are resolved when it runs: a task's key by its id, a section's name by its id; null: gone. */
export interface RefResolver {
	key(id: string): TaskKey | null;
	section(id: string): string | null;
}

/** A task or section a call names is gone: the call is stale. */
export class GoneRef extends Error {
	constructor(readonly id: string) {
		super(`${id} is no longer in the file`);
	}
}

type Plain = Readonly<Record<string, unknown>>;

const isObject = (value: unknown): value is Plain => typeof value === "object" && value !== null;

/** A task's key as the door gives it: a place, a line and the task's id. */
function isTaskKey(value: Plain): value is Plain & TaskKey & { readonly id: string } {
	return typeof value.raw === "string" && typeof value.index === "number" && Array.isArray(value.path) && typeof value.id === "string" && "section" in value;
}

function isSectionRef(value: Plain): value is Plain & SectionRef {
	return typeof value.sectionRef === "string" && Object.keys(value).length === 1;
}

/** `value` with every part rebuilt by `visit` (which answers undefined to go on into the part), sharing what did not change. */
function rebuilt(value: unknown, visit: (part: Plain) => unknown): unknown {
	if (Array.isArray(value)) {
		const parts = value.map((v) => rebuilt(v, visit));
		return parts.every((p, i) => p === value[i]) ? value : parts;
	}
	if (!isObject(value)) return value;
	const own = visit(value);
	if (own !== undefined) return own;
	let changed = false;
	const entries = Object.entries(value).map(([k, v]) => {
		const next = rebuilt(v, visit);
		changed ||= next !== v;
		return [k, next] as const;
	});
	return changed ? Object.fromEntries(entries) : value;
}

/** The arguments with every id an earlier replayed create gave anew mapped to its new id: in keys, lifted cards, section refs. */
export function mapIds<T>(args: T, map: ReadonlyMap<string, string>): T {
	if (map.size === 0) return args;
	return rebuilt(args, (part) => {
		if (isSectionRef(part)) return map.has(part.sectionRef) ? sectionRef(map.get(part.sectionRef)!) : part;
		if (typeof part.id === "string" && map.has(part.id)) return mapIds({ ...part, id: map.get(part.id)! }, map);
		return undefined;
	}) as T;
}

/** The arguments as the door takes them: each task's key the file's now (`tasks.keyOf`), each section ref its name. */
export function resolveRefs<T>(args: T, resolver: RefResolver, keys: boolean): T {
	return rebuilt(args, (part) => {
		if (isSectionRef(part)) {
			const name = resolver.section(part.sectionRef);
			if (name === null) throw new GoneRef(part.sectionRef);
			return name;
		}
		if (keys && isTaskKey(part)) {
			const key = resolver.key(part.id);
			if (key === null) throw new GoneRef(part.id);
			return key;
		}
		return undefined;
	}) as T;
}

const idNumber = (id: string): number => Number(id.replace(/^\D+/, ""));

/** The ids a call gave anew, in the order it gave them: in the ids after it, not before. */
export function createdIds(before: TaskIdState | undefined, after: TaskIdState | undefined): string[] {
	if (after === undefined || after === before) return [];
	const known = new Set((before?.lines ?? []).map((l) => l.id));
	return after.lines
		.map((l) => l.id)
		.filter((id) => !known.has(id))
		.sort((a, b) => idNumber(a) - idNumber(b));
}
