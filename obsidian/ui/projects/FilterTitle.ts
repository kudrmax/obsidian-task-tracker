import type { ProjectFilter } from "../../../core/application/contracts";
import { el } from "../dom";
import { GroupNameField } from "../GroupNameField";
import { Button } from "../kit/Button";

export interface FilterTitleDeps {
	/** The title tapped, its node a project: the project's menu over it. */
	onMenu(title: HTMLElement, filter: ProjectFilter): void;
	/** The cross: no node chosen (`TaskService.clearProjectFilter`). */
	onClear(): void;
}

/**
 * The chosen node over the tasks (boards T3, D2): its name big beside the projects button, or right of the docked panel,
 * and the cross that clears it. None without a filter.
 */
export class FilterTitle {
	readonly el: HTMLElement;
	private readonly title: HTMLElement;
	private readonly cross: Button;
	private filter: ProjectFilter | null = null;

	constructor(parent: HTMLElement, deps: FilterTitleDeps) {
		this.el = el(parent, "div", "tc-filter");
		this.title = el(this.el, "div", "tc-filter-title");
		this.title.addEventListener("click", () => {
			if (this.filter?.menu) deps.onMenu(this.title, this.filter);
		});
		this.cross = Button.create(this.el, { kind: "icon", tone: "quiet", label: "Clear project", icon: "cross", cls: "tc-filter-clear", onPress: () => deps.onClear() });
		this.render(null);
	}

	/** The title element the project's menu copies over its blur. */
	get titleEl(): HTMLElement {
		return this.title;
	}

	render(filter: ProjectFilter | null): void {
		this.filter = filter;
		this.el.classList.toggle("tc-hidden", filter === null);
		this.title.textContent = filter?.title ?? "";
		this.title.classList.toggle("has-menu", filter?.menu != null);
		this.cross.setHidden(!filter?.clearable);
	}

	/** Rename: the name typed where the title stands, the caret at its end; Enter gives the name, anything else null. */
	editTitle(onDone: (name: string | null) => void): void {
		const name = this.title.textContent ?? "";
		this.el.classList.add("is-renaming");
		const slot = el(this.el.parentElement, "div", "tc-filter-field");
		GroupNameField.open(slot, {
			value: name,
			onDone: (to) => {
				slot.remove();
				this.el.classList.remove("is-renaming");
				onDone(to);
			},
		});
	}
}
