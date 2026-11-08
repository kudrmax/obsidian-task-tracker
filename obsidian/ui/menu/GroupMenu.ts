import { tokenPx } from "../design";
import { el } from "../dom";
import { LiftedCopy } from "../kit/LiftedCopy";
import { Panel, Picks } from "../kit/Panel";
import { menuGroup, menuRoom, menuRow, placePanel } from "./MenuPanel";
import { Overlay } from "./Overlay";

export interface GroupMenuOptions {
	readonly name: string;
	/** None: the group can't be renamed, and the menu has no Rename. */
	readonly onRename?: () => void;
	/** None: the group can't be removed, and the menu has no Remove section. */
	readonly onRemove?: () => void;
}

/** The menu of a section's header, like a task's: the header stays as it is over the blur, the panel grows out under it. */
export const GroupMenu = {
	open(head: HTMLElement, opts: GroupMenuOptions): { close(): void } {
		const overlay = new Overlay(() => overlay.close());
		const rect = head.getBoundingClientRect();
		const copy = LiftedCopy.over(overlay, el(null, "div", "tc-lifted is-head"), false);
		el(copy.el, "span", "tc-group-name", opts.name);
		copy.pin(rect, { width: true, height: true });
		const panel = Panel.over(overlay, { root: "tc-panel", picks: new Picks(
                () => void overlay.close(),
                () => overlay.closed,
            ), place: (p) => placePanel(p, rect, tokenPx(p, "--tc-menu-gap"), menuRoom()) }, false);
		const { onRename, onRemove } = opts;
		panel.replace((p) =>
			menuGroup(p, [
				...(onRename ? [{ label: "Rename", icon: "rename", onPick: panel.pickNow(onRename) } as const] : []),
				...(onRemove ? [{ label: "Remove section", icon: "removeSection", onPick: panel.pick(onRemove) } as const] : []),
			]),
		);
		overlay.show();
		return { close: () => void overlay.close() };
	},
};

export interface ColumnMenuOptions {
	/** The column's title, as it stands over the column. */
	readonly title: string;
	/** The list shows its tasks grouped by project now: the row's check. */
	readonly grouped: boolean;
	onGroup(on: boolean): void;
}

/**
 * The menu of a column's title, Backlog's or Soon's, like a section header's: the title stays over the blur, the panel
 * under it holds one row, Group by project, checked while the list is grouped.
 */
export const ColumnMenu = {
	open(title: HTMLElement, opts: ColumnMenuOptions): { close(): void } {
		const overlay = new Overlay(() => overlay.close());
		const rect = title.getBoundingClientRect();
		const copy = LiftedCopy.over(overlay, el(null, "div", "tc-lifted is-title"), false);
		el(copy.el, "span", "tc-lifted-title", opts.title);
		copy.pin(rect, { width: true, height: true });
		const panel = Panel.over(overlay, { root: "tc-panel", picks: new Picks(
                () => void overlay.close(),
                () => overlay.closed,
            ), place: (p) => placePanel(p, rect, tokenPx(p, "--tc-menu-gap"), menuRoom()) }, false);
		panel.replace((p) => {
			const group = menuGroup(p, []);
			menuRow(group, { label: "Group by project", icon: opts.grouped ? "check" : undefined, choice: true, onPick: panel.pick(() => opts.onGroup(!opts.grouped)) });
			return group;
		});
		overlay.show();
		return { close: () => void overlay.close() };
	},
};
