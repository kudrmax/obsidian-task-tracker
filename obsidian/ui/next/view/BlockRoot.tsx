import type { JSX } from "preact";
import { createPortal } from "preact/compat";
import { type BlockModel, rootClasses } from "../model/block";
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
		<div class={rootClasses(model, "tc-n-block")} tabIndex={-1}>
			<Block model={model} />
			{createPortal(<Layers model={model} />, layers)}
		</div>
	);
}
