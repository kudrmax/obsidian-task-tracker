import type { GroupName, MenuProject, MenuSections } from "../../../core/application/contracts";
import { PROPERTY } from "../design";
import { GroupNameField } from "../GroupNameField";
import { backRow, menuGroup, menuRow } from "./MenuPanel";

export interface SectionChooserSpec {
	readonly sections: MenuSections;
	onBack(): void;
	onPick(name: GroupName): void;
	/** New section, which asks for a name: drawn where the model offers it. */
	onNew?: () => void;
}

/** The Section submenu: the way back, the sections the model offers, the one they stand in checked, the tasks outside any, and New section. */
export function sectionChooser(panel: HTMLElement, spec: SectionChooserSpec): void {
	const { choice, options, create } = spec.sections;
	backRow(panel, "Section", () => spec.onBack());
	const group = menuGroup(panel, []);
	for (const { name, checked } of options)
		menuRow(group, { label: name ?? choice.ungrouped, icon: checked ? "check" : undefined, choice: true, quiet: name === null, onPick: () => spec.onPick(name) });
	const onNew = spec.onNew;
	if (create && onNew) menuRow(panel, { label: "New section", icon: "plus", apart: true, add: true, onPick: () => onNew() });
}

export interface ProjectChooserSpec {
	readonly project: MenuProject;
	onBack(): void;
	/** A project's name, null for No project. */
	onPick(name: string | null): void;
	/** «New project…», which asks for the name (`projectNamePage`). */
	onNew(): void;
}

/**
 * The Project page: the way back (none on the quick bar's panel, which is the page itself), the tree's projects in its
 * order, each a step further in per level, a check on each the tasks have, No project last; «New project…» apart under
 * them, as New section is.
 */
export function projectChooser(panel: HTMLElement, spec: ProjectChooserSpec & { readonly back?: boolean }): void {
	const { options, none, noneLabel, newLabel } = spec.project;
	if (spec.back !== false) backRow(panel, "Project", () => spec.onBack());
	const group = menuGroup(panel, []);
	for (const { project, checked, depth } of options) {
		const row = menuRow(group, { label: project.name, icon: checked ? "check" : undefined, choice: true, onPick: () => spec.onPick(project.name) });
		row.style.setProperty(PROPERTY.level, String(depth));
		row.classList.add("tc-project-option");
	}
	menuRow(group, { label: noneLabel, icon: none ? "check" : undefined, choice: true, quiet: true, onPick: () => spec.onPick(null) });
	menuRow(panel, { label: newLabel, icon: "plus", apart: true, add: true, cls: "tc-new-project", onPick: () => spec.onNew() });
}

export interface ProjectNameSpec {
	onBack(): void;
	/** The name as typed on Enter; null for Escape or a tap elsewhere. Called once. */
	onDone(name: string | null): void;
}

/** «New project…»'s page: the way back, then the name typed in a capsule ringed in the accent, the keyboard up, as a section's name is. */
export function projectNamePage(panel: HTMLElement, spec: ProjectNameSpec): HTMLElement {
	backRow(panel, "New project", () => spec.onBack());
	const holder = menuGroup(panel, []);
	holder.classList.add("tc-project-name");
	return GroupNameField.open(holder, { value: "", placeholder: "Project name", onDone: (name) => spec.onDone(name) });
}
