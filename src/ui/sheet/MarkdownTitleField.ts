import { Prec, type Extension } from "@codemirror/state";
import { type EditorView, keymap, type ViewUpdate } from "@codemirror/view";
import type { App, Editor, TFile } from "obsidian";
import { el } from "../dom";
import { oneLine, type TitleField, type TitleFieldEvents } from "./TitleField";

/** The parts of Obsidian's own markdown editor the field uses; Obsidian doesn't publish them. */
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

/** The view whose active editor this field becomes while it has the focus, so Obsidian's commands act on it. */
export interface EditorHost {
	activeEditor: EditorOwner | null;
}

/**
 * The title typed in Obsidian's own editor, as in a note in Live Preview: `[[` opens the note search, a link shows its
 * word. Enter saves and Escape cancels, unless the note search is open: then they are the search's.
 */
export class MarkdownTitleField implements TitleField {
	private static editorClass: ObsidianEditorClass | null = null;
	readonly el: HTMLElement;
	private readonly owner: EditorOwner;
	private readonly editor: ObsidianEditor;

	constructor(app: App, private readonly host: EditorHost, sourcePath: string, parent: HTMLElement, text: string, events: TitleFieldEvents) {
		this.el = el(parent, "div", "tc-sheet-title");
		this.owner = {
			app,
			get file() {
				return app.vault.getFileByPath(sourcePath);
			},
			getMode: () => "source",
			onMarkdownScroll: () => undefined,
		};
		this.editor = new (MarkdownTitleField.extended(app, events))(app, this.el, this.owner);
		this.editor.load();
		this.owner.editMode = this.editor;
		this.owner.editor = this.editor.editor;
		this.editor.set(text);
		this.editor.cm.contentDOM.setAttribute("enterkeyhint", "done");
		this.editor.cm.contentDOM.addEventListener("focus", () => (this.host.activeEditor = this.owner));
	}

	get text(): string {
		return oneLine(this.editor.editor.getValue());
	}

	focusEnd(): void {
		const end = this.editor.cm.state.doc.length;
		this.editor.cm.dispatch({ selection: { anchor: end } });
		this.editor.cm.focus();
	}

	destroy(): void {
		if (this.host.activeEditor === this.owner) this.host.activeEditor = null;
		this.editor.unload();
		this.editor.cm.destroy();
	}

	private static extended(app: App, events: TitleFieldEvents): ObsidianEditorClass {
		const Base = (MarkdownTitleField.editorClass ??= MarkdownTitleField.find(app));
		return class extends Base {
			override buildLocalExtensions(): Extension[] {
				const searching = () => this.editorSuggest?.currentSuggest?.isOpen === true;
				const key = (run: () => void) => () => {
					if (searching()) return false;
					run();
					return true;
				};
				return [
					...super.buildLocalExtensions(),
					Prec.highest(
						keymap.of([
							{ key: "Enter", run: key(() => events.onEnter()), shift: key(() => events.onEnter()), preventDefault: true },
							{ key: "Escape", run: key(() => events.onEscape()), preventDefault: true },
						]),
					),
				];
			}

			override onUpdate(update: ViewUpdate, changed: boolean): void {
				super.onUpdate(update, changed);
				if (changed) events.onInput();
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
