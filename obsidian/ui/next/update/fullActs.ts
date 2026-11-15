import type { Act, BlockMsg } from "../model/messages";
import type { FullMsg } from "../model/full";
import type { SearchMsg } from "../model/search";
import { FULL_ROW } from "../model/fullList";

/** A full card's row key is its task's id after `full/`. */
const idOf = (key: string): string => (key.startsWith(FULL_ROW) ? key.slice(FULL_ROW.length) : key);

const full = (msg: FullMsg): BlockMsg => ({ kind: "full", msg });
const search = (msg: SearchMsg): BlockMsg => ({ kind: "search", msg });

/** What a press on the full card's or the search's marked parts means (`full:…`, `search:…`); null for anything else. */
export function fullAct(act: Act): BlockMsg | null {
	switch (act.act) {
		case "full:close":
			return full({ kind: "close" });
		case "full:done":
			return full({ kind: "done" });
		case "full:up":
			return full({ kind: "up" });
		case "full:project":
			return full({ kind: "project" });
		case "full:more":
			return full({ kind: "more" });
		case "full:add":
			return full({ kind: "add" });
		case "full:card":
		case "full:counter":
		case "full:mark":
			return act.key === null ? null : full({ kind: "subtask", id: idOf(act.key) });
		case "full:tick":
			return act.key === null ? null : full({ kind: "tick", id: idOf(act.key) });
		case "search:dismiss":
		case "search:cancel":
			return search({ kind: "cancel" });
		case "search:pick": {
			const row = Number(act.value);
			return Number.isInteger(row) ? search({ kind: "pick", row }) : null;
		}
		default:
			return null;
	}
}
