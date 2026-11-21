import { EditorState, type Transaction, type TransactionSpec } from "@codemirror/state";
import { placeholder as hint } from "@codemirror/view";
import { type FocusEvent, useEffect, useRef } from "react";
import { type EditorHost, EmbeddedEditor } from "../../shared/markdown/EmbeddedEditor";
import { useHost } from "./host";

/** A line break typed or pasted in a title (the plugin's `LINE_BREAK`): the title stays one line, which wraps. */
const LINE_BREAK = /\r\n|\r|\n/g;

/** Each line break that lands in the text, pasted or dropped, becomes a space in the same change (the plugin's `oneLineFilter`). */
function oneLine(tr: Transaction): TransactionSpec | readonly TransactionSpec[] {
	if (!tr.docChanged) return tr;
	const breaks = [...tr.newDoc.toString().matchAll(LINE_BREAK)].map((m) => ({ from: m.index ?? 0, to: (m.index ?? 0) + m[0].length, insert: " " }));
	return breaks.length === 0 ? tr : [tr, { changes: breaks, sequential: true }];
}

/** The view whose active editor a field becomes while it has the focus, so Obsidian's commands act on it. */
const EDITOR_HOST: EditorHost = { activeEditor: null };

export interface ObsidianEditorProps {
	readonly text: string;
	readonly className: string;
	/** What shows while the field is empty («New task»). */
	readonly placeholder?: string;
	/** The colour its task's level paints the field in (`data-priority`). */
	readonly priority?: string | null;
	/** Enter: the text as typed. Without it (notes), Enter is the editor's own: a new line, a list's next item. */
	readonly onEnter?: (text: string) => void;
	readonly onEscape: () => void;
	/** Tab, and Shift+Tab (`shift`): when given, the field takes them. */
	readonly onTab?: (shift: boolean) => void;
	/** ⌥Tab: the new task's field switches to a new section's name and back (the bar's New section). */
	readonly onNewSection?: () => void;
	/** The text changed as typed. */
	readonly onChange?: (text: string) => void;
	/**
	 * Notes take several lines (Max, 2026-11-20, Decision 124): a pasted break stays, and Enter (with no `onEnter`) breaks
	 * the line as Obsidian does, a list going on with its next item. Without it the text is a title, one line: a break
	 * typed or pasted becomes a space.
	 */
	readonly lines?: boolean;
	/** The focus left the field: the event, and the text as typed then. */
	readonly onLeave?: (event: FocusEvent<HTMLDivElement>, text: () => string) => void;
}

/**
 * Text fields (spec, «Text fields»): the one component that holds an editor, Obsidian's own as the plugin embeds it
 * (`EmbeddedEditor`, stage 0 blocker 8): `[[` opens the note search, the look is Obsidian's; while it has the focus its own
 * scope stands over Obsidian's hotkeys (Decision 133). Made once as it mounts, given
 * the focus, destroyed as it goes.
 */
export function ObsidianEditor({ text, className, placeholder, priority = null, lines = false, onEnter, onEscape, onTab, onNewSection, onChange, onLeave }: ObsidianEditorProps) {
	const { app, sourcePath } = useHost();
	const container = useRef<HTMLDivElement>(null);
	const handlers = useRef({ onEnter, onEscape, onTab, onNewSection, onChange });
	handlers.current = { onEnter, onEscape, onTab, onNewSection, onChange };
	const editorRef = useRef<EmbeddedEditor | null>(null);
	useEffect(() => {
		if (!container.current) return;
		const editor: EmbeddedEditor = new EmbeddedEditor(app, EDITOR_HOST, sourcePath, container.current, lines ? text : text.replace(LINE_BREAK, " "), {
			extensions: [...(lines ? [] : [EditorState.transactionFilter.of(oneLine)]), ...(placeholder ? [hint(placeholder)] : [])],
			onChange: () => handlers.current.onChange?.(editor.value),
			/** While it has the focus no hotkey of Obsidian's runs on what is typed, nor a command that changes the line (F194, Decision 133). */
			ownScope: { hotkeys: onNewSection ? [{ modifiers: ["Alt"], key: "Tab", run: () => handlers.current.onNewSection?.() }] : [] },
			keys: [
				...(handlers.current.onEnter ? [{ key: "Enter", run: () => handlers.current.onEnter?.(editor.value) }] : []),
				{ key: "Escape", run: () => handlers.current.onEscape() },
				...(onTab ? [{ key: "Tab", run: () => handlers.current.onTab?.(false), shift: () => handlers.current.onTab?.(true) }] : []),
			],
		});
		editorRef.current = editor;
		/** The phone's keyboard offers «next»: Enter opens the next field (the plugin's `enterkeyhint`). */
		editor.contentDOM.setAttribute("enterkeyhint", handlers.current.onEnter ? "next" : "enter");
		editor.focusEnd();
		return () => {
			editorRef.current = null;
			editor.destroy();
		};
		// The editor is made once per mount; its text after that is the person's.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	return <div ref={container} className={className} data-priority={priority ?? undefined} onBlur={onLeave ? (event) => onLeave(event, () => editorRef.current?.value ?? "") : undefined} />;
}
