import { EditorState, Prec, type Transaction, type TransactionSpec } from "@codemirror/state";
import { EditorView, placeholder } from "@codemirror/view";
import { type App, Scope } from "obsidian";
import { el } from "../dom";
import { type EditorHost, EmbeddedEditor } from "../markdown/EmbeddedEditor";
import { LINE_BREAK, oneLine } from "../../application/contracts";
import { composingKey, type TitleField, type TitleFieldOptions } from "./TitleField";

/** What Obsidian's editor shows for the field outside it: the note search, and on the phone its toolbar over the keyboard. */
const EDITOR_PARTS = ".suggestion-container, .mobile-toolbar";

/**
 * The title typed in Obsidian's own editor, as in a note in Live Preview: `[[` opens the note search, a link shows its
 * word. Enter, Escape and Tab are the owner's, unless the note search is open: then they are the search's. The text stays
 * one line, which wraps: a line break pasted in becomes a space.
 */
export class MarkdownTitleField implements TitleField {
	readonly el: HTMLElement;
	private readonly editor: EmbeddedEditor;
	/** A text set by the owner, the first one too, is not input. */
	private quiet = true;
	/** The key down now commits an input method's candidate: it is not the owner's. */
	private composing = false;
	/** What shows while the field is empty: the editor's placeholder draws this node, whose text the owner may change. */
	private readonly hint: HTMLElement;
	/**
	 * The field's own keys, ahead of Obsidian's hotkeys while it has the focus: Option+Tab may be a command's (Templater
	 * jumps to the next cursor on it), which would otherwise take it before the editor sees it.
	 */
	private readonly scope: Scope;
	private readonly app: App;
	private scoped = false;

	constructor(app: App, host: EditorHost, sourcePath: string, parent: HTMLElement, opts: TitleFieldOptions) {
		this.el = el(parent, "div", "tc-title-field");
		this.hint = el(null, "span", "", opts.placeholder);
		const { events } = opts;
		const key = (run: () => void) => () => {
			if (this.composing) return false;
			run();
		};
		this.editor = new EmbeddedEditor(app, host, sourcePath, this.el, oneLine(opts.text), {
			extensions: [
				placeholder(() => this.hint),
				EditorState.transactionFilter.of(oneLineFilter),
				Prec.highest(
					EditorView.domEventHandlers({
						keydown: (e) => {
							this.composing = composingKey(e);
							return false;
						},
					}),
				),
			],
			keys: [
				{ key: "Enter", run: key(() => events.onEnter()), shift: key(() => events.onEnter()) },
				{ key: "Escape", run: key(() => events.onEscape()) },
				{ key: "Tab", run: key(() => events.onTab(false)), shift: key(() => events.onTab(true)) },
			],
			onChange: () => {
				if (!this.quiet) events.onInput();
			},
		});
		this.app = app;
		this.scope = new Scope(app.scope);
		this.scope.register(["Alt"], "Tab", () => {
			if (!this.composing) events.onSwitch();
			return false;
		});
		const content = this.editor.contentDOM;
		content.setAttribute("enterkeyhint", "next");
		content.addEventListener("focus", () => this.holdKeys(true));
		content.addEventListener("blur", () => {
			this.holdKeys(false);
			events.onBlur();
		});
		this.quiet = false;
	}

	private holdKeys(on: boolean): void {
		if (on === this.scoped) return;
		this.scoped = on;
		if (on) this.app.keymap.pushScope(this.scope);
		else this.app.keymap.popScope(this.scope);
	}

	setPlaceholder(text: string): void {
		this.hint.textContent = text;
	}

	get text(): string {
		return oneLine(this.editor.value);
	}

	get focused(): boolean {
		return this.editor.focused;
	}

	setText(text: string): void {
		this.quiet = true;
		try {
			this.editor.setValue(text);
		} finally {
			this.quiet = false;
		}
	}

	focusEnd(): void {
		this.editor.focusEnd();
	}

	focus(): void {
		this.editor.focus();
	}

	owns(target: Element): boolean {
		return this.el.contains(target) || target.closest(EDITOR_PARTS) !== null;
	}

	destroy(): void {
		this.holdKeys(false);
		this.editor.destroy();
		this.el.remove();
	}
}

/** Each line break that lands in the text, pasted or dropped, becomes a space in the same change. */
function oneLineFilter(tr: Transaction): TransactionSpec | readonly TransactionSpec[] {
	if (!tr.docChanged) return tr;
	const breaks = [...tr.newDoc.toString().matchAll(LINE_BREAK)].map((m) => ({ from: m.index ?? 0, to: (m.index ?? 0) + m[0].length, insert: " " }));
	return breaks.length === 0 ? tr : [tr, { changes: breaks, sequential: true }];
}
