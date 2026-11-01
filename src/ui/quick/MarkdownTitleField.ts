import { EditorState, Prec, type Transaction, type TransactionSpec } from "@codemirror/state";
import { EditorView, placeholder } from "@codemirror/view";
import type { App } from "obsidian";
import { el } from "../dom";
import { type EditorHost, EmbeddedEditor } from "../markdown/EmbeddedEditor";
import { composingKey, LINE_BREAK, oneLine, type TitleField, type TitleFieldOptions } from "./TitleField";

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

	constructor(app: App, host: EditorHost, sourcePath: string, parent: HTMLElement, opts: TitleFieldOptions) {
		this.el = el(parent, "div", "tc-title-field");
		const { events } = opts;
		const key = (run: () => void) => () => {
			if (this.composing) return false;
			run();
		};
		this.editor = new EmbeddedEditor(app, host, sourcePath, this.el, oneLine(opts.text), {
			extensions: [
				placeholder(opts.placeholder),
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
		const content = this.editor.contentDOM;
		content.setAttribute("enterkeyhint", "next");
		content.addEventListener("blur", () => events.onBlur());
		this.quiet = false;
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

	selectAll(): void {
		this.editor.selectAll();
	}

	focus(): void {
		this.editor.focus();
	}

	owns(target: Element): boolean {
		return this.el.contains(target) || target.closest(EDITOR_PARTS) !== null;
	}

	destroy(): void {
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
