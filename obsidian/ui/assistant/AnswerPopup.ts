import type { AssistantOutcome } from "../../../core/application/contracts";
import { el } from "../dom";
import { Button } from "../kit/Button";
import { Panel } from "../kit/Panel";
import { Overlay } from "../menu/Overlay";
import { renderTaskCard } from "../TaskCard";

/** Draws markdown into an element: Obsidian's renderer in the plugin, plain text in a test. */
export type RenderMarkdown = (el: HTMLElement, markdown: string) => Promise<void>;

/** What the popup shows: an answer or a failure. Stopped shows nothing, so never comes here. */
export type ShownOutcome = Exclude<AssistantOutcome, { kind: "stopped" }>;

/**
 * The assistant's answer in the middle of the window, in the panel's look over the backdrop: a small title, the chosen
 * task's card as the list draws it (`outcome.card` with `outcome.task`'s marks: a subtask under its parent's title, a
 * folded task's step under the task's), what couldn't be done to it (the core's notice) right under it, the model's reason
 * as markdown, Close. A failure takes the same popup, its words in
 * the reason's place. Escape, Close or the backdrop close it; nothing under it moves. It belongs to the window, not to
 * the view: it comes even when the view was closed.
 */
export class AnswerPopup {
	private readonly overlay: Overlay;
	/** Closed: the rendered markdown's own parts are let go. */
	private readonly closing: (() => void)[] = [];

	static open(outcome: ShownOutcome, render: RenderMarkdown, doc: Document = activeDocument): AnswerPopup {
		return new AnswerPopup(outcome, render, doc);
	}

	private constructor(outcome: ShownOutcome, render: RenderMarkdown, doc: Document) {
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
			const foot = el(p, "div", "tc-answer-foot");
			Button.create(foot, { kind: "pill", tone: "strong", label: "Close", cls: "tc-answer-close", onPress: () => this.close() });
		});
		this.overlay.show();
	}

	/** Lets go of what the markdown renderer holds once the popup is gone. */
	onClosed(release: () => void): void {
		this.closing.push(release);
	}

	close(): void {
		void this.overlay.close().then(() => this.closing.splice(0).forEach((release) => release()));
	}
}
