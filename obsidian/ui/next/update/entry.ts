import type { BlockModel } from "../model/block";
import type { EntryMsg } from "../model/entry";
import type { Step } from "./block";

/** The entry's messages (P2): built out with the entry. */
export function updateEntry(model: BlockModel, msg: EntryMsg): Step {
	void msg;
	return [model, []];
}
