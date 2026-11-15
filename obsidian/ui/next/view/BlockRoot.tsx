import type { JSX } from "preact";
import { createPortal } from "preact/compat";
import { type BlockModel, blends, entering } from "../model/block";
import { footAside } from "../model/carryView";
import { Block } from "./Block";
import { Layers } from "./Layers";

export interface BlockRootProps {
	readonly model: BlockModel;
	/** The overlay host's node: every layer of the block mounts there (§Architecture, the overlay host). */
	readonly layers: HTMLElement;
}

/** The block's frame at the note's end, and its layers in the overlay host. */
export function BlockRoot({ model, layers }: BlockRootProps): JSX.Element {
	return (
		<div class={`task-calendar tc-n-block ${blends(model) ? "is-blend" : ""} ${entering(model) ? "is-entering" : ""} ${footAside(model) ? "is-carrying" : ""}`} tabIndex={-1} data-n-anchor="block" data-n-key="root/block">
			<Block model={model} />
			{createPortal(<Layers model={model} />, layers)}
		</div>
	);
}
