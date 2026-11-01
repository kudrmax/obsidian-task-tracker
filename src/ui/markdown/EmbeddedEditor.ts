import { Prec, type Extension } from "@codemirror/state";
import { type EditorView, keymap, type ViewUpdate } from "@codemirror/view";
import type { App, Editor, TFile } from "obsidian";

/** The parts of Obsidian's own markdown editor in use here; Obsidian doesn't publish them. */
interface ObsidianEditor {
	readonly cm: EditorView;
	readonly editor: Editor;
	readonly editorSuggest?: { readonly currentSuggest?: { readonly isOpen?: boolean } | null };
	load(): void;
	unload(): void;
	set(text: string): void;
	buildLocalExtensions(): Extension[];
	onUpdate(update: ViewUpdate, changed: boolean): void;
}

type ObsidianEditorClass = new (app: App, container: HTMLElement, owner: EditorOwner) => ObsidianEditor;

/** What Obsidian's editor asks of the view it sits in: the note its links are made from. */
export interface EditorOwner {
	readonly app: App;
	readonly file: TFile | null;
	getMode(): "source";
	onMarkdownScroll(): void;
	editMode?: ObsidianEditor;
	editor?: Editor;
}

/** The view whose active editor an embedded one becomes while it has the focus, so Obsidian's commands act on it. */
export interface EditorHost {
	activeEditor: EditorOwner | null;
}

/** A key the editor takes over; it stays the note search's while that is open. `false` from a run leaves it to the editor. */
export interface EditorKey {
	readonly key: string;
	run(): boolean | void;
	/** The key with Shift; without it, Shift leaves the key to the editor. */
	shift?(): boolean | void;
}

export interface EditorHooks {
	readonly keys?: readonly EditorKey[];
	/** More of CodeMirror's extensions, after Obsidian's own and before the keys. */
	readonly extensions?: readonly Extension[];
	onChange?(): void;
}

/**
 * Obsidian's own markdown editor, as in a note in Live Preview, put into an element of the plugin: `[[` opens the note
 * search, links are made from `sourcePath`, its look is Obsidian's.
 */
export class EmbeddedEditor {
	private static editorClass: ObsidianEditorClass | null = null;
	private readonly owner: EditorOwner;
	private readonly editor: ObsidianEditor;

	constructor(app: App, private readonly host: EditorHost, sourcePath: string, container: HTMLElement, text: string, hooks: EditorHooks = {}) {
		this.owner = {
			app,
			get file() {
				return app.vault.getFileByPath(sourcePath);
			},
			getMode: () => "source",
			onMarkdownScroll: () => undefined,
		};
		this.editor = new (EmbeddedEditor.extended(app, hooks))(app, container, this.owner);
		this.editor.load();
		this.owner.editMode = this.editor;
		this.owner.editor = this.editor.editor;
		this.editor.set(text);
		this.contentDOM.addEventListener("focus", () => (this.host.activeEditor = this.owner));
	}

	get value(): string {
		return this.editor.editor.getValue();
	}

	get contentDOM(): HTMLElement {
		return this.editor.cm.contentDOM;
	}

	/** The page's active element. */
	get focused(): boolean {
		const { cm } = this.editor;
		return cm.root.activeElement === cm.contentDOM;
	}

	/** The whole text replaced, the caret at its end. */
	setValue(text: string): void {
		const { cm } = this.editor;
		if (cm.state.doc.toString() === text) return;
		cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: text }, selection: { anchor: text.length } });
	}

	focusEnd(): void {
		const end = this.editor.cm.state.doc.length;
		this.editor.cm.dispatch({ selection: { anchor: end } });
		this.editor.cm.focus();
	}

	selectAll(): void {
		const { cm } = this.editor;
		cm.dispatch({ selection: { anchor: 0, head: cm.state.doc.length } });
		cm.focus();
	}

	/** The focus given back, the selection as it was. */
	focus(): void {
		this.editor.cm.focus();
	}

	destroy(): void {
		if (this.host.activeEditor === this.owner) this.host.activeEditor = null;
		this.editor.unload();
		this.editor.cm.destroy();
	}

	private static extended(app: App, hooks: EditorHooks): ObsidianEditorClass {
		const Base = (EmbeddedEditor.editorClass ??= EmbeddedEditor.find(app));
		return class extends Base {
			override buildLocalExtensions(): Extension[] {
				const searching = () => this.editorSuggest?.currentSuggest?.isOpen === true;
				const take = (run: () => boolean | void) => () => !searching() && run() !== false;
				const keys = (hooks.keys ?? []).map(({ key, run, shift }) => ({ key, run: take(run), shift: shift && take(shift), stopPropagation: true }));
				const local = [...super.buildLocalExtensions(), ...(hooks.extensions ?? [])];
				return keys.length === 0 ? local : [...local, Prec.highest(keymap.of(keys))];
			}

			override onUpdate(update: ViewUpdate, changed: boolean): void {
				super.onUpdate(update, changed);
				if (changed) hooks.onChange?.();
			}
		};
	}

	/** Obsidian hands its editor out only inside an embedded note; the class is taken from one made and dropped at once. */
	private static find(app: App): ObsidianEditorClass {
		const registry = (app as unknown as { embedRegistry: { embedByExtension: Record<string, (context: object, file: null, subpath: string) => EmbeddedNote> } }).embedRegistry;
		const note = registry.embedByExtension.md({ app, containerEl: document.createElement("div") }, null, "");
		note.load();
		note.editable = true;
		note.showEditor();
		const editorClass = Object.getPrototypeOf(Object.getPrototypeOf(note.editMode)).constructor as ObsidianEditorClass;
		note.unload();
		return editorClass;
	}
}

interface EmbeddedNote {
	editable: boolean;
	readonly editMode: object;
	load(): void;
	unload(): void;
	showEditor(): void;
}
