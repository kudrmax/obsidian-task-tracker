import { useEffect, useRef } from "react";
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
}

/**
 * Text fields (spec, «Text fields»): the one component that holds an editor, Obsidian's own as the plugin embeds it
 * (`EmbeddedEditor`, stage 0 blocker 8): `[[` opens the note search, the look is Obsidian's. Made once as it mounts, given
 * the focus, destroyed as it goes.
 */
export function ObsidianEditor({ text, className, onEnter, onEscape }: ObsidianEditorProps) {
	const { app, sourcePath } = useHost();
	const container = useRef<HTMLDivElement>(null);
	const handlers = useRef({ onEnter, onEscape });
	handlers.current = { onEnter, onEscape };
	useEffect(() => {
		if (!container.current) return;
		const editor: EmbeddedEditor = new EmbeddedEditor(app, EDITOR_HOST, sourcePath, container.current, text, {
			keys: [
				{ key: "Enter", run: () => handlers.current.onEnter(editor.value) },
				{ key: "Escape", run: () => handlers.current.onEscape() },
			],
		});
		editor.focusEnd();
		return () => editor.destroy();
		// The editor is made once per mount; its text after that is the person's.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	return <div ref={container} className={className} />;
}
