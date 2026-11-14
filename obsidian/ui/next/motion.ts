/**
 * Why the rows of a list changed, carried in the state next to the rows themselves. Only `write` lets rows slide, and
 * only in the lists it names; another context (project, mode, day) and a read from outside are drawn in place.
 */
export type Cause =
	| { readonly kind: "still" }
	| { readonly kind: "write"; readonly lists: ReadonlySet<string> }
	| { readonly kind: "context" };

export const STILL: Cause = { kind: "still" };

export function slides(cause: Cause, list: string): boolean {
	return cause.kind === "write" && cause.lists.has(list);
}
