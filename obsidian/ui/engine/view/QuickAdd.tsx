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
	const open = useScreen((s) => s.entry !== null);
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
 * The field a task is typed in, new or renamed (spec, «Text fields»: Obsidian's own editor; the plugin's one quick entry):
 * a new task's stands in its list where it will be written, at its level; a rename's is the card itself, its title in it,
 * the caret at the end, the dot of a task in progress kept. Both have the bar. Enter, Escape, Tab and Shift+Tab and a tap
 * elsewhere go to the store, which asks the port what they do.
 */
export const EntryField = memo(function EntryField({ depth, className = "" }: { readonly depth?: number; readonly className?: string }) {
	const api = useScreenApi();
	const { setField } = useField();
	/** The field takes the colour of the level set on the bar or typed as a prefix (the port's `tint`). */
	const tint = useScreen((s) => (s.entry ? s.entryBar(s.entry, s.draft, s.entryText).tint : null));
	const renaming = useScreen((s) => s.entry?.renaming ?? null);
	const inProgress = useScreen((s) => (renaming ? (s.shown.cards[renaming]?.inProgress ?? false) : false));
	/** A field opened again elsewhere (its place changed on the bar) keeps what was typed; a rename opens with the title. */
	const [typed] = useState(() => api.getState().entryText);
	const commitOnLeave = (event: FocusEvent<HTMLDivElement>, text: () => string) => {
		const to = event.relatedTarget as Element | null;
		/** The bar, or the same field opened again at its new place, keeps the typing going. */
		if (event.currentTarget.contains(to) || to?.closest?.(".tc-quick-bar, .tc-quick-panel, .tc-quick-field")) return;
		api.getState().commitEntry(text(), false);
	};
	return (
		<div ref={setField} className={`tc-quick-row tc-entry ${className}`.trim()} data-renaming={renaming ?? undefined} style={depth === undefined ? undefined : ({ [PROPERTY.level]: String(depth) } as CSSProperties)}>
			{inProgress ? <span className="tc-progress-dot" /> : null}
			<ObsidianEditor
				text={typed}
				className="tc-quick-field tc-title-field"
				placeholder={renaming ? undefined : "New task"}
				priority={tint}
				onChange={(text) => api.getState().typeEntry(text)}
				onEnter={(text) => api.getState().commitEntry(text, true)}
				onEscape={() => api.getState().escapeEntry()}
				onTab={(shift) => api.getState().indentEntry(shift ? -1 : 1)}
				onLeave={commitOnLeave}
			/>
		</div>
	);
});
