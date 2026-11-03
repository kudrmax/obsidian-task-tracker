import { tokenPx } from "../design";
import { el } from "../dom";
import { LiftedCopy } from "../kit/LiftedCopy";
import { Panel, Picks } from "../kit/Panel";
import { menuGroup, menuRoom, placePanel } from "./MenuPanel";
import { Overlay } from "./Overlay";

export interface GroupMenuOptions {
	readonly name: string;
	onRename(): void;
	onRemove(): void;
}

/** The menu of a section's header, like a task's: the header stays as it is over the blur, the panel grows out under it. */
export const GroupMenu = {
	open(head: HTMLElement, opts: GroupMenuOptions): { close(): void } {
		const overlay = new Overlay(() => overlay.close());
		const rect = head.getBoundingClientRect();
		const copy = LiftedCopy.over(overlay, el(null, "div", "tc-lifted is-head"), false);
		el(copy.el, "span", "tc-group-name", opts.name);
		copy.pin(rect, { width: true, height: true });
		const panel = Panel.over(overlay, { root: "tc-panel", picks: new Picks(() => overlay.close()), place: (p) => placePanel(p, rect, tokenPx(p, "--tc-menu-gap"), menuRoom()) }, false);
		panel.replace((p) =>
			menuGroup(p, [
				{ label: "Rename", icon: "rename", onPick: panel.pick(opts.onRename) },
				{ label: "Remove section", icon: "removeSection", onPick: panel.pick(opts.onRemove) },
			]),
		);
		overlay.show();
		return { close: () => overlay.close() };
	},
};
