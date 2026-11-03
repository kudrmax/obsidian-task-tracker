import type { GroupName } from "../../application/contracts";
import { backRow, menuGroup, menuRow } from "./MenuPanel";

/** Where in its list's sections a task can go: a list card's menu has them; a subtask, a timeline card or a done task none. */
export interface SectionChoice {
	/** The sections the list has, in its order, then the presets it lacks, in the settings' order. */
	readonly names: readonly string[];
	readonly current: GroupName;
	/** The name of the tasks outside any section. */
	readonly ungrouped: string;
}

export interface SectionChooserSpec {
	readonly choice: SectionChoice;
	/** The section that carries the check. */
	checked(name: GroupName): boolean;
	onBack(): void;
	onPick(name: GroupName): void;
	/** New section, which asks for a name; without it the submenu has none. */
	onNew?: () => void;
}

/** The Section submenu: the way back, the sections, one checked, the tasks outside any, and New section. */
export function sectionChooser(panel: HTMLElement, spec: SectionChooserSpec): void {
	backRow(panel, "Section", () => spec.onBack());
	const group = menuGroup(panel, []);
	const row = (name: GroupName, label: string, quiet: boolean) =>
		menuRow(group, { label, icon: spec.checked(name) ? "check" : undefined, choice: true, quiet, onPick: () => spec.onPick(name) });
	for (const name of spec.choice.names) row(name, name, false);
	row(null, spec.choice.ungrouped, true);
	const onNew = spec.onNew;
	if (onNew) menuRow(panel, { label: "New section", icon: "plus", size: "tall", apart: true, add: true, onPick: () => onNew() });
}
