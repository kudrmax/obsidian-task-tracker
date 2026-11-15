import { Prec, type Extension } from "@codemirror/state";
import { type EditorView, keymap, type ViewUpdate } from "@codemirror/view";
import type { App, Editor, TFile } from "obsidian";
import { type LineKeys, lineKeys } from "./keys";

/**
 * The islands driver (§Architecture): what another library draws inside the block — Obsidian's own Markdown editor — in
 * a host node the view leaves empty (`data-n-island`), made once for its key, never diffed by the view, ended with the
 * host. It reports what was typed, the focus, and Escape; it takes a text in only when the model says so (`replace`).
 */

/** What the editor tells: each change of its text, its focus coming and going, Escape (unless a note search is open in it). */
export interface EditorHooks {
	change(text: string): void;
	focus(focused: boolean): void;
	escape(): void;
}

/** A running editor. */
export interface IslandEditor {
	setValue(text: string): void;
	/** The caret put at the end; answers what takes the focus (the focus driver gives it). */
	caretAtEnd(): HTMLElement;
	destroy(): void;
}

/** Makes an editor in `container` holding `text`: Obsidian's in the plugin, a stand-in in a test. */
export type EditorFactory = (container: HTMLElement, text: string, hooks: EditorHooks) => IslandEditor;

/** An island the model asks for: where (`name`), whose (`key`: another key makes it anew), what it starts with, and a text given in its place. */
export interface IslandSpec {
	readonly name: string;
	readonly key: string;
	readonly text: string;
	readonly replace: { readonly text: string; readonly seq: number } | null;
	readonly hooks: EditorHooks;
}

interface Mounted {
	readonly key: string;
	readonly container: HTMLElement;
	readonly editor: IslandEditor;
	seq: number;
}

export class Islands {
	private readonly mounted = new Map<string, Mounted>();

	constructor(private readonly editors: EditorFactory | null) {}

	/** After a render: each island asked for stands in its node; one no longer asked for, or whose node went, is ended. */
	sync(root: ParentNode, specs: readonly IslandSpec[]): void {
		const nodes = new Map<string, HTMLElement>();
		for (const el of root.querySelectorAll<HTMLElement>("[data-n-island]")) nodes.set(el.dataset.nIsland ?? "", el);
		const wanted = new Map(specs.map((spec) => [spec.name, spec]));
		for (const [name, island] of [...this.mounted]) {
			const spec = wanted.get(name);
			if (spec && spec.key === island.key && nodes.get(name) === island.container) continue;
			island.editor.destroy();
			this.mounted.delete(name);
		}
		if (!this.editors) return;
		for (const spec of specs) {
			const container = nodes.get(spec.name);
			if (!container) continue;
			let island = this.mounted.get(spec.name);
			if (!island) {
				island = { key: spec.key, container, editor: this.editors(container, spec.text, spec.hooks), seq: spec.replace?.seq ?? 0 };
				this.mounted.set(spec.name, island);
			}
			if (spec.replace && spec.replace.seq !== island.seq) {
				island.seq = spec.replace.seq;
				island.editor.setValue(spec.replace.text);
			}
		}
	}

	/** The island named, its caret at the end: what takes the focus; null when there is none. */
	focusTarget(name: string): HTMLElement | null {
		return this.mounted.get(name)?.editor.caretAtEnd() ?? null;
	}

	dispose(): void {
		for (const island of this.mounted.values()) island.editor.destroy();
		this.mounted.clear();
	}
}

// Obsidian's own editor ---------------------------------------------------------------------------------------------

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

/** What Obsidian's editor asks of the view it sits in: the note its links are made from. */
interface EditorOwner {
	readonly app: App;
	readonly file: TFile | null;
	getMode(): "source";
	onMarkdownScroll(): void;
	editMode?: ObsidianEditor;
	editor?: Editor;
}

type ObsidianEditorClass = new (app: App, container: HTMLElement, owner: EditorOwner) => ObsidianEditor;

interface EmbeddedNote {
	editable: boolean;
	readonly editMode: object;
	load(): void;
	unload(): void;
	showEditor(): void;
}

interface EmbedRegistry {
	readonly embedByExtension: { md(context: { readonly app: App; readonly containerEl: HTMLElement }, file: null, subpath: string): EmbeddedNote };
}

let editorClass: ObsidianEditorClass | null = null;

/** Obsidian hands its editor out only inside an embedded note: the class is taken from one made and dropped at once. */
function findEditorClass(app: App, doc: Document): ObsidianEditorClass {
	const registry = (app as unknown as { readonly embedRegistry: EmbedRegistry }).embedRegistry;
	const note = registry.embedByExtension.md({ app, containerEl: doc.createElement("div") }, null, "");
	note.load();
	note.editable = true;
	note.showEditor();
	const base = Object.getPrototypeOf(Object.getPrototypeOf(note.editMode) as object) as { readonly constructor: ObsidianEditorClass };
	const found = base.constructor;
	note.unload();
	return found;
}

/**
 * Obsidian's own markdown editor, as in a note in Live Preview (`[[` opens the note search, links are made from the tasks
 * file, its look is Obsidian's), with the commands that change what a line is held (a description line must not become
 * a task). The old screen's `EmbeddedEditor` and `ObsidianMarkdown.edit`.
 */
export function obsidianEditors(app: App, sourcePath: () => string): EditorFactory {
	return (container, text, hooks) => {
		const lines: LineKeys = lineKeys(app);
		const Base = (editorClass ??= findEditorClass(app, container.ownerDocument));
		const owner: EditorOwner = {
			app,
			get file() {
				return app.vault.getFileByPath(sourcePath());
			},
			getMode: () => "source",
			onMarkdownScroll: () => undefined,
		};
		const Extended = class extends Base {
			override buildLocalExtensions(): Extension[] {
				const searching = () => this.editorSuggest?.currentSuggest?.isOpen === true;
				const escape = { key: "Escape", run: () => !searching() && (hooks.escape(), true), stopPropagation: true };
				const held = lines.codeMirror.map((key) => ({ key, run: () => true, preventDefault: true, stopPropagation: true }));
				return [...super.buildLocalExtensions(), Prec.highest(keymap.of(held)), Prec.highest(keymap.of([escape]))];
			}

			override onUpdate(update: ViewUpdate, changed: boolean): void {
				super.onUpdate(update, changed);
				if (changed) hooks.change(this.editor.getValue());
			}
		};
		const editor = new Extended(app, container, owner);
		editor.load();
		owner.editMode = editor;
		owner.editor = editor.editor;
		editor.set(text);
		const content = editor.cm.contentDOM;
		const focused = () => {
			lines.hold(true);
			hooks.focus(true);
		};
		const blurred = () => {
			lines.hold(false);
			hooks.focus(false);
		};
		content.addEventListener("focus", focused);
		content.addEventListener("blur", blurred);
		return {
			setValue: (value) => {
				const { cm } = editor;
				if (cm.state.doc.toString() === value) return;
				cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: value }, selection: { anchor: value.length } });
			},
			caretAtEnd: () => {
				editor.cm.dispatch({ selection: { anchor: editor.cm.state.doc.length } });
				return content;
			},
			destroy: () => {
				content.removeEventListener("focus", focused);
				content.removeEventListener("blur", blurred);
				lines.hold(false);
				editor.unload();
				editor.cm.destroy();
			},
		};
	};
}
