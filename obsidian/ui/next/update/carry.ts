import type { BlockModel } from "../model/block";
import type { CarryMsg } from "../model/carry";
import type { Step } from "./block";

/** The carry's messages (P2): built out with the carry. */
export function updateCarry(model: BlockModel, msg: CarryMsg): Step {
	void msg;
	return [model, []];
}
