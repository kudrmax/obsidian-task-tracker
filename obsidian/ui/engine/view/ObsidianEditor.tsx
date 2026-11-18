import { type FocusEvent, useEffect, useRef } from "react";
import { type EditorHost, EmbeddedEditor } from "../../markdown/EmbeddedEditor";
import { useHost } from "./host";

/** The view whose active editor a field becomes while it has the focus, so Obsidian's commands act on it. */
const EDITOR_HOST: EditorHost = { activeEditor: null };

export interface ObsidianEditorProps {
	readonly text: string;
	readonly className: string;
	/** Enter: the text as typed. */
	readonly onEnter: (text: string) => void;
	readonly onEscape: () => void;
	/** Tab, and Shift+Tab (`shift`): when given, the field takes them. */
	readonly onTab?: (shift: boolean) => void;
	/** The focus left the field: the event, and the text as typed then. */
	readonly onLeave?: (event: FocusEvent<HTMLDivElement>, text: () => string) => void;
}

/**
 * Text fields (spec, «Text fields»): the one component that holds an editor, Obsidian's own as the plugin embeds it
 * (`EmbeddedEditor`, stage 0 blocker 8): `[[` opens the note search, the look is Obsidian's. Made once as it mounts, given
 * the focus, destroyed as it goes.
 */
export function ObsidianEditor({ text, className, onEnter, onEscape, onTab, onLeave }: ObsidianEditorProps) {
	const { app, sourcePath } = useHost();
	const container = useRef<HTMLDivElement>(null);
	const handlers = useRef({ onEnter, onEscape, onTab });
	handlers.current = { onEnter, onEscape, onTab };
	const editorRef = useRef<EmbeddedEditor | null>(null);
	useEffect(() => {
		if (!container.current) return;
		const editor: EmbeddedEditor = new EmbeddedEditor(app, EDITOR_HOST, sourcePath, container.current, text, {
			keys: [
				{ key: "Enter", run: () => handlers.current.onEnter(editor.value) },
				{ key: "Escape", run: () => handlers.current.onEscape() },
				...(onTab ? [{ key: "Tab", run: () => handlers.current.onTab?.(false), shift: () => handlers.current.onTab?.(true) }] : []),
			],
		});
		editorRef.current = editor;
		editor.focusEnd();
		return () => {
			editorRef.current = null;
			editor.destroy();
		};
		// The editor is made once per mount; its text after that is the person's.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	return <div ref={container} className={className} onBlur={onLeave ? (event) => onLeave(event, () => editorRef.current?.value ?? "") : undefined} />;
}
