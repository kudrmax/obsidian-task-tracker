import { Compartment, EditorState, type Extension, Prec, type Transaction, type TransactionSpec } from "@codemirror/state";
import { EditorView, keymap, placeholder, type ViewUpdate } from "@codemirror/view";
import type { App, Editor, Modifier, TFile } from "obsidian";
import { Focus } from "./focus";
import { type LineKeys, lineKeys } from "./keys";
import { LINE_BREAK, oneLine } from "../../../../core/application/contracts";

/**
 * The islands driver (§Architecture): what Obsidian draws itself inside the new screens, made once and never diffed by
 * the view: here the title field, Obsidian's own Markdown editor as in a note in Live Preview (`[[` opens the note
 * search, a link shows its word). The view draws the island's place (`data-n-island`); this puts the editor there and
 * moves it with its place, tells what is typed and pressed, and takes the text the model gives only when it differs.
 */

/** The keys the field's owner hears: the rest are the editor's. */
export type FieldKey = "enter" | "escape" | "tab" | "shiftTab" | "altTab";

export interface FieldEvents {
	typed(text: string): void;
	key(key: FieldKey): void;
	/** The field lost the focus and did not get it back by the next task (a redraw moving it gives it back at once). */
	blurred(): void;
}

/** A title field as the driver holds it: Obsidian's editor in the plugin, or a stand-in where there is no Obsidian (tests). */
export interface IslandField {
	/** The editor's own element: moved into the island's place whenever the view draws that anew. */
	readonly el: HTMLElement;
	readonly text: string;
	readonly focused: boolean;
	/** A text set by the owner, the caret at its end; no input is told for it. */
	setText(text: string): void;
	setPlaceholder(text: string): void;
	/** The caret at the end, the keyboard up: inside the user's event. */
	focusEnd(): void;
	/** The focus given back after a redraw moved the field, the selection as it was. */
	refocus(): void;
	destroy(): void;
}

export type FieldFactory = (doc: Document, events: FieldEvents) => IslandField;

/** What a model asks of an island now: its text, the hint shown while it is empty, whether it holds the focus. */
export interface IslandState {
	readonly text: string;
	readonly placeholder: string;
	/** The field takes the focus now (a typing pick: once, inside the tap). */
	readonly focus: boolean;
}

/**
 * The node a host mounts its view into, made once in the window of `near` and placed by the host where it belongs (a
 * note's end), never diffed by anyone but the view rendered into it.
 */
export class MountNode {
	readonly node: HTMLElement;

	constructor(near: Node) {
		this.node = (near.ownerDocument ?? (near as Document)).createElement("div");
	}

	/** Placed in `parent` before `before` (null: last), unless it stands there already; answers whether it moved. */
	place(parent: Node, before: Node | null): boolean {
		if (this.node.parentNode === parent && (this.node.nextSibling === before || this.node === before)) return false;
		parent.insertBefore(this.node, before);
		return true;
	}

	/** Placed last in `parent` (a test's page, a host with no other place). */
	into(parent: Node): void {
		parent.appendChild(this.node);
	}

	remove(): void {
		this.node.remove();
	}
}

export class Islands {
	private field: IslandField | null = null;
	/** The field had the focus: a redraw that moved it gives it back. */
	private held = false;
	private blurTimer = 0;

	constructor(private readonly make: FieldFactory) {}

	/**
	 * After the render: the field stands in its place under `root` (`data-n-island="field"`), made the first time, moved
	 * when the view drew the place anew, gone when the view draws none.
	 */
	place(root: ParentNode, state: IslandState | null, events: FieldEvents): void {
		let spot: HTMLElement | null = null;
		for (const el of root.querySelectorAll<HTMLElement>("[data-n-island]")) if (el.dataset.nIsland === "field") spot = el;
		if (!spot || !state) {
			this.drop();
			return;
		}
		const doc = spot.ownerDocument;
		const field = (this.field ??= this.make(doc, {
			typed: (text) => events.typed(text),
			key: (key) => events.key(key),
			blurred: () => this.blurred(doc, events),
		}));
		if (field.el.parentElement !== spot) spot.appendChild(field.el);
		field.setPlaceholder(state.placeholder);
		if (field.text !== state.text) field.setText(state.text);
		if (state.focus) {
			field.focusEnd();
			this.held = true;
		} else if (this.held && !field.focused) field.refocus();
	}

	/** A blur ends the entry only when the focus did not come back by the next task: a redraw moving the field gives it back. */
	private blurred(doc: Document, events: FieldEvents): void {
		const view = doc.defaultView;
		if (!view) return;
		view.clearTimeout(this.blurTimer);
		this.blurTimer = view.setTimeout(() => {
			this.blurTimer = 0;
			if (!this.field || this.field.focused) return;
			this.held = false;
			events.blurred();
		}, 0);
	}

	/** The field goes with its editor; the next one is made where the entry stands then. */
	drop(): void {
		if (this.blurTimer) this.field?.el.ownerDocument.defaultView?.clearTimeout(this.blurTimer);
		this.blurTimer = 0;
		this.field?.destroy();
		this.field = null;
		this.held = false;
	}

	dispose(): void {
		this.drop();
	}
}

// Obsidian's editor ---------------------------------------------------------------------------------------------------

/** The parts of Obsidian's own Markdown editor in use here; Obsidian doesn't publish them. */
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
	readonly embedByExtension: { readonly md: (context: { readonly app: App; readonly containerEl: HTMLElement }, file: null, subpath: string) => EmbeddedNote };
}

let editorClass: ObsidianEditorClass | null = null;

/** Obsidian hands its editor out only inside an embedded note: the class is taken from one made and dropped at once. */
function findEditorClass(app: App, doc: Document): ObsidianEditorClass {
	const registry = (app as unknown as { readonly embedRegistry: EmbedRegistry }).embedRegistry;
	const note = registry.embedByExtension.md({ app, containerEl: doc.createElement("div") }, null, "");
	note.load();
	note.editable = true;
	note.showEditor();
	const found = Object.getPrototypeOf(Object.getPrototypeOf(note.editMode)) as { readonly constructor: ObsidianEditorClass };
	note.unload();
	return found.constructor;
}

/** Each line break that lands in the text, pasted or dropped, becomes a space in the same change: a title is one line. */
function oneLineFilter(tr: Transaction): TransactionSpec | readonly TransactionSpec[] {
	if (!tr.docChanged) return tr;
	const breaks = [...tr.newDoc.toString().matchAll(LINE_BREAK)].map((m) => {
		const [found] = m;
		return { from: m.index ?? 0, to: (m.index ?? 0) + found.length, insert: " " };
	});
	return breaks.length === 0 ? tr : [tr, { changes: breaks, sequential: true }];
}

/** The key code iOS sends while an input method commits a candidate, with `isComposing` already false. */
const COMPOSING_KEY_CODE = 229;

/**
 * Obsidian's editor commands that change what a line is (a checkbox, a list, a heading, a quote, a block) or move lines:
 * run in a title, they would turn it into a second task. Its hotkeys do nothing in the field.
 */
const LINE_COMMANDS: readonly string[] = [
	"editor:toggle-checklist-status",
	"editor:cycle-list-checklist",
	"editor:toggle-bullet-list",
	"editor:toggle-numbered-list",
	"editor:toggle-blockquote",
	"editor:set-heading",
	"editor:set-heading-0",
	"editor:set-heading-1",
	"editor:set-heading-2",
	"editor:set-heading-3",
	"editor:set-heading-4",
	"editor:set-heading-5",
	"editor:set-heading-6",
	"editor:insert-callout",
	"editor:insert-codeblock",
	"editor:insert-mathblock",
	"editor:insert-table",
	"editor:insert-horizontal-rule",
	"editor:swap-line-up",
	"editor:swap-line-down",
	"editor:indent-list",
	"editor:unindent-list",
];

export interface Hotkey {
	readonly modifiers: readonly Modifier[];
	readonly key: string;
}

/** The line commands' hotkeys: the ones set in Obsidian's settings, else its own. */
function lineHotkeys(app: App): readonly Hotkey[] {
	const hotkeys = (app as unknown as { readonly hotkeyManager?: { getHotkeys(id: string): readonly Hotkey[] | undefined; getDefaultHotkeys(id: string): readonly Hotkey[] | undefined } }).hotkeyManager;
	if (!hotkeys) return [];
	return LINE_COMMANDS.flatMap((id) => hotkeys.getHotkeys(id) ?? hotkeys.getDefaultHotkeys(id) ?? []);
}

/** No room of its own: the field's frame gives the card's padding. */
const NONE = "0";

/**
 * The field's look inside: Obsidian's editor reset to the card's type and padding, the accent for its links, its caret
 * and its selection. A theme of CodeMirror's own, its selectors doubled to stand over Obsidian's Live Preview rules.
 */
const FIELD_THEME = EditorView.theme({
	"&.cm-editor.cm-editor.cm-editor, & .cm-scroller.cm-scroller.cm-scroller, & .cm-sizer.cm-sizer.cm-sizer, & .cm-contentContainer.cm-contentContainer.cm-contentContainer, & .cm-content.cm-content.cm-content, & .cm-line.cm-line.cm-line": {
		fontFamily: "var(--tc-font-ui)",
		fontSize: "var(--tc-font-body)",
		fontWeight: "inherit",
		lineHeight: "var(--tc-leading-card)",
		color: "inherit",
		background: "transparent",
		padding: NONE,
		margin: NONE,
		minHeight: NONE,
		maxWidth: "none",
		overflow: "visible",
	},
	/** The phone's Live Preview pads its scroller by the note's margins: none here. */
	"& .cm-scroller.cm-scroller.cm-scroller.cm-scroller.cm-scroller": { padding: NONE },
	"& .cm-gutters.cm-gutters": { display: "none" },
	"& .cm-placeholder.cm-placeholder": { color: "var(--tc-muted)", fontWeight: "var(--tc-weight-normal)" },
	"& .cm-cursor.cm-cursor": { borderLeftColor: "var(--tc-accent)" },
	"& .cm-selectionBackground.cm-selectionBackground, & ::selection": { background: "var(--tc-selection)" },
	"& .cm-hmd-internal-link, & .cm-link, & .cm-url, & .cm-underline": { color: "var(--tc-accent)" },
});

/** The keys of the field's own, ahead of Obsidian's hotkeys while it has the focus (Option+Tab, the line commands). */
export interface FieldKeys {
	hold(on: boolean): void;
	dispose(): void;
}

/**
 * The title field as Obsidian's own editor (the old screen's `MarkdownTitleField`): links made from `sourcePath`, one
 * line that wraps, Enter, Escape and Tab the owner's unless the note search is open. `keys` makes the field's own key
 * scope (the keys driver's), over the block's.
 */
export function obsidianTitleField(app: App, sourcePath: () => string, keys: (onSwitch: () => void, lineHotkeys: readonly Hotkey[]) => FieldKeys): FieldFactory {
	return (doc, events) => {
		const container = doc.createElement("div");
		/** The hint shown while the field is empty, which the model words (`New task`, `Section name`). */
		const hint = new Compartment();
		let hinted = "";
		let quiet = true;
		let composing = false;
		const take = (run: () => void) => () => {
			if (composing) return false;
			run();
			return true;
		};
		const owner: EditorOwner = {
			app,
			get file() {
				return app.vault.getFileByPath(sourcePath());
			},
			getMode: () => "source",
			onMarkdownScroll: () => undefined,
		};
		const Base = (editorClass ??= findEditorClass(app, doc));
		const ownKeys = [
			{ key: "Enter", run: take(() => events.key("enter")), shift: take(() => events.key("enter")) },
			{ key: "Escape", run: take(() => events.key("escape")) },
			{ key: "Tab", run: take(() => events.key("tab")), shift: take(() => events.key("shiftTab")) },
		];
		const lines = lineHotkeys(app);
		const lineKeys = lines.map(({ modifiers, key }) => ({ key: [...modifiers, key.length === 1 ? key.toLowerCase() : key].join("-"), run: () => true, preventDefault: true, stopPropagation: true }));
		class FieldEditor extends Base {
			override buildLocalExtensions(): Extension[] {
				const searching = () => this.editorSuggest?.currentSuggest?.isOpen === true;
				const own = ownKeys.map(({ key, run, shift }) => ({ key, run: () => !searching() && run(), shift: shift && (() => !searching() && shift()), stopPropagation: true }));
				return [
					...super.buildLocalExtensions(),
					hint.of(placeholder(hinted)),
					EditorView.contentAttributes.of({ enterkeyhint: "next" }),
					EditorState.transactionFilter.of(oneLineFilter),
					FIELD_THEME,
					Prec.highest(EditorView.domEventHandlers({ keydown: (e) => void (composing = e.isComposing || e.keyCode === COMPOSING_KEY_CODE) })),
					Prec.highest(keymap.of(lineKeys)),
					Prec.highest(keymap.of(own)),
				];
			}

			override onUpdate(update: ViewUpdate, changed: boolean): void {
				super.onUpdate(update, changed);
				if (changed && !quiet) events.typed(oneLine(update.state.doc.toString()));
			}
		}
		const editor = new FieldEditor(app, container, owner);
		editor.load();
		owner.editMode = editor;
		owner.editor = editor.editor;
		editor.set("");
		quiet = false;
		const fieldKeys = keys(() => {
			if (!composing) events.key("altTab");
		}, lines);
		const content = editor.cm.contentDOM;
		const focused = () => fieldKeys.hold(true);
		const blurred = () => {
			fieldKeys.hold(false);
			events.blurred();
		};
		content.addEventListener("focus", focused);
		content.addEventListener("blur", blurred);
		return {
			el: container,
			get text() {
				return oneLine(editor.cm.state.doc.toString());
			},
			get focused() {
				return Focus.holds(content);
			},
			setText(text) {
				const cm = editor.cm;
				if (cm.state.doc.toString() === text) return;
				quiet = true;
				try {
					cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: text }, selection: { anchor: text.length } });
				} finally {
					quiet = false;
				}
			},
			setPlaceholder(text) {
				if (hinted === text) return;
				hinted = text;
				editor.cm.dispatch({ effects: hint.reconfigure(placeholder(text)) });
			},
			focusEnd() {
				const cm = editor.cm;
				cm.dispatch({ selection: { anchor: cm.state.doc.length } });
				cm.focus();
			},
			refocus() {
				editor.cm.focus();
			},
			destroy() {
				content.removeEventListener("focus", focused);
				content.removeEventListener("blur", blurred);
				fieldKeys.dispose();
				editor.unload();
				editor.cm.destroy();
				container.remove();
			},
		};
	};
}

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

/** The editors a full card holds (its description): one per key the view names, each made once. */
export class Editors {
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
				if (changed) hooks.change(update.state.doc.toString());
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
