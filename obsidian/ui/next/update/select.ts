import type { BlockModel } from "../model/block";
import type { SelectMsg } from "../model/select";
import type { Step } from "./block";

/** The select's messages (P2): built out with the select. */
export function updateSelect(model: BlockModel, msg: SelectMsg): Step {
	void msg;
	return [model, []];
}
