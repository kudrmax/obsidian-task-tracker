import { memo, type FocusEvent, type CSSProperties, useState } from "react";
import { PROPERTY } from "../../design";
import { CarriedPlus } from "../drag/Drag";
import { useScreen, useScreenApi } from "../store";
import { Icon } from "./Icon";
import { ObsidianEditor } from "./ObsidianEditor";
import { useField } from "../layers/Layers";
import type { ListId } from "../port";

/**
 * The plus (F174, the design's «Плюс»): a tap opens the new task's field at the port's place for new tasks, for the lists
 * `shown` on the screen; carried, it opens the field where it is let go (`CarriedPlus`, the drag owner's). While a field
 * is open it fades away, as the plugin's does.
 */
export const PlusButton = memo(function PlusButton({ shown }: { readonly shown: readonly ListId[] }) {
	const api = useScreenApi();
	const open = useScreen((s) => s.entry !== null || s.renaming !== null);
	const inList = useScreen((s) => s.plusAt !== null);
	if (inList) return RING;
	return (
		<CarriedPlus onTap={() => api.getState().plusTap(shown)} ring={RING} hidden={open}>
			<Icon name="plus" />
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
	const { setField } = useField();
	/** The field takes the colour of the level set on the bar or typed as a prefix (the port's `tint`). */
	const tint = useScreen((s) => (s.entry ? s.entryBar(s.entry, s.draft, s.entryText).tint : null));
	/** A field opened again elsewhere (its place changed on the bar) keeps what was typed. */
	const [typed] = useState(() => api.getState().entryText);
	const commitOnLeave = (event: FocusEvent<HTMLDivElement>, text: () => string) => {
		const to = event.relatedTarget as Element | null;
		/** The bar, or the same field opened again at its new place, keeps the typing going. */
		if (event.currentTarget.contains(to) || to?.closest?.(".tc-quick-bar, .tc-quick-field")) return;
		void api.getState().commitEntry(text(), false);
	};
	return (
		<div ref={setField} className="tc-quick-row tc-entry" style={{ [PROPERTY.level]: String(depth) } as CSSProperties}>
			<ObsidianEditor
				text={typed}
				className="tc-quick-field tc-title-field"
				placeholder="New task"
				priority={tint}
				onChange={(text) => api.getState().typeEntry(text)}
				onEnter={(text) => void api.getState().commitEntry(text, true)}
				onEscape={() => api.getState().openEntry(null)}
				onTab={(shift) => api.getState().indentEntry(shift ? -1 : 1)}
				onLeave={commitOnLeave}
			/>
		</div>
	);
});
