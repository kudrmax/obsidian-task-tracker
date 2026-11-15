import type { BlockModel } from "../model/block";
import type { MenuMsg } from "../model/taskMenu";
import type { Step } from "./block";

/** The menu's messages (P2): built out with the menu. */
export function updateMenu(model: BlockModel, msg: MenuMsg): Step {
	void msg;
	return [model, []];
}
