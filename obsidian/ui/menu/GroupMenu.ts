import { tokenPx } from "../design";
import { el } from "../dom";
import { LiftedCopy } from "../kit/LiftedCopy";
import { Panel } from "../kit/Panel";
import { askQuestion, menuGroup, menuRoom, placePanel } from "./MenuPanel";
import type { ProjectDelete } from "../../../core/application/contracts";
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
		const overlay = new Overlay(() => void overlay.close(), head);
		const rect = head.getBoundingClientRect();
		const copy = LiftedCopy.over(overlay, el(null, "div", "tc-lifted is-head"), false);
		el(copy.el, "span", "tc-group-name", opts.name);
		copy.pin(rect, { width: true, height: true });
		const panel = Panel.over(overlay, { root: "tc-panel", place: (p) => placePanel(p, rect, tokenPx(p, "--tc-menu-gap"), menuRoom()) }, false);
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

export interface ProjectMenuOptions {
	/** The project's name, as it stands over its tasks. */
	readonly title: string;
	readonly renameLabel: string;
	/** The attached note's name; null without one. */
	readonly note: string | null;
	readonly attachLabel: string;
	readonly detachLabel: string;
	/** Delete project: its row and the question asked before it. */
	readonly delete: ProjectDelete;
	onRename(): void;
	onAttach(): void;
	onOpenNote(): void;
	onDetach(): void;
	/** Delete project, confirmed. */
	onDelete(): void;
}

/**
 * The project's menu, a tap on the chosen project's name over its tasks, as a section header's: the title stays over the
 * blur, the panel under it holds Rename, then the note: «Attach note…» without one; with one, the note's name, which opens
 * it, and Detach, which takes the link off and leaves the file. Apart at its foot, Delete project in the danger colour,
 * which asks first in its own place, as a task's Delete does.
 */
export const ProjectMenu = {
	open(title: HTMLElement, opts: ProjectMenuOptions): { close(): void } {
		const overlay = new Overlay(() => void overlay.close(), title);
		const rect = title.getBoundingClientRect();
		const copy = LiftedCopy.over(overlay, el(null, "div", "tc-lifted is-title is-project-title"), false);
		el(copy.el, "span", "tc-lifted-title", opts.title);
		copy.pin(rect, { width: true, height: true });
		const panel = Panel.over(overlay, { root: "tc-panel", place: (p) => placePanel(p, rect, tokenPx(p, "--tc-menu-gap"), menuRoom()) }, false);
		const remove = opts.delete;
		/** The menu, with Delete project apart at its foot; asking, the question takes that row's place. */
		const show = (asking: boolean) =>
			panel.replace((p) => {
				const rows = [{ label: opts.renameLabel, icon: "rename", onPick: panel.pickNow(() => opts.onRename()) } as const];
				const note =
					opts.note === null
						? [{ label: opts.attachLabel, icon: "plus", onPick: panel.pickNow(() => opts.onAttach()) } as const]
						: [
								{ label: opts.note, icon: "openFile", onPick: panel.pick(() => opts.onOpenNote()) } as const,
								{ label: opts.detachLabel, icon: "cross", onPick: panel.pick(() => opts.onDetach()) } as const,
							];
				menuGroup(p, [...rows, ...note]);
				if (!asking) return void menuGroup(p, [{ label: remove.label, icon: "delete", danger: remove.destructive, onPick: () => show(true) }]);
				askQuestion(p, {
					question: remove.title,
					message: remove.message,
					cancel: remove.cancel,
					confirm: remove.confirm,
					icon: "delete",
					danger: remove.destructive,
					onCancel: () => show(false),
					onConfirm: panel.pick(() => opts.onDelete()),
				});
			});
		show(false);
		overlay.show();
		return { close: () => void overlay.close() };
	},
};
