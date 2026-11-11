import { clear, el } from "../dom";
import { Button } from "../kit/Button";
import type { ProjectsMode, ProjectsView } from "./projectsView";

/** By project / By stage over the tasks: two halves of one track, the chosen one filled. */
export class ProjectsSegment {
	readonly el: HTMLElement;

	constructor(
		parent: HTMLElement,
		private readonly onMode: (mode: ProjectsMode) => void,
	) {
		this.el = el(parent, "div", "tc-projects-seg");
		this.el.setAttribute("role", "radiogroup");
		this.el.setAttribute("aria-label", "Group tasks");
	}

	render(view: Pick<ProjectsView, "mode" | "modes">): void {
		clear(this.el);
		for (const { mode, label } of view.modes) {
			const on = mode === view.mode;
			const button = Button.create(this.el, { kind: "pill", label, cls: "tc-projects-seg-btn", onPress: () => on || this.onMode(mode) });
			button.setOn(on);
			button.el.setAttribute("role", "radio");
			button.el.setAttribute("aria-checked", String(on));
		}
	}
}
