import { canPick, type DropColumn, type DroppedTask, endsSelection, groupPlaceOf, type ProjectsDrop, type TaskKey } from "../../../../core/application/contracts";
import { okResult } from "../model/answers";
import { type BlockLists, type BlockModel, currentLists, noteView, taskById, today } from "../model/block";
import type { CarryModel, CarryMsg, SectionCarry } from "../model/carry";
import { type Command, write } from "../model/commands";
import type { CardRow, ListModel, ListRow } from "../model/lists";
import type { BlockMsg } from "../model/messages";
import { assertNever } from "../model/assertNever";
import type { Step } from "./block";
import { updateMenu } from "./menu";
import { updateSelect } from "./select";
import { updateEntry } from "./entry";

const failed = (error: { readonly code: string; readonly message: string }): BlockMsg => ({ kind: "failed", error });
const carryMsg = (msg: CarryMsg): BlockMsg => ({ kind: "carry", msg });

/** Every list the lists draw, by what each is (a funnel's column, or By subprojects' parts). */
export function listsOf(lists: BlockLists): readonly { readonly column: DropColumn | "projects"; readonly list: ListModel }[] {
	if (lists.kind === "rows") return lists.rows.map((row) => ({ column: row.column, list: row.list }));
	if (lists.kind === "byProject") return [{ column: "projects", list: lists.list }];
	return [];
}

/** The card row keyed `key` among the lists, and the list it stands in. */
export function cardRowOf(lists: BlockLists, key: string): { readonly row: CardRow; readonly list: ListModel } | null {
	for (const { list } of listsOf(lists)) {
		const row = list.rows.find((r): r is CardRow => r.kind === "card" && r.key === key);
		if (row) return { row, list };
	}
	return null;
}

/** The rows of a card's subtasks at every depth: the cards right after it, deeper than it. */
function subtreeOf(list: ListModel, key: string): readonly string[] {
	const at = list.rows.findIndex((row) => row.key === key);
	const row = list.rows.find((_, i) => i === at);
	if (!row || row.kind !== "card") return [];
	const out: string[] = [];
	for (const next of list.rows.slice(at + 1)) {
		if (next.kind !== "card" || next.level <= row.level) break;
		out.push(next.key);
	}
	return out;
}

/** The lists with these rows left out: a carried card's subtasks fold away under it while it is carried (P6). */
function without(lists: BlockLists, rows: ReadonlySet<string>): BlockLists {
	if (rows.size === 0) return lists;
	const keep = (list: ListModel): ListModel => ({ ...list, rows: list.rows.filter((row: ListRow) => !rows.has(row.key)) });
	if (lists.kind === "rows") return { ...lists, rows: lists.rows.map((row) => ({ ...row, list: keep(row.list) })) };
	if (lists.kind === "byProject") return { ...lists, list: keep(lists.list) };
	return lists;
}

/** The carry starts with these cards: the lists pinned as they stood (their subtasks folded away), the core told (`startCarry`). */
function lifted(model: BlockModel, key: string, at: { readonly x: number; readonly y: number }, box: CarryModel["box"], along: readonly string[]): Step {
	const lists = currentLists(model);
	const found = cardRowOf(lists, key);
	if (!found || model.carry) return [model, []];
	const rows = [key, ...along.filter((id) => id !== key)].filter((id) => cardRowOf(lists, id) !== null);
	const cards = rows.map((id) => cardRowOf(lists, id)!.row);
	const folded = rows.flatMap((id) => subtreeOf(cardRowOf(lists, id)!.list, id));
	const projects = cards.flatMap((card) => (card.drop ? [card.drop] : []));
	const carry: CarryModel = {
		kind: "cards",
		ring: false,
		section: null,
		id: key,
		ids: cards.map((card) => card.item.id),
		rows,
		folded,
		origins: cards.flatMap((card) => (card.from === "full" || card.from === "stack" || card.from === "done" ? [] : [card.from])),
		cards: projects,
		grab: { dx: at.x - box.left, dy: at.y - box.top },
		box,
		geometry: null,
		target: null,
		phase: "carried",
		lands: null,
	};
	const keys: readonly TaskKey[] = cards.map((card) => card.item.key);
	const start = { keys, ...(projects.length > 0 && { cards: projects }) };
	return [
		{ ...model, carry, pinned: without(model.pinned ?? lists, new Set(folded)) },
		[{ kind: "haptic" }, write("tasks.startCarry", [start, model.wide], failed), { kind: "measureCarry", measured: (geometry) => carryMsg({ kind: "measured", geometry }) }],
	];
}

/** The tasks a drop lets go, the one under the finger first, each with the list it was dragged from. */
function dropped(model: BlockModel, carry: CarryModel): readonly DroppedTask[] {
	const lists = model.pinned ?? currentLists(model);
	return carry.rows.flatMap((key) => {
		const found = cardRowOf(lists, key);
		const from = found?.row.from;
		return found && (from === "inbox" || from === "soon" || from === "day" || from === "backlog" || from === "timeline") ? [{ key: found.row.item.key, from }] : [];
	});
}

/** The carry ends: the core told how (`endCarry`), Select tasks ending as the core says for a carry that landed (`endsSelection`). */
function ended(model: BlockModel, how: "dropped" | "nowhere"): Step {
	const done = endsSelection(how) && model.select !== null ? { ...model, select: null } : model;
	return [done, [write("tasks.endCarry", [how], failed)]];
}

/**
 * The carry inside the block (P6): a card lifted pins the lists as they stood, its place waiting dashed and its subtasks
 * folded away; the finger's target is read against the geometry measured at the lift; let go on a place, the drop is
 * the core's (`tasks.drop`, By subprojects `tasks.dropInProjects`) and the float flies onto the card where it now
 * stands; let go nowhere, called off, or its task gone from the file, it flies back or fades, and the carry ends.
 */
export function updateCarry(model: BlockModel, msg: CarryMsg): Step {
	switch (msg.kind) {
		case "tap":
			return tapped(model, msg);
		case "context": {
			const picked = model.select?.picked ?? [];
			if (picked.includes(msg.key) && picked.length > 1) return updateMenu(model, { kind: "openedBulk", at: { at: "beside", key: msg.key } });
			return cardRowOf(currentLists(model), msg.key) ? updateMenu(model, { kind: "opened", id: msg.key }) : [model, []];
		}
		case "lift": {
			const picked = model.select?.picked ?? [];
			const lists = currentLists(model);
			const found = cardRowOf(lists, msg.key);
			if (!found || model.carry) return [model, []];
			if (!picked.includes(msg.key)) {
				const keep = model.select?.selecting === true ? model : { ...model, select: null };
				return lifted(keep, msg.key, msg.at, msg.box, []);
			}
			const keys = picked.flatMap((key) => {
				const row = cardRowOf(lists, key)?.row;
				return row ? [row.item.key] : [];
			});
			return [
				model,
				[
					{
						kind: "door",
						method: "tasks.carried",
						args: [found.row.item.key, keys],
						reply: (outcome) => {
							const along = (okResult<readonly TaskKey[]>(outcome) ?? []).map((key) => key.id ?? "");
							const ids = picked.filter((key) => along.includes(cardRowOf(lists, key)?.row.item.id ?? ""));
							return carryMsg({ kind: "along", key: msg.key, at: msg.at, box: msg.box, ids });
						},
					},
				],
			];
		}
		case "along":
			return lifted(model, msg.key, msg.at, msg.box, msg.ids);
		case "liftPlus":
			return liftedPlus(model, msg.at, msg.box);
		case "liftSection":
			return liftedSection(model, msg.key, msg.at, msg.box);
		case "slot": {
			const carry = model.carry;
			if (!carry?.section || carry.phase !== "carried" || carry.section.gap === msg.gap) return [model, []];
			/** The landing place opens at the new slot and closes behind: the rows around it slide (a drawing that moves). */
			const motion = { ...model.motion, seq: model.motion.seq + 1, cause: "move" as const };
			return [{ ...model, carry: { ...carry, section: { ...carry.section, gap: msg.gap } }, motion }, []];
		}
		case "measured":
			return model.carry ? [{ ...model, carry: { ...model.carry, geometry: msg.geometry } }, []] : [model, []];
		case "over":
			return model.carry && model.carry.phase === "carried" ? [{ ...model, carry: { ...model.carry, target: msg.target, ring: msg.ring === true } }, []] : [model, []];
		case "drop":
			return droppedNow(model);
		case "cancel": {
			const carry = model.carry;
			if (!carry || carry.phase !== "carried") return [model, []];
			if (carry.kind === "plus") return [{ ...model, carry: { ...carry, phase: "returning", target: null, ring: false } }, [fly(PLUS_ANCHOR)]];
			if (carry.kind === "section") return [{ ...model, carry: { ...carry, phase: "returning" }, pinned: unpinned(model) }, [fly(carry.section?.head ?? null, true)]];
			const [next, commands] = ended({ ...model, carry: { ...carry, phase: "returning", target: null } }, "nowhere");
			return [next, [...commands, fly(carry.id)]];
		}
		case "landed": {
			if (!model.carry) return [model, []];
			const still = model.layers.some((layer) => layer.closing);
			return [{ ...model, carry: null, pinned: still ? model.pinned : null }, []];
		}
		default:
			return assertNever(msg);
	}
}

/** The float's flight onto a row (or fading with none), ending the carry; `later`: onto what the next drawing puts there (a field opened, a section moved). */
function fly(to: string | null, later = false): Command<BlockMsg> {
	return later ? { kind: "fly", to, later, done: carryMsg({ kind: "landed" }) } : { kind: "fly", to, done: carryMsg({ kind: "landed" }) };
}

/** Where the plus stands (`data-n-anchor`): its float flies back there, and its ring stands there while it is carried. */
export const PLUS_ANCHOR = "plus";

/** The lists pinned no more, unless a closing layer still holds them (P6). */
function unpinned(model: BlockModel): BlockModel["pinned"] {
	return model.layers.some((layer) => layer.closing) ? model.pinned : null;
}

/** The plus carried (the old screen's `beginNew`): a new task over the same places as a card, its ring standing in for the plus. */
function liftedPlus(model: BlockModel, at: { readonly x: number; readonly y: number }, box: CarryModel["box"]): Step {
	if (model.carry || model.entry?.state) return [model, []];
	const carry: CarryModel = {
		kind: "plus",
		ring: false,
		section: null,
		id: PLUS_ANCHOR,
		ids: [],
		rows: [],
		folded: [],
		origins: ["new"],
		cards: [],
		grab: { dx: at.x - box.left, dy: at.y - box.top },
		box,
		geometry: null,
		target: null,
		phase: "carried",
		lands: null,
	};
	return [{ ...model, carry, pinned: model.pinned ?? currentLists(model) }, [{ kind: "haptic" }, { kind: "measureCarry", measured: (geometry) => carryMsg({ kind: "measured", geometry }) }]];
}

/** A section's own rows: its header, then everything up to the next header (its cards, its plate). */
function sectionRows(list: ListModel, head: string): readonly string[] {
	const at = list.rows.findIndex((row) => row.key === head);
	if (at < 0) return [];
	const next = list.rows.findIndex((row, i) => i > at && row.kind === "head");
	return list.rows.slice(at, next < 0 ? undefined : next).map((row) => row.key);
}

/** A section lifted by its header (the old screen's `GroupDrag`): its rows leave the pinned lists, the list closing over them. */
function liftedSection(model: BlockModel, key: string, at: { readonly x: number; readonly y: number }, box: CarryModel["box"]): Step {
	if (model.carry) return [model, []];
	const lists = currentLists(model);
	if (lists.kind !== "rows") return [model, []];
	const row = lists.rows.find((r) => r.list.rows.some((x) => x.key === key));
	const head = row?.list.rows.find((x) => x.key === key);
	if (!row || !head || head.kind !== "head" || !head.reorder || row.sectionList === null) return [model, []];
	const heads = row.list.rows.flatMap((x) => (x.kind === "head" ? [x] : []));
	const lifted = heads.findIndex((x) => x.key === key);
	const carry: CarryModel = {
		kind: "section",
		ring: false,
		section: { column: row.column, list: row.sectionList, head: key, group: head.group, name: head.name, count: head.count, groups: heads.map((x) => x.group), heads: heads.map((x) => x.key), lifted, gap: lifted },
		id: key,
		ids: [],
		rows: [],
		folded: [],
		origins: [],
		cards: [],
		grab: { dx: at.x - box.left, dy: at.y - box.top },
		box,
		geometry: null,
		target: null,
		phase: "carried",
		lands: null,
	};
	return [{ ...model, carry, pinned: without(lists, new Set(sectionRows(row.list, key))) }, [{ kind: "haptic" }, { kind: "measureCarry", measured: (geometry) => carryMsg({ kind: "measured", geometry }) }]];
}

/** A section named in a writing call: by its id (`SectionRef`, decision 1), No section as it is. */
function sectionArg(section: SectionCarry, index: number): unknown {
	const head = section.heads[index];
	return section.groups[index] === null || head === undefined ? null : { sectionRef: head.slice("head:".length) };
}

/** A section let go: on a slot of another place, moved there as the core says (`moveGroup`); on its own, back. */
function droppedSection(model: BlockModel, carry: CarryModel): Step {
	const section = carry.section;
	if (!section) return updateCarry(model, { kind: "cancel" });
	const place = groupPlaceOf(section.groups, section.lifted, section.gap);
	if (place === null) return updateCarry(model, { kind: "cancel" });
	const before = place === "end" ? "end" : { before: sectionArg(section, section.groups.indexOf(place.before)) };
	const move: Command<BlockMsg> = { kind: "door", method: "tasks.moveGroup", args: [section.list, sectionArg(section, section.lifted), before], reply: (o) => (o.answer.ok ? null : failed(o.answer.error)) };
	return [{ ...model, carry: { ...carry, phase: "landing", lands: section.head }, pinned: unpinned(model) }, [move, { kind: "haptic" }, fly(section.head, true)]];
}

/** The plus let go: on a place the field of a new task opens there in the same tap, the plus landing in it; on its ring or nowhere, back. */
function droppedPlus(model: BlockModel, carry: CarryModel): Step {
	const drop = carry.ring ? null : (carry.target?.drop ?? null);
	if (!drop) return updateCarry(model, { kind: "cancel" });
	const freed: BlockModel = { ...model, carry: { ...carry, phase: "landing", target: null }, pinned: unpinned(model) };
	const [opened, commands] =
		drop.kind === "projects"
			? updateEntry(freed, { kind: "atPlace", column: "projects", place: drop.place })
			: drop.place === null
				? updateEntry(freed, { kind: "atEnd", column: drop.column })
				: updateEntry(freed, { kind: "atDrop", column: drop.column, drop: { kind: "place", column: drop.column, place: drop.place } });
	const field = opened.entry?.field ?? null;
	return [{ ...opened, carry: opened.carry ? { ...opened.carry, lands: field } : null }, [...commands, { kind: "haptic" }, fly(field, true)]];
}

/** Let go: on a place, written as the core says, the float flying to the card where it lands; anywhere else, back home. */
function droppedNow(model: BlockModel): Step {
	const carry = model.carry;
	if (!carry || carry.phase !== "carried") return [model, []];
	if (carry.kind === "plus") return droppedPlus(model, carry);
	if (carry.kind === "section") return droppedSection(model, carry);
	const drop = carry.target?.drop ?? null;
	if (!drop) return updateCarry(model, { kind: "cancel" });
	const funnel = noteView(model);
	const node = funnel?.filter?.node ?? null;
	const write: Command<BlockMsg> =
		drop.kind === "list"
			? { kind: "door", method: "tasks.drop", args: [dropped(model, carry), { kind: "place", column: drop.column, place: drop.place }, today(model), node], reply: (o) => (o.answer.ok ? null : failed(o.answer.error)) }
			: { kind: "door", method: "tasks.dropInProjects", args: [carry.cards satisfies readonly ProjectsDrop[], drop.place, node ?? "all"], reply: (o) => (o.answer.ok ? null : failed(o.answer.error)) };
	const landing: BlockModel = { ...model, carry: { ...carry, phase: "landing", lands: carry.id, target: null }, pinned: model.layers.some((layer) => layer.closing) ? model.pinned : null };
	const [next, end] = ended(landing, "dropped");
	return [next, [write, ...end, { kind: "haptic" }, fly(carry.id)]];
}

/** A card tapped: picked while picking (Select tasks, or ⌘ on the desktop), the picked cards' menu on one of several picked, a fold on its counter, else its menu. */
function tapped(model: BlockModel, msg: Extract<CarryMsg, { kind: "tap" }>): Step {
	const select = model.select;
	const row = cardRowOf(currentLists(model), msg.key)?.row;
	if (!row) return [model, []];
	const picking = select?.selecting === true || (model.wide && msg.mod);
	if (picking) return canPick(row.from) ? updateSelect(model, { kind: "toggle", key: msg.key, run: false }) : [model, []];
	if (model.wide && msg.shift && (select?.picked.length ?? 0) > 0) return updateSelect(model, { kind: "toggle", key: msg.key, run: true });
	if (model.wide && select && select.picked.includes(msg.key) && select.picked.length > 1) return updateSelect(model, { kind: "actions" });
	const cleared = select && !select.selecting ? { ...model, select: null } : model;
	if (msg.act === "counter") return [cleared, [write("tasks.toggleCollapsed", [row.item.key], failed)]];
	return updateMenu(cleared, { kind: "opened", id: msg.key });
}

/**
 * New views under a carry (P6): the lists stay pinned, but a carried task gone from the file (Sync, another device) is
 * gone: its float fades and the carry ends, put back as let go nowhere. A carried task changed in place stays carried.
 */
export function carryFollows(model: BlockModel): Step {
	const carry = model.carry;
	if (!carry || carry.phase !== "carried") return [model, []];
	if (carry.ids.every((id) => taskById(model, id) !== null)) return [model, []];
	const [next, commands] = ended({ ...model, carry: { ...carry, phase: "gone", target: null } }, "nowhere");
	return [next, [...commands, fly(null)]];
}
