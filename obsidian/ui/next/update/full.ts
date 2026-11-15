import type { BlockModel } from "../model/block";
import type { FullMsg } from "../model/full";
import type { Step } from "./block";

/** The full's messages (P2): built out with the full. */
export function updateFull(model: BlockModel, msg: FullMsg): Step {
	void msg;
	return [model, []];
}
