import { type ColumnList, fitLevel, type GapPlace, type GroupName, type ListCard, type ListPlace, placeOfDrop, placeOfGap } from "../../core/application/contracts";
import type { Destination } from "../ui/engine/port";

/**
 * A column's cards as the core's nesting rules read them (`ListCard`: a level, a section, a key), and the gap a
 * `Destination` names among them. The engine names a place by the card it goes before, its depth and its section's id; the
 * core by the gap's index, level and section's name. The level is fitted by the core's `fitLevel` (pair E7).
 */
export class ListCards {
	readonly cards: readonly ListCard[];
	private readonly sectionNames: ReadonlyMap<string, GroupName>;
	private readonly sectionIds: ReadonlyMap<GroupName, string>;
	/** Where each section's cards end among all the cards: its end's gap. */
	private readonly ends: ReadonlyMap<GroupName, number>;
	private readonly lastGroup: GroupName;
	/** Where the card left out stood among the others: letting it go there changes nothing. */
	private readonly home: GapPlace | null = null;

	constructor(column: ColumnList, without: string | null = null) {
		const cards: ListCard[] = [];
		const names = new Map<string, GroupName>();
		const ids = new Map<GroupName, string>();
		const ends = new Map<GroupName, number>();
		for (const group of column.groups) {
			names.set(group.id, group.name);
			ids.set(group.name, group.id);
			let skipBelow: number | null = null;
			for (const { item, level } of group.rows) {
				if (skipBelow !== null && level > skipBelow) continue;
				skipBelow = null;
				if (item.id === without) {
					this.home = { kind: "gap", index: cards.length, level, group: group.name };
					skipBelow = level;
					continue;
				}
				cards.push({ level, group: group.name, key: item.key, id: item.id });
			}
			ends.set(group.name, cards.length);
		}
		this.cards = cards;
		this.sectionNames = names;
		this.sectionIds = ids;
		this.ends = ends;
		this.lastGroup = column.groups.length ? column.groups[column.groups.length - 1].name : null;
	}

	/** The gap `to` names: before its card (its level by default), else the end of its section or of the last one; the level fitted. */
	gapOf(to: Pick<Destination, "before" | "depth" | "section">): GapPlace {
		const at = to.before === null ? -1 : this.cards.findIndex((card) => card.id === to.before);
		if (at >= 0) return fitLevel(this.cards, { kind: "gap", index: at, level: to.depth ?? this.cards[at].level, group: this.cards[at].group });
		const group = to.section === undefined || to.section === null || !this.sectionNames.has(to.section) ? (to.section === null ? null : this.lastGroup) : this.sectionNames.get(to.section)!;
		return fitLevel(this.cards, { kind: "gap", index: this.ends.get(group) ?? this.cards.length, level: to.depth ?? 0, group });
	}

	/** What the gap means for the file (`placeOfGap`). */
	placeOf(to: Pick<Destination, "before" | "depth" | "section">): ListPlace {
		return placeOfGap(this.cards, this.gapOf(to));
	}

	/** What letting the card left out go at `to` means (`placeOfDrop`): null where it was lifted from, which changes nothing. */
	dropOf(to: Pick<Destination, "before" | "depth" | "section">): ListPlace | null {
		return placeOfDrop(this.cards, this.gapOf(to), this.home);
	}

	/** The engine's words for a gap: the card it stands before, its depth, its section's id (null: outside any). */
	destinationOf(gap: GapPlace): Pick<Destination, "before" | "depth" | "section"> {
		return { before: this.cards[gap.index]?.id ?? null, depth: gap.level, section: gap.group === null ? null : (this.sectionIds.get(gap.group) ?? null) };
	}
}
