import { tokenPx } from "../design";
import { el, px } from "../dom";
import { menuGroup, placePanel } from "./MenuPanel";
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
		const copy = overlay.add(el(null, "div", "tc-lifted is-head"));
		el(copy, "span", "tc-group-name", opts.name);
		copy.style.left = px(rect.left);
		copy.style.top = px(rect.top);
		copy.style.width = px(rect.width);
		copy.style.height = px(rect.height);
		const panel = overlay.add(el(null, "div", "tc-panel"));
		const pick = (action: () => void) => () => {
			overlay.close();
			action();
		};
		menuGroup(panel, [
			{ label: "Rename", icon: "rename", onPick: pick(opts.onRename) },
			{ label: "Remove section", icon: "removeSection", onPick: pick(opts.onRemove) },
		]);
		placePanel(panel, rect, tokenPx(panel, "--tc-menu-gap"), window.innerHeight);
		overlay.show();
		return { close: () => overlay.close() };
	},
};
