import { EditorState, type Extension, Prec, type Transaction, type TransactionSpec } from "@codemirror/state";
import { EditorView, keymap, placeholder, type ViewUpdate } from "@codemirror/view";
import type { App, Editor, TFile } from "obsidian";
import { el } from "../dom";
import { composingKey, LINE_BREAK, oneLine, type TitleField, type TitleFieldEvents, type TitleFieldOptions } from "./TitleField";

/** What Obsidian's editor shows for the field outside it: the note search, and on the phone its toolbar over the keyboard. */
const EDITOR_PARTS = ".suggestion-container, .mobile-toolbar";

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
 * word. Enter, Escape and Tab are the owner's, unless the note search is open: then they are the search's. The text stays
 * one line, which wraps: a line break pasted in becomes a space.
 */
export class MarkdownTitleField implements TitleField {
	private static editorClass: ObsidianEditorClass | null = null;
	readonly el: HTMLElement;
	private readonly owner: EditorOwner;
	private readonly editor: ObsidianEditor;
	/** A text set by the owner, the first one too, is not input. */
	private quiet = true;

	constructor(app: App, private readonly host: EditorHost, sourcePath: string, parent: HTMLElement, opts: TitleFieldOptions) {
		this.el = el(parent, "div", "tc-title-field");
		this.owner = {
			app,
			get file() {
				return app.vault.getFileByPath(sourcePath);
			},
			getMode: () => "source",
			onMarkdownScroll: () => undefined,
		};
		const events: TitleFieldEvents = {
			...opts.events,
			onInput: () => {
				if (!this.quiet) opts.events.onInput();
			},
		};
		this.editor = new (MarkdownTitleField.extended(app, events, opts.placeholder))(app, this.el, this.owner);
		this.editor.load();
		this.owner.editMode = this.editor;
		this.owner.editor = this.editor.editor;
		this.editor.set(oneLine(opts.text));
		const content = this.editor.cm.contentDOM;
		content.setAttribute("enterkeyhint", "next");
		content.addEventListener("focus", () => (this.host.activeEditor = this.owner));
		content.addEventListener("blur", () => events.onBlur());
		this.quiet = false;
	}

	get text(): string {
		return oneLine(this.editor.editor.getValue());
	}

	get focused(): boolean {
		const { cm } = this.editor;
		return cm.root.activeElement === cm.contentDOM;
	}

	setText(text: string): void {
		const { cm } = this.editor;
		if (cm.state.doc.toString() === text) return;
		this.quiet = true;
		try {
			cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: text }, selection: { anchor: text.length } });
		} finally {
			this.quiet = false;
		}
	}

	focusEnd(): void {
		const { cm } = this.editor;
		cm.dispatch({ selection: { anchor: cm.state.doc.length } });
		cm.focus();
	}

	selectAll(): void {
		const { cm } = this.editor;
		cm.dispatch({ selection: { anchor: 0, head: cm.state.doc.length } });
		cm.focus();
	}

	focus(): void {
		this.editor.cm.focus();
	}

	owns(target: Element): boolean {
		return this.el.contains(target) || target.closest(EDITOR_PARTS) !== null;
	}

	destroy(): void {
		if (this.host.activeEditor === this.owner) this.host.activeEditor = null;
		this.editor.unload();
		this.editor.cm.destroy();
		this.el.remove();
	}

	private static extended(app: App, events: TitleFieldEvents, hint: string): ObsidianEditorClass {
		const Base = (MarkdownTitleField.editorClass ??= MarkdownTitleField.find(app));
		return class extends Base {
			override buildLocalExtensions(): Extension[] {
				let composing = false;
				const searching = () => this.editorSuggest?.currentSuggest?.isOpen === true;
				const key = (run: () => void) => () => {
					if (composing || searching()) return false;
					run();
					return true;
				};
				return [
					...super.buildLocalExtensions(),
					placeholder(hint),
					EditorState.transactionFilter.of(oneLineFilter),
					Prec.highest(
						EditorView.domEventHandlers({
							keydown: (e) => {
								composing = composingKey(e);
								return false;
							},
						}),
					),
					Prec.highest(
						keymap.of([
							{ key: "Enter", run: key(() => events.onEnter()), shift: key(() => events.onEnter()), stopPropagation: true },
							{ key: "Escape", run: key(() => events.onEscape()), stopPropagation: true },
							{ key: "Tab", run: key(() => events.onTab(false)), shift: key(() => events.onTab(true)), stopPropagation: true },
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

/** Each line break that lands in the text, pasted or dropped, becomes a space in the same change. */
function oneLineFilter(tr: Transaction): TransactionSpec | readonly TransactionSpec[] {
	if (!tr.docChanged) return tr;
	const breaks = [...tr.newDoc.toString().matchAll(LINE_BREAK)].map((m) => ({ from: m.index ?? 0, to: (m.index ?? 0) + m[0].length, insert: " " }));
	return breaks.length === 0 ? tr : [tr, { changes: breaks, sequential: true }];
}

interface EmbeddedNote {
	editable: boolean;
	readonly editMode: object;
	load(): void;
	unload(): void;
	showEditor(): void;
}
