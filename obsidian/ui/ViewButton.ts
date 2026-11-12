import type { ViewChoice, ViewMode } from "../../core/application/contracts";
import { Button } from "./kit/Button";
import type { IconName } from "./kit/icons";
import { ViewMenu } from "./menu/ViewMenu";

/** The core's icon of a mode (a Lucide name) as the design draws it. */
const ICON_OF: Readonly<Record<string, IconName>> = { "columns-2": "columns2", "columns-4": "columns4", "rows-3": "rows", "folder-tree": "byProject" };

/**
 * The view button in the bottom row (board V1): a round button like the plus wearing the current mode's icon, beside the
 * wheel or alone in its place; a tap opens the modes the core offers.
 */
export class ViewButton {
	private readonly button: Button;
	private view: ViewChoice | null = null;

	constructor(parent: HTMLElement, onPick: (mode: ViewMode) => void) {
		this.button = Button.create(parent, {
			kind: "round",
			tone: "plain",
			label: "View",
			icon: "columns2",
			cls: "tc-view-btn",
			onPress: () => {
				const view = this.view;
				if (view) ViewMenu.open({ anchor: this.button.el, modes: view.modes, onPick });
			},
		});
	}

	get el(): HTMLElement {
		return this.button.el;
	}

	render(view: ViewChoice | null): void {
		const icon = view ? ICON_OF[view.icon] : undefined;
		if (icon && view?.icon !== this.view?.icon) this.button.setIcon(icon);
		this.view = view;
		this.button.el.classList.toggle("tc-hidden", view === null);
	}
}
