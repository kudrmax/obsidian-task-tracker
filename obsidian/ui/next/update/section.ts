import { type BlockModel, currentLists } from "../model/block";
import { write } from "../model/commands";
import { topLayer } from "../model/layers";
import type { BlockMsg } from "../model/messages";
import { SECTION_FIELD, type SectionMsg } from "../model/section";
import { assertNever } from "../model/assertNever";
import { type Step, closeTop } from "./block";

const failed = (error: { readonly code: string; readonly message: string }): BlockMsg => ({ kind: "failed", error });

/** A section named in a writing call by its id (decision 1): the header's row key is `head:<id>`. */
const sectionRef = (head: string) => ({ sectionRef: head.slice("head:".length) });

/**
 * A section's header (the old screen's `GroupDrag.onTap`, `GroupMenu`, `renameInPlace`): a tap opens its menu when the
 * core offers it anything (`ListGroup.menu`); Rename types its name in place of the header, the caret in the field
 * inside the tap; Remove section writes at once (`removeGroup`); the name typed ends as the core's `sectionName.end` says.
 */
export function updateSection(model: BlockModel, msg: SectionMsg): Step {
	switch (msg.kind) {
		case "menu": {
			const lists = currentLists(model);
			if (lists.kind !== "rows" || model.carry || model.sectionRename) return [model, []];
			const row = lists.rows.find((r) => r.list.rows.some((x) => x.key === msg.head));
			const head = row?.list.rows.find((x) => x.key === msg.head);
			const menu = head?.kind === "head" ? head.menu : null;
			if (!row || !menu || row.sectionList === null || !(menu.rename || menu.remove)) return [model, []];
			return [{ ...model, layers: [...model.layers, { kind: "sectionMenu", closing: false, head: msg.head, list: row.sectionList, section: menu.section, rename: menu.rename, remove: menu.remove }] }, []];
		}
		case "rename": {
			const top = topLayer(model.layers);
			if (top?.kind !== "sectionMenu" || top.closing) return [model, []];
			return [{ ...closeTop(model), sectionRename: { head: top.head, list: top.list, name: top.section } }, [{ kind: "focus", field: SECTION_FIELD }]];
		}
		case "remove": {
			const top = topLayer(model.layers);
			if (top?.kind !== "sectionMenu" || top.closing) return [model, []];
			return [closeTop(model), [write("tasks.removeGroup", [top.list, sectionRef(top.head)], failed)]];
		}
		case "named":
			if (!model.sectionRename) return [model, []];
			return [model, [{ kind: "door", method: "sectionName.end", args: [false, "enter", msg.text], reply: (outcome) => ({ kind: "section", msg: { kind: "ended", name: endName(outcome.answer) } }) }]];
		case "unnamed":
			return model.sectionRename ? [{ ...model, sectionRename: null }, []] : [model, []];
		case "ended": {
			const rename = model.sectionRename;
			if (!rename) return [model, []];
			const done = { ...model, sectionRename: null };
			return msg.name === null ? [done, []] : [done, [write("tasks.renameGroup", [rename.list, sectionRef(rename.head), msg.name], failed)]];
		}
		default:
			return assertNever(msg);
	}
}

/** The name `sectionName.end` answered to write; null for none. */
function endName(answer: { readonly ok: boolean; readonly result?: unknown }): string | null {
	if (!answer.ok || typeof answer.result !== "object" || answer.result === null || !("end" in answer.result)) return null;
	const end = answer.result.end;
	return typeof end === "object" && end !== null && "name" in end && typeof end.name === "string" ? end.name : null;
}
