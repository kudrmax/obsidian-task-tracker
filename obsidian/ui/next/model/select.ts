/** Select mode in the block (⋯ → Select tasks): built out with the bulk menu. */
export interface SelectModel {
	readonly picked: readonly string[];
}

export type SelectMsg = { readonly kind: "start" };
