import { canPick } from "../../../../core/application/contracts";
import { type BlockModel, currentLists } from "../model/block";
import type { SelectMsg } from "../model/select";
import { assertNever } from "../model/assertNever";
import type { Step } from "./block";
import { cardRowOf, listsOf } from "./carry";
import { updateMenu } from "./menu";

/** The pickable cards' keys of the list `key` stands in, in order (a Shift-click picks a run of them). */
function columnOf(model: BlockModel, key: string): readonly string[] {
	for (const { list } of listsOf(currentLists(model))) {
		const keys = list.rows.flatMap((row) => (row.kind === "card" && canPick(row.from) ? [row.key] : []));
		if (keys.includes(key)) return keys;
	}
	return [];
}

/**
 * Select mode and picks (bulk actions spec): Select tasks puts a circle on every list card and a tap picks; ⌘-click
 * picks on the desktop without it, Shift-click a run from the last pick; the picked cards' menu is the menu's
 * (`openedBulk`); the cross, Escape, or any action on them lets them go.
 */
export function updateSelect(model: BlockModel, msg: SelectMsg): Step {
	const select = model.select;
	switch (msg.kind) {
		case "start":
			return [{ ...model, select: { selecting: true, picked: select?.picked ?? [] } }, []];
		case "stop":
			return select ? [{ ...model, select: null }, []] : [model, []];
		case "toggle": {
			const row = cardRowOf(currentLists(model), msg.key)?.row;
			if (!row || !canPick(row.from)) return [model, []];
			const picked = select?.picked ?? [];
			const selecting = select?.selecting ?? false;
			if (msg.run && picked.length > 0) {
				const column = columnOf(model, msg.key);
				const from = column.indexOf(picked.slice(-1).join(""));
				const to = column.indexOf(msg.key);
				const run = from < 0 ? [msg.key] : column.slice(Math.min(from, to), Math.max(from, to) + 1);
				return [{ ...model, select: { selecting, picked: [...picked, ...run.filter((key) => !picked.includes(key))] } }, []];
			}
			const next = picked.includes(msg.key) ? picked.filter((key) => key !== msg.key) : [...picked, msg.key];
			return [{ ...model, select: next.length === 0 && !selecting ? null : { selecting, picked: next } }, []];
		}
		case "actions":
			return (select?.picked.length ?? 0) > 0 ? updateMenu(model, { kind: "openedBulk", at: { at: "over" } }) : [model, []];
		case "pressedAway":
			return select && !select.selecting && model.layers.length === 0 ? [{ ...model, select: null }, []] : [model, []];
		default:
			return assertNever(msg);
	}
}
