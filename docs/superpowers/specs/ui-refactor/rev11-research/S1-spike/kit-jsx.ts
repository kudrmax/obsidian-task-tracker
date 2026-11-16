declare const kitNode: unique symbol;
/** What a kit element is to the kit: opaque. Only the host's runtime knows it is a Preact VNode. */
export interface KitNode { readonly [kitNode]: true }
export type KitChild = KitNode | string | null | false | readonly KitChild[];
export type KitClass = `tc-n-${string}` | `is-${string}`;
interface Base { readonly class?: KitClass; readonly children?: KitChild; readonly key?: string }
type Motion = { readonly motion: string | "none" };
export declare namespace JSX {
	type Element = KitNode;
	interface ElementChildrenAttribute { children: {} }
	interface IntrinsicAttributes { readonly key?: string }
	interface IntrinsicElements {
		div: Base & Motion;
		span: Base;
		ul: Base & Motion;
		li: Base & Motion;
	}
}
export declare function jsx(type: unknown, props: unknown, key?: string): KitNode;
export declare function jsxs(type: unknown, props: unknown, key?: string): KitNode;
export declare const Fragment: unique symbol;
