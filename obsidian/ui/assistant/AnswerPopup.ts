import type { AssistantContextResult, AssistantContextWords, AssistantOutcome } from "../../../core/application/contracts";
import { el } from "../dom";
import { ownUndo } from "../fieldUndo";
import { Button } from "../kit/Button";
import { Panel } from "../kit/Panel";
import { Overlay } from "../menu/Overlay";
import { renderTaskCard } from "../TaskCard";
import type { ModEnterHold } from "./modEnter";

/** Draws markdown into an element: Obsidian's renderer in the plugin, plain text in a test. */
export type RenderMarkdown = (el: HTMLElement, markdown: string) => Promise<void>;

/** What the popup shows: an answer or a failure. Stopped shows nothing, so never comes here. */
export type ShownOutcome = Exclude<AssistantOutcome, { kind: "stopped" }>;

/** What the answer's field for what the model missed does with its text: writes it, asks again, logs why a write failed. */
export interface ContextField {
	readonly words: AssistantContextWords;
	write(text: string): Promise<AssistantContextResult>;
	/** The same button pressed again, once the popup has closed. */
	again(): void;
	log(detail: string): void;
	/** ⌘Enter held for the field while it has the focus. */
	readonly modEnter: ModEnterHold;
}

/**
 * The assistant's answer in the middle of the window, in the panel's look over the backdrop: a small title, the chosen
 * task's card as the list draws it (`outcome.card` with `outcome.task`'s marks: a subtask under its parent's title, a
 * folded task's step under the task's), what couldn't be done to it (the core's notice) right under it, the model's reason
 * as markdown, Close. A failure takes the same popup, its words in the reason's place. An answer with a field for what the
 * model missed (`context`) shows it under the reason: once it holds text, Close gives way to Save and Save and ask again
 * (⌘Enter); a write that failed keeps the popup and the text, its line under the field. Escape or the backdrop close it
 * without writing; nothing under it moves. It belongs to the window, not to the view: it comes even when the view was
 * closed.
 */
export class AnswerPopup {
	private readonly overlay: Overlay;
	/** Closed: the rendered markdown's own parts are let go. */
	private readonly closing: (() => void)[] = [];

	static open(outcome: ShownOutcome, render: RenderMarkdown, context: ContextField | null = null, doc: Document = activeDocument): AnswerPopup {
		return new AnswerPopup(outcome, render, context, doc);
	}

	private constructor(outcome: ShownOutcome, render: RenderMarkdown, context: ContextField | null, doc: Document) {
		this.overlay = new Overlay(() => this.close(), doc.body);
		const panel = Panel.over(this.overlay, { root: "tc-panel", cls: outcome.kind === "task" ? "is-answer" : "is-answer is-failure" }, false);
		panel.replace((p) => {
			p.setAttribute("role", "dialog");
			el(p, "div", "tc-answer-title", outcome.title);
			if (outcome.kind === "task") {
				renderTaskCard(p, outcome.task, { day: null, face: outcome.card }).classList.add("tc-answer-card");
				if (outcome.notice !== null) el(p, "div", "tc-answer-notice", outcome.notice);
			}
			const words = el(p, "div", "tc-desc-text tc-answer-note markdown-rendered");
			void render(words, outcome.kind === "task" ? outcome.note : outcome.words);
			const field = context ? AnswerPopup.field(p, context.words) : null;
			const foot = el(p, "div", "tc-answer-foot");
			const close = Button.create(foot, { kind: "pill", tone: "strong", label: "Close", cls: "tc-answer-close", onPress: () => this.close() });
			if (context && field) this.saves(foot, close, field, context);
		});
		this.overlay.show();
	}

	private static field(parent: HTMLElement, words: AssistantContextWords): ContextInput {
		const area = el(parent, "textarea", "tc-answer-field");
		area.placeholder = words.placeholder;
		area.rows = 1;
		ownUndo(area);
		const failed = el(parent, "div", "tc-answer-failed");
		failed.hidden = true;
		return { area, failed };
	}

	/** Save and Save and ask again stand in Close's place while the field holds text; one write at a time. */
	private saves(foot: HTMLElement, close: Button, field: ContextInput, context: ContextField): void {
		let writing = false;
		const save = async (again: boolean) => {
			if (writing || field.area.value === "") return;
			writing = true;
			const result = await context.write(field.area.value);
			writing = false;
			if (!result.ok) {
				context.log(result.detail);
				field.failed.textContent = result.words;
				field.failed.hidden = false;
				return;
			}
			this.close();
			if (again) context.again();
		};
		const plain = Button.create(foot, { kind: "pill", tone: "plain", label: context.words.save, cls: "tc-answer-save", onPress: () => void save(false) });
		const strong = Button.create(foot, { kind: "pill", tone: "strong", label: context.words.saveAndAsk, cls: "tc-answer-again", onPress: () => void save(true) });
		const typed = () => {
			const has = field.area.value !== "";
			close.setHidden(has);
			plain.setHidden(!has);
			strong.setHidden(!has);
			field.failed.hidden = true;
		};
		field.area.addEventListener("input", typed);
		this.closing.push(context.modEnter(field.area, () => void save(true)));
		typed();
	}

	/** Lets go of what the markdown renderer holds once the popup is gone. */
	onClosed(release: () => void): void {
		this.closing.push(release);
	}

	close(): void {
		void this.overlay.close().then(() => this.closing.splice(0).forEach((release) => release()));
	}
}

/** The field and the line under it that says a write failed. */
interface ContextInput {
	readonly area: HTMLTextAreaElement;
	readonly failed: HTMLElement;
}
