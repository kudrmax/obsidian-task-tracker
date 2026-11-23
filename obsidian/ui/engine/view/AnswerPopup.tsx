import { useEffect, useRef, useState } from "react";
import { CenterLayer } from "../layers/Popover";
import type { Answer } from "../port";
import { CardFace } from "./Card";
import { useHost } from "./host";
import { ObsidianEditor } from "./ObsidianEditor";

/**
 * The assistant's answer in the middle of the window (F264, F265, F312): a small title, the chosen task's card as the list
 * draws it, what couldn't be done to it under the card, the model's reason in Obsidian's markdown, and Close. An answer
 * with a field for what the model missed shows it under the reason: once it holds text, Close gives way to Save and Save
 * and ask again (⌘Enter in the field); a write that failed keeps the popup and the text, its line under the field. Escape
 * or a press beside it close it writing nothing. A failure takes the same popup, its words in the reason's place.
 */
export function AnswerPopup({ answer, onGone }: { readonly answer: Answer; readonly onGone: () => void }) {
	const { layerRoot } = useHost();
	const [open, setOpen] = useState(true);
	const [text, setText] = useState("");
	const [failed, setFailed] = useState<string | null>(null);
	/** One write at a time; once one took, the popup is closing and nothing more is saved. */
	const writing = useRef(false);
	const field = answer.kind === "task" ? answer.field : null;
	const save = async (again: boolean) => {
		if (!field || writing.current || !open || text === "") return;
		writing.current = true;
		const fault = await field.write(text);
		writing.current = false;
		if (fault !== null) return setFailed(fault);
		setOpen(false);
		if (again) field.again();
	};
	return (
		<CenterLayer open={open} onClose={() => setOpen(false)} onGone={onGone} root={layerRoot} label={answer.title} className={`is-answer${answer.kind === "failed" ? " is-failure" : ""}`}>
			<div className="tc-answer-title">{answer.title}</div>
			{answer.kind === "task" ? (
				<>
					<CardFace face={answer.face} className="tc-card tc-answer-card" />
					{answer.notice !== null ? <div className="tc-answer-notice">{answer.notice}</div> : null}
				</>
			) : null}
			<AnswerNote words={answer.kind === "task" ? answer.note : answer.words} />
			{field ? (
				<>
					<ObsidianEditor
						text=""
						lines
						className="tc-answer-field"
						placeholder={field.placeholder}
						onChange={(typed) => {
							setText(typed);
							setFailed(null);
						}}
						onEscape={() => setOpen(false)}
						onModEnter={() => void save(true)}
					/>
					{failed !== null ? <div className="tc-answer-failed">{failed}</div> : null}
				</>
			) : null}
			<div className="tc-answer-foot">
				{field && text !== "" ? (
					<>
						<button type="button" className="tc-btn is-pill is-plain tc-answer-save" onClick={() => void save(false)}>
							{field.save}
						</button>
						<button type="button" className="tc-btn is-pill is-strong tc-answer-again" onClick={() => void save(true)}>
							{field.saveAndAsk}
						</button>
					</>
				) : (
					<button type="button" className="tc-btn is-pill is-strong tc-answer-close" onClick={() => setOpen(false)}>
						Close
					</button>
				)}
			</div>
		</CenterLayer>
	);
}

/** The model's reason, or a failure's words, drawn by Obsidian's markdown for as long as the popup shows it. */
function AnswerNote({ words }: { readonly words: string }) {
	const { markdown, sourcePath } = useHost();
	const note = useRef<HTMLDivElement>(null);
	useEffect(() => (note.current ? markdown(words, note.current, sourcePath) : undefined), [markdown, words, sourcePath]);
	return <div ref={note} className="tc-desc-text tc-answer-note markdown-rendered" />;
}
