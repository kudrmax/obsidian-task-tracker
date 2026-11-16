import { Fragment, type FunctionComponent, type VNode } from "preact";
import { jsx as preactJsx } from "preact/jsx-runtime";
import { memo } from "preact/compat";
import type { KitNode } from "./kit-jsx";
export type { JSX } from "./kit-jsx";
export { Fragment };

/** The one crossing between the kit's opaque node and Preact's: an overload pair, no cast. */
export function cross(n: KitNode): VNode;
export function cross(n: VNode): KitNode;
export function cross(n: KitNode | VNode): KitNode | VNode {
	return n;
}

type KitComponent<P extends object> = (props: P) => KitNode;
const memoised = new WeakMap<KitComponent<never>, FunctionComponent<never>>();

/** Each kit component becomes one memoised Preact component, made once and kept. */
function preactOf<P extends object>(type: KitComponent<P>): FunctionComponent<P> {
	const kept = memoised.get(type) as FunctionComponent<P> | undefined;
	if (kept) return kept;
	const made = memo((props: P) => cross(type(props)));
	memoised.set(type, made as FunctionComponent<never>);
	return made;
}

export function jsx<P extends object>(type: string | KitComponent<P>, props: P, key?: string): KitNode {
	return typeof type === "string" ? cross(preactJsx(type, props, key)) : cross(preactJsx(preactOf(type), props, key));
}
export const jsxs = jsx;
export const jsxDEV = jsx;
