import type { GroupName, MenuProject, MenuSections } from "../../../core/application/contracts";
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
	/** A project's link, null for No project. */
	onPick(link: string | null): void;
}

/** The Project page: the way back, the projects the model offers by name, the one the tasks have checked, No project last. */
export function projectChooser(panel: HTMLElement, spec: ProjectChooserSpec): void {
	const { options, none } = spec.project;
	backRow(panel, "Project", () => spec.onBack());
	const group = menuGroup(panel, []);
	for (const { project, checked } of options) menuRow(group, { label: project.name, icon: checked ? "check" : undefined, choice: true, onPick: () => spec.onPick(project.link) });
	menuRow(group, { label: "No project", icon: none ? "check" : undefined, choice: true, quiet: true, onPick: () => spec.onPick(null) });
}
