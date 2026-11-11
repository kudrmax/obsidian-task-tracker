import type { ProjectsSection, ProjectsView } from "../../core/application/contracts";

/** The Projects screen's view with `sections` as the chosen node's tasks, and nothing else of note. */
export function projectsView(sections: readonly ProjectsSection[], extra: Partial<ProjectsView> = {}): ProjectsView {
	return { rows: [], selected: "all", mode: "byProject", modes: [], title: "All", menu: null, sections, newTask: null, emptyLabel: "No tasks", missing: false, reorders: true, ...extra };
}
