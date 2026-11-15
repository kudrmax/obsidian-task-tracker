import type { TaskMenuLayer } from "./taskMenu";
import type { FullLayer } from "./full";
import type { SectionMenuLayer } from "./section";

/**
 * A layer over the block (P6): the stack's order is the order they opened; Escape and a tap outside close the top one.
 * `closing`: its close motion runs, and the lists under it stay pinned until it ends (R10).
 */
export type Layer =
	| { readonly kind: "viewMenu"; readonly closing: boolean }
	| { readonly kind: "moreMenu"; readonly closing: boolean }
	| TaskMenuLayer
	| FullLayer
	| SectionMenuLayer;

export type LayerKind = Layer["kind"];

export function topLayer(layers: readonly Layer[]): Layer | null {
	return layers.slice(-1).find(() => true) ?? null;
}

/** Layers whose close motion has not begun. */
export function openLayers(layers: readonly Layer[]): readonly Layer[] {
	return layers.filter((layer) => !layer.closing);
}
