/** The search over the block (⋯ → Search, Cmd+F): built out by the search. */
export interface SearchModel {
	readonly query: string;
}

export type SearchMsg = { readonly kind: "open" };
