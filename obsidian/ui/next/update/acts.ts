import type { EntryList, ViewMode } from "../../../../core/application/contracts";
import { type BlockModel, shownLists } from "../model/block";
import type { Act, BlockMsg } from "../model/messages";
import type { ListRow } from "../model/lists";
import { menuActMessage } from "./menu";
import { fullAct } from "./fullActs";

/** The rows the block draws now, by key. */
function rowOf(model: BlockModel, key: string): ListRow | null {
	const lists = shownLists(model);
	const rows = lists.kind === "rows" ? lists.rows.flatMap((row) => row.list.rows) : lists.kind === "byProject" ? lists.list.rows : [];
	return rows.find((row) => row.key === key) ?? null;
}

/** A link a menu's copy of a card carries (`note:target`, `url:target`). */
function linkOf(value: string | null): BlockMsg | null {
	if (value === null) return null;
	const at = value.indexOf(":");
	const kind = value.slice(0, at);
	return kind === "note" || kind === "url" ? { kind: "linkTapped", link: { kind, target: value.slice(at + 1) } } : null;
}

/** What a press on a marked element means (the view marks, `update` decides); null for nothing. */
export function actMessage(model: BlockModel, act: Act): BlockMsg | null {
	switch (act.act) {
		case "undo":
			return { kind: "undoTapped" };
		case "more":
			return { kind: "moreTapped" };
		case "view":
			return { kind: "viewButtonTapped" };
		case "plus":
			return { kind: "plusTapped" };
		case "dismiss":
			return { kind: "layerDismissed" };
		case "mode":
			return act.value === null ? null : { kind: "modePicked", mode: act.value as ViewMode };
		case "subprojects":
			return { kind: "subprojectsPicked" };
		case "search":
			return { kind: "searchPicked" };
		case "select":
			return { kind: "selectPicked" };
		case "selectStop":
			return { kind: "select", msg: { kind: "stop" } };
		case "selectActions":
			return { kind: "select", msg: { kind: "actions" } };
		case "link":
			return linkOf(act.value);
		case "card":
		case "counter":
		case "mark":
			return act.key === null ? null : { kind: "cardTapped", key: act.key, part: act.act };
		case "plate": {
			const row = act.key === null ? null : rowOf(model, act.key);
			return row?.kind === "plate" ? { kind: "plateTapped", row: row.key, group: row.group, list: row.list } : null;
		}
		case "room":
			return act.value === null ? null : { kind: "entry", msg: { kind: "atEnd", column: act.value as EntryList } };
		default: {
			if (act.act.startsWith("bar:")) return { kind: "entry", msg: { kind: "bar", act: act.act.slice("bar:".length), value: act.value } };
			if (!act.act.startsWith("menu:")) return fullAct(act);
			const msg = menuActMessage(act.act.slice("menu:".length), act.value);
			return msg ? { kind: "menu", msg } : null;
		}
	}
}
