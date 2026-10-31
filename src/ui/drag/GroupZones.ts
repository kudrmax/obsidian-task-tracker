import type { GroupedList } from "../../application/contracts";
import { clear, el } from "../dom";
import { icon, type IconName } from "../icons";
import type { DropResult, DropTarget } from "./DropTarget";

export interface GroupZonesDeps {
	/** The presets from the settings, in their order. */
	presets(): readonly string[];
	/** The sections the list shows now. */
	present(): readonly string[];
	/** Whether the column shows sections at all: the day column only on today. */
	offered(): boolean;
}

/** One zone as a place to drop: a preset names the section; New section asks for the name. */
class GroupDrop implements DropTarget {
	constructor(
		readonly zone: HTMLElement,
		private readonly list: GroupedList,
		private readonly name: string | null,
	) {}

	hitTest(x: number, y: number): boolean {
		if (this.zone.hidden) return false;
		const r = this.zone.getBoundingClientRect();
		return r.width > 0 && x >= r.left && x < r.right && y >= r.top && y < r.bottom;
	}

	preview(): void {
		this.zone.classList.add("is-hot");
	}

	/** Into a preset the card goes; for New section it goes back to its place, and the list asks for the name. */
	landing(): DOMRect | null {
		return this.name === null ? null : this.zone.getBoundingClientRect();
	}

	clear(): void {
		this.zone.classList.remove("is-hot");
	}

	drop(): DropResult {
		return this.name === null ? { kind: "nameGroup", list: this.list } : { kind: "newGroup", list: this.list, name: this.name };
	}
}

/**
 * The zones that start a section, under a list while a card is dragged (sections spec §5.2): the presets the list lacks,
 * in the settings' order, then New section. Under the day column they stand over the zones that put a task off.
 */
export class GroupZones {
	private readonly box: HTMLElement;
	private drops: GroupDrop[] = [];

	constructor(
		parent: HTMLElement,
		private readonly list: GroupedList,
		private readonly deps: GroupZonesDeps,
	) {
		this.box = el(parent, "div", "tc-section-zones");
	}

	get targets(): readonly DropTarget[] {
		return this.drops;
	}

	/** Offers the zones for the list as it is now; called as a card is lifted. */
	show(): void {
		clear(this.box);
		this.drops = [];
		const offered = this.deps.offered();
		this.box.classList.toggle("is-offered", offered);
		if (!offered) return;
		const present = new Set(this.deps.present());
		for (const name of usablePresets(this.deps.presets())) {
			if (!present.has(name)) this.drops.push(new GroupDrop(this.zone("section", name), this.list, name));
		}
		this.drops.push(new GroupDrop(this.zone("plus", "New section"), this.list, null));
	}

	private zone(iconName: IconName, label: string): HTMLElement {
		const zone = el(this.box, "div", "tc-zone");
		zone.appendChild(icon(iconName));
		el(zone, "span", "tc-zone-label", label);
		return zone;
	}
}

/** Presets that can name a section: not blank, the first of two alike. */
function usablePresets(presets: readonly string[]): string[] {
	const trimmed = presets.map((p) => p.trim());
	return trimmed.filter((p, i) => p !== "" && trimmed.indexOf(p) === i);
}
