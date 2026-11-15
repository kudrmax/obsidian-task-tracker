import type { JSX } from "preact";
import { type CardFace, stageName, type TitlePart } from "../model/card";
import type { Branch } from "../model/lists";
import { Icon } from "./icons";

/** A title as the card shows it: the text as typed, each link by its word in the accent. */
export function Title({ parts, links }: { readonly parts: readonly TitlePart[]; readonly links?: boolean }): JSX.Element {
	return (
		<>
			{parts.map((part, i) =>
				part.kind === "text" ? (
					part.text
				) : (
					<span key={i} class="tc-n-link" data-n-act={links ? "link" : undefined} data-n-value={links ? `${part.kind}:${part.target}` : undefined}>
						{part.label}
					</span>
				),
			)}
		</>
	);
}

/** A subtask's branch from its task, and the lines of the tasks further up going on past it; `data-n-key` carries each line's offset to `motion`. */
function Branches({ branch, rowKey }: { readonly branch: Branch; readonly rowKey: string }): JSX.Element {
	return (
		<>
			<span class={branch.last ? "tc-n-branch tc-n-branch-last" : "tc-n-branch tc-n-branch-mid"} />
			{branch.passes.map((pass) => (
				<span key={pass} class="tc-n-branch-pass" data-n-key={`${rowKey}/pass/${pass}`} />
			))}
		</>
	);
}

export interface CardProps {
	readonly rowKey: string;
	readonly face: CardFace;
	readonly branch: Branch | null;
	/** It stands in a list (its subtask counter folds, its level indents it). */
	readonly listed: boolean;
	readonly classes?: string;
	/** Its links are pressed (a menu's copy of the card); on a list's card a tap anywhere is the card's. */
	readonly links?: boolean;
	/** A copy (the carried float): no row key, so `motion` moves no copy as a row. */
	readonly copy?: boolean;
	/** Drawn as another part than a list's card (`tc-n-lifted`, the copy over a menu): its root class, and no pick mark. */
	readonly root?: string;
	/** Attributes of that part (`data-n-part`, `data-n-layer`…). */
	readonly attributes?: Readonly<Record<string, string>>;
}

/** The colours of a card as attributes the stylesheet paints (`data-priority`, `data-label0…`, `data-labels`), as the old screen's `markColours`. */
export function colourAttributes(face: Pick<CardFace, "tint" | "stripes">): Record<string, string> {
	const pairs: (readonly [string, string])[] = face.stripes.map((color, i) => [`data-label${i}`, color] as const);
	if (face.tint) pairs.push(["data-priority", face.tint]);
	if (face.stripes.length > 0) pairs.push(["data-labels", String(face.stripes.length)]);
	return Object.fromEntries(pairs);
}

/**
 * A card of a list (the old screen's `TaskCard`, mark for mark): the dot of a task in progress, the title fading out on
 * the right (a folded task's next step under its own small title), the folder of its project, the counter over the
 * description's mark, the due date or the stage; a card peeking out under it while its subtasks are folded away.
 */
export function Card({ rowKey, face, branch, listed, classes, links, copy, root, attributes }: CardProps): JSX.Element {
	const cls = [root ?? "tc-n-card", listed ? "tc-n-listed" : "", face.over !== null ? "tc-n-card-two" : "", face.folded && listed ? "tc-n-card-folded" : "", classes ?? ""].filter(Boolean).join(" ");
	return (
		<div class={cls} data-n-key={copy ? undefined : rowKey} data-status={face.status} data-n-act={listed ? "card" : undefined} {...colourAttributes(face)} {...attributes}>
			{copy || root !== undefined ? null : (
				<span class="tc-n-pick">
					<Icon name="check" />
				</span>
			)}
			<span class="tc-n-progress-dot" />
			{face.over === null ? (
				<div class="tc-n-card-title" data-n-title="" data-n-part={root === undefined ? undefined : "title"}>
					<Title parts={face.title} links={links} />
				</div>
			) : (
				<div class="tc-n-card-lines">
					<div class="tc-n-card-over">
						<span class="tc-n-card-over-text">{face.over}</span>
					</div>
					<div class="tc-n-card-title" data-n-title="" data-n-part={root === undefined ? undefined : "title"}>
						<Title parts={face.title} links={links} />
					</div>
				</div>
			)}
			{face.project !== null ? (
				<span class="tc-n-project-mark" aria-label={face.project} title={face.project} data-n-act={listed ? "mark" : undefined}>
					<Icon name="project" />
				</span>
			) : null}
			{face.meta ? (
				<span class={face.meta.count !== null && face.meta.description ? "tc-n-meta tc-n-meta-pair" : "tc-n-meta"}>
					{face.meta.count !== null ? (
						<span class={listed ? "tc-n-count tc-n-count-fold" : "tc-n-count"} data-n-act={listed ? "counter" : undefined}>
							{face.meta.count}
						</span>
					) : null}
					{face.meta.description ? <Icon name="description" cls="tc-n-desc-mark" /> : null}
				</span>
			) : null}
			{face.due ? <Due due={face.due} /> : null}
			{face.stage ? (
				<span class="tc-n-stage-mark" aria-label={stageName(face.stage)} title={stageName(face.stage)}>
					<Icon name={face.stage === "today" ? "now" : face.stage} />
				</span>
			) : null}
			{branch ? <Branches branch={branch} rowKey={rowKey} /> : null}
		</div>
	);
}

function Due({ due }: { readonly due: NonNullable<CardFace["due"]> }): JSX.Element {
	const day = due.day !== null ? <span class="tc-n-due-day">{due.day}</span> : null;
	const repeat = due.repeats ? <Icon name="repeat" cls="tc-n-due-repeat" /> : null;
	return (
		<span class={due.day === null ? "tc-n-due tc-n-due-repeat-only" : "tc-n-due"}>
			{due.repeats ? (
				<span class="tc-n-due-top">
					{day}
					{repeat}
				</span>
			) : (
				day
			)}
			{due.month !== null ? <span class="tc-n-due-mon">{due.month}</span> : null}
		</span>
	);
}
