import { memo, type FocusEvent, type CSSProperties } from "react";
import { PROPERTY } from "../../design";
import { CarriedPlus } from "../drag/Drag";
import { useScreen, useScreenApi } from "../store";
import { Icon } from "./Icon";
import { ObsidianEditor } from "./ObsidianEditor";

/**
 * The plus: a tap opens the new task's field at the port's place for new tasks (while the field is open, a tap closes it);
 * carried, it opens the field where it is let go (`CarriedPlus`, the drag owner's).
 */
export const PlusButton = memo(function PlusButton() {
	const api = useScreenApi();
	const open = useScreen((s) => s.entry !== null);
	const inList = useScreen((s) => s.plusAt !== null);
	if (inList) return RING;
	return (
		<CarriedPlus onTap={() => api.getState().openEntry(open ? null : undefined)} ring={RING}>
			<Icon name={open ? "cross" : "plus"} />
		</CarriedPlus>
	);
});

/** The plus's place while it is carried: a dashed ring. */
const RING = (
	<div className="tc-btn is-round tc-plus-ring">
		<Icon name="plus" />
	</div>
);

/**
 * The new task's field, standing in its list where the task will be written, at its level (spec, «Text fields»: Obsidian's
 * own editor). Enter writes the task and opens an empty field under it; Enter on an empty field ends typing; Tab and
 * Shift+Tab make it a subtask of the task above or take it back out; Escape closes it unwritten; a tap elsewhere writes
 * what was typed and closes it.
 */
export const EntryField = memo(function EntryField({ depth }: { readonly depth: number }) {
	const api = useScreenApi();
	const commitOnLeave = (event: FocusEvent<HTMLDivElement>, text: () => string) => {
		if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
		void api.getState().commitEntry(text(), false);
	};
	return (
		<div className="tc-quick-row tc-entry" style={{ [PROPERTY.level]: String(depth) } as CSSProperties}>
			<ObsidianEditor
				text=""
				className="tc-quick-field"
				onEnter={(text) => void api.getState().commitEntry(text, true)}
				onEscape={() => api.getState().openEntry(null)}
				onTab={(shift) => api.getState().indentEntry(shift ? -1 : 1)}
				onLeave={commitOnLeave}
			/>
		</div>
	);
});
