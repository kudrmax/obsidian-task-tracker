import type { BlockModel } from "../model/block";
import type { SearchMsg } from "../model/search";
import type { Step } from "./block";

/** The search's messages (P2): built out with the search. */
export function updateSearch(model: BlockModel, msg: SearchMsg): Step {
	void msg;
	return [model, []];
}
