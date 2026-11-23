import { type CSSProperties, type FocusEvent, memo, type ReactNode, useRef } from "react";
import { PROPERTY } from "../../shared/design";
import { Sheet, useMenuFrom } from "../layers/Layers";
import type { FullRow, FullTask } from "../port";
import { useScreen, useScreenApi } from "../store";
import { CardFace } from "./Card";
import { useHost } from "./host";
import { Icon } from "./Icon";
import { ObsidianEditor } from "./ObsidianEditor";
import { EntryField } from "./QuickAdd";

/** Something typed in: an editor's own element. */
const typesIn = (el: EventTarget | null): boolean => el instanceof HTMLElement && el.isContentEditable;

/**
 * One task over the whole screen, to do it with nothing else in sight (F239–F249; the design's «Задача на весь экран»):
 * Close and, while something is typed, Done on top; the task it lies in over its title (a level up), the title, its first
 * project, every subtask as a tree with a circle that ticks it done and leaves it struck in place, its notes in
 * Obsidian's own editor; at the bottom Undo, «⋯» (its own menu) and the plus (a new last subtask). On the Mac the
 * content stands in a centred column. It draws what the port reads; every tap goes to the store.
 */
export const FullScreen = memo(function FullScreen() {
	const api = useScreenApi();
	const full = useScreen((s) => s.full);
	const escapes = useScreen((s) => s.layer === null && s.entry === null && !s.fullTyping);
	const typing = useScreen((s) => s.fullTyping);
	/** Drawn as it was while it fades out. */
	const last = useRef(full);
	if (full) last.current = full;
	const shown = full ?? last.current;
	const typed = (event: FocusEvent<HTMLDivElement>, focused: boolean) => api.getState().setFullTyping(focused ? typesIn(event.target) : typesIn(event.relatedTarget) && event.currentTarget.contains(event.relatedTarget as Node));
	return (
		<Sheet open={full !== null} onClose={() => api.getState().closeFull()} escapes={escapes} className={`tc-full${typing ? " is-typing" : ""}`}>
			{shown ? (
				<div className="tc-full-room" onFocus={(event) => typed(event, true)} onBlur={(event) => typed(event, false)}>
					<SheetBar typing={typing} />
					<div className="tc-full-body">
						<FullColumn task={shown.task} notesFocus={shown.notesFocus} />
					</div>
					<FullFoot id={shown.task.id} />
				</div>
			) : null}
		</Sheet>
	);
});

/** The top row: Close on the left; Done on the right while something is typed, which puts the keyboard away and writes the notes. */
function SheetBar({ typing }: { readonly typing: boolean }) {
	const api = useScreenApi();
	const { doc } = useHost();
	const done = () => {
		const active = doc.activeElement;
		if (active instanceof HTMLElement) active.blur();
		api.getState().saveNotes();
	};
	return (
		<div className="tc-sheet-bar">
			<button type="button" className="tc-btn is-text" onClick={() => api.getState().closeFull()}>
				Close
			</button>
			<button type="button" className={`tc-btn is-text is-strong${typing ? "" : " is-hidden"}`} onClick={done}>
				Done
			</button>
		</div>
	);
}

function FullColumn({ task, notesFocus }: { readonly task: FullTask; readonly notesFocus: number }) {
	const api = useScreenApi();
	const at = useScreen((s) => s.fullAt);
	const entrySeq = useScreen((s) => s.entrySeq);
	return (
		<div className="tc-full-column">
			{task.parent ? (
				<button type="button" className="tc-full-parent" onClick={() => api.getState().fullUp()}>
					<Icon name="subtask" />
					<span className="tc-full-parent-text">{task.parent.title}</span>
				</button>
			) : null}
			<div className="tc-full-title">{at?.kind === "title" ? <EntryField key={`title-${entrySeq}`} className="tc-full-title-field" /> : task.title}</div>
			{task.project ? (
				<button type="button" className="tc-full-project" onClick={() => api.getState().showProject(task.project!)}>
					<Icon name="project" />
					<span className="tc-full-project-text">{task.project}</span>
				</button>
			) : null}
			<FullList task={task} />
			<FullNotes key={`${task.id}:${task.notes.seq}:${notesFocus}`} text={task.notes.text} focus={notesFocus > 0} />
		</div>
	);
}

/** The subtasks as a tree, the field among them where the port says: a card renamed in its place, a new subtask at its depth. */
function FullList({ task }: { readonly task: FullTask }) {
	const at = useScreen((s) => s.fullAt);
	const entrySeq = useScreen((s) => s.entrySeq);
	const field = (depth: number) => <EntryField key={`full-${entrySeq}`} depth={depth} />;
	const rows: ReactNode[] = task.rows.map((row, index) => (at && at.kind === "row" && at.index === index ? field(at.depth) : <FullCard key={row.id} row={row} task={task} />));
	if (at && at.kind === "new") rows.splice(at.index, 0, field(at.depth));
	return rows.length > 0 ? <div className="tc-full-list">{rows}</div> : null;
}

/** A subtask's card as in a list, its circle first: a tap on the circle ticks it, on the card opens its menu (F241, F242). */
function FullCard({ row, task }: { readonly row: FullRow; readonly task: FullTask }) {
	const api = useScreenApi();
	const openMenuFrom = useMenuFrom();
	const face = task.faces[row.id];
	if (!face) return null;
	return (
		<CardFace face={face} className={`tc-card tc-full-card${row.open ? "" : " is-closed"}`} data-mark={row.status} style={{ [PROPERTY.level]: String(row.depth) } as CSSProperties} onClick={(event) => openMenuFrom(row.id, "fullSubtask", event.currentTarget)}>
			<button
				type="button"
				className="tc-pick"
				aria-label="Done"
				onClick={(event) => {
					event.stopPropagation();
					api.getState().tick(row.id);
				}}
			>
				<Icon name="check" />
			</button>
		</CardFace>
	);
}

/** The notes in Obsidian's own editor at once (F244): written by the port after a pause in typing, and when the screen leaves the task. */
function FullNotes({ text, focus }: { readonly text: string; readonly focus: boolean }) {
	const api = useScreenApi();
	return (
		<div className="tc-desc-text tc-full-desc is-editing" onFocus={() => api.getState().focusNotes(true)} onBlur={() => api.getState().focusNotes(false)}>
			<ObsidianEditor text={text} className="tc-full-notes" lines focus={focus} onChange={(typed) => api.getState().typeNotes(typed)} onEscape={() => api.getState().saveNotes()} />
		</div>
	);
}

/** The bottom row, as the main screen's: Undo, «⋯» (the task's own menu), and the plus, a new last subtask (F245). Hidden while something is typed. */
function FullFoot({ id }: { readonly id: string }) {
	const api = useScreenApi();
	const openMenuFrom = useMenuFrom();
	const canUndo = useScreen((s) => s.canUndo);
	return (
		<>
			<div className="tc-capsule">
				<button type="button" className={`tc-btn is-icon is-plain tc-undo${canUndo ? "" : " is-off"}`} aria-label="Undo" title="Undo" aria-disabled={!canUndo} onClick={() => api.getState().undo()}>
					<Icon name="undo" />
				</button>
				<button type="button" className="tc-btn is-icon is-plain tc-more-open" aria-label="More" title="More" onClick={(event) => openMenuFrom(id, "full", event.currentTarget)}>
					<Icon name="more" />
				</button>
			</div>
			<button type="button" className="tc-btn is-round is-accent tc-plus" aria-label="Add subtask" onClick={() => api.getState().fullPlus()}>
				<Icon name="plus" />
			</button>
		</>
	);
}
