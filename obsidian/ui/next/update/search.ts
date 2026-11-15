import type { SearchHit } from "../../../../core/application/contracts";
import { type BlockModel, taskById } from "../model/block";
import type { Command } from "../model/commands";
import { fullTaskOf } from "../model/full";
import type { BlockMsg } from "../model/messages";
import { pickedRow, type SearchModel, type SearchMsg, searchHits } from "../model/search";
import type { Step } from "./block";
import { assertNever } from "../model/assertNever";
import { updateFull } from "./full";

/** The search's field, by the name the view gives it (`data-n-field`). */
export const SEARCH_FIELD = "search";

const search = (msg: SearchMsg): BlockMsg => ({ kind: "search", msg });

/** The window goes (Cancel, Escape, the sheet, a pick): it fades, and goes once it has (`gone`). */
function closing(model: BlockModel, picked: SearchHit | null): BlockModel {
	if (!model.search || model.search.closing) return model;
	return { ...model, search: { ...model.search, closing: true, chosen: picked } };
}

/**
 * The search (P2): its field typed in, the rows its answer gives (a need, `tasks.search`), a pick taking the block to the
 * task. In the note's block the task's card wears the ring when the block shows it; anywhere else (another project,
 * Done) it opens on the full card.
 */
export function updateSearch(model: BlockModel, msg: SearchMsg): Step {
	const current = model.search;
	switch (msg.kind) {
		case "open": {
			if (current && !current.closing) return [model, [{ kind: "focus", field: SEARCH_FIELD }]];
			const opened: SearchModel = { query: "", picked: 0, closing: false, chosen: null };
			return [{ ...model, search: opened, found: null }, [{ kind: "focus", field: SEARCH_FIELD }]];
		}
		case "typed":
			return current && !current.closing ? [{ ...model, search: { ...current, query: msg.query, picked: 0 } }, []] : [model, []];
		case "walk": {
			if (!current || current.closing) return [model, []];
			const rows = searchHits(model.answers).length;
			if (rows === 0) return [model, []];
			return [{ ...model, search: { ...current, picked: Math.min(rows - 1, Math.max(0, pickedRow(model.wide, model.search, model.answers) + msg.step)) } }, []];
		}
		case "enter": {
			const row = pickedRow(model.wide, model.search, model.answers);
			return row < 0 ? [model, []] : updateSearch(model, { kind: "pick", row });
		}
		case "pick": {
			const hit = searchHits(model.answers).find((_, i) => i === msg.row) ?? null;
			if (!current || current.closing || !hit) return [model, []];
			/** The core unfolds the tasks above a found subtask, so its card is drawn (`tasks.reveal`). */
			const reveal: Command<BlockMsg> = { kind: "door", method: "tasks.reveal", args: [hit.item], reply: (outcome) => (outcome.answer.ok ? null : { kind: "failed", error: outcome.answer.error }) };
			return [closing(model, hit), [reveal]];
		}
		case "cancel":
			return [closing(model, null), []];
		case "gone": {
			const picked = current?.chosen ?? null;
			const left: BlockModel = { ...model, search: null };
			if (!picked) return [left, []];
			if (taskById(left, picked.item.id)) return [{ ...left, found: { id: picked.item.id, scroll: true } }, [{ kind: "show", key: picked.item.id, then: search({ kind: "shown" }) }]];
			return updateFull(left, { kind: "open", id: picked.item.id, description: false, task: fullTaskOf(picked.item) });
		}
		case "pressed":
			return model.found ? [{ ...model, found: null }, []] : [model, []];
		case "shown":
			return model.found ? [{ ...model, found: { ...model.found, scroll: false } }, []] : [model, []];
		default:
			return assertNever(msg);
	}
}

/** A key in the search's field: the arrows walk the rows, Enter opens the picked one, Escape closes; null for any other. */
export function searchFieldKey(key: string): SearchMsg | null {
	switch (key) {
		case "ArrowDown":
			return { kind: "walk", step: 1 };
		case "ArrowUp":
			return { kind: "walk", step: -1 };
		case "Enter":
			return { kind: "enter" };
		case "Escape":
			return { kind: "cancel" };
		default:
			return null;
	}
}
