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
 * the caret at the end, the dot of a task in progress kept. Both have the bar. Description on the bar opens a second line
 * under the title (task actions spec, Decision 101); Enter in either line or a tap away from both writes both. Enter,
 * Escape, Tab and Shift+Tab and a tap elsewhere go to the store, which asks the port what they do.
 */
export const EntryField = memo(function EntryField({ depth, className = "" }: { readonly depth?: number; readonly className?: string }) {
	const api = useScreenApi();
	const { setField } = useField();
	/** The field takes the colour of the level set on the bar or typed as a prefix (the port's `tint`). */
	const tint = useScreen((s) => (s.entry ? s.entryBar(s.entry, s.draft, s.entryText).tint : null));
	const renaming = useScreen((s) => s.entry?.renaming ?? null);
	const inProgress = useScreen((s) => (renaming ? (s.shown.cards[renaming]?.inProgress ?? false) : false));
	const describing = useScreen((s) => s.draft.descriptionLine !== null);
	const section = useScreen((s) => s.draft.section);
	const commitOnLeave = (event: FocusEvent<HTMLDivElement>, text: () => string) => {
		const to = event.relatedTarget as Element | null;
		/** The bar, the other line, or the same field opened again at its new place, keeps the typing going. */
		if (event.currentTarget.contains(to) || to?.closest?.(".tc-quick-bar, .tc-quick-panel, .tc-quick-field")) return;
		api.getState().commitEntry(text(), false);
	};
	return (
		<div ref={setField} className={`tc-quick-row tc-entry ${className}`.trim()} data-renaming={renaming ?? undefined} data-priority={describing ? (tint ?? undefined) : undefined} style={depth === undefined ? undefined : ({ [PROPERTY.level]: String(depth) } as CSSProperties)}>
			{inProgress ? <span className="tc-progress-dot" /> : null}
			{/* New section changes what the field writes: it opens again, its text kept, with the section's placeholder and weight. */}
			<ObsidianEditor
				key={section ? "section" : "task"}
				text={api.getState().entryText}
				className={`tc-quick-field tc-title-field${section ? " is-section" : ""}`}
				placeholder={renaming ? undefined : section ? "New section" : "New task"}
				priority={tint}
				onChange={(text) => api.getState().typeEntry(text)}
				onEnter={(text) => api.getState().commitEntry(text, true)}
				onEscape={() => api.getState().escapeEntry()}
				onTab={(shift) => api.getState().indentEntry(shift ? -1 : 1)}
				onLeave={commitOnLeave}
			/>
			{describing ? <DescriptionLine onLeave={commitOnLeave} /> : null}
		</div>
	);
});

/** The description's line under the title (the core's `openDescription`): it opens with the caret in it, holding what the port gave. */
function DescriptionLine({ onLeave }: { readonly onLeave: (event: FocusEvent<HTMLDivElement>, text: () => string) => void }) {
	const api = useScreenApi();
	const [text] = useState(() => api.getState().draft.descriptionLine ?? "");
	const title = () => api.getState().entryText;
	return (
		<ObsidianEditor
			text={text}
			className="tc-quick-field tc-title-field tc-desc-field"
			placeholder="Description"
			onChange={(typed) => api.getState().typeDescription(typed)}
			onEnter={() => api.getState().commitEntry(title(), true)}
			onEscape={() => api.getState().escapeEntry()}
			onLeave={(event) => onLeave(event, title)}
		/>
	);
}
