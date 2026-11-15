import type { JSX } from "preact";
import { type CardFace, stageName, type TitlePart } from "../model/card";
import type { Branch } from "../model/lists";
import { DescriptionMark, Icon, RepeatMark } from "./icons";

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

/**
 * A subtask's branch from its task (its end bending in under the last, a junction going on past any other), and the
 * lines of the tasks further up going on past it; `data-n-key` carries each line's offset to `motion`.
 */
export function Branches({ branch, rowKey }: { readonly branch: Branch; readonly rowKey: string }): JSX.Element {
	return (
		<>
			{branch.last ? <span class="tc-n-branch-end" /> : <span class="tc-n-branch" />}
			{branch.passes.map((pass) => (
				<span key={pass} class="tc-n-branch-pass" data-n-key={`${rowKey}/pass/${pass}`} />
			))}
		</>
	);
}

/**
 * What a card is drawn as: a list's card (`listed`: a tap opens its menu, its counter folds, its level indents it); a
 * line typed and not yet written, a found task's card (`plain`); the copy carried under the finger (`float`); the copy
 * over a menu (`lifted`, `whole`: its title on as many lines as it takes; `probe`: the whole copy measured unseen).
 */
export type CardAs = "listed" | "plain" | "float" | "lifted" | "whole" | "probe";

/** What a card shows of what is under way: each a state of its own (`is-…`), none sizing it. */
export interface CardStates {
	/** Waiting where it stood under its field (a rename), or carried out of sight. */
	readonly away?: boolean;
	readonly picked?: boolean;
	/** Select tasks is on: its circle shows. */
	readonly picking?: boolean;
	/** Carried: its place waits, dashed. */
	readonly waiting?: boolean;
	/** A drop lands on it: its place until the float is down. */
	readonly arriving?: boolean;
	/** A search found it: the ring. */
	readonly found?: boolean;
	/** The menu's copy stretched to its whole title on one line: no fade. */
	readonly stretched?: boolean;
	/** The bulk menu's copies of the picked cards. */
	readonly selected?: boolean;
	/** Drawn hidden to be measured before it shows. */
	readonly measuring?: boolean;
}

export interface CardProps {
	readonly rowKey: string;
	readonly face: CardFace;
	readonly branch: Branch | null;
	readonly as: CardAs;
	readonly states?: CardStates;
	/** Its links are pressed (a menu's copy of the card); on a list's card a tap anywhere is the card's. */
	readonly links?: boolean;
	/** Attributes of a copy over a layer (`data-n-part`, `data-n-layer`…). */
	readonly attributes?: Readonly<Record<string, string>>;
	/** The full card's own: its taps are the full card's (`full:`), and its circle ticks the task. */
	readonly full?: boolean;
	/** Drawn without the circle select mode shows (a found task's card, as the old search drew it). */
	readonly bare?: boolean;
}

/** The colours of a card as attributes the stylesheet paints (`data-priority`, `data-label0…`, `data-labels`), as the old screen's `markColours`. */
export function colourAttributes(face: Pick<CardFace, "tint" | "stripes">): Record<string, string> {
	const pairs: (readonly [string, string])[] = face.stripes.map((color, i) => [`data-label${i}`, color] as const);
	if (face.tint) pairs.push(["data-priority", face.tint]);
	if (face.stripes.length > 0) pairs.push(["data-labels", String(face.stripes.length)]);
	return Object.fromEntries(pairs);
}

/** What a card holds, whatever it is drawn as. */
function Inside({ face, branch, rowKey, listed, links, full, pick, titled }: { readonly face: CardFace; readonly branch: Branch | null; readonly rowKey: string; readonly listed: boolean; readonly links: boolean; readonly full: boolean; readonly pick: boolean; readonly titled: boolean }): JSX.Element {
	const titlePart = titled ? "title" : undefined;
	return (
		<>
			{pick ? (
				<span class="tc-n-pick" data-n-act={full ? "full:tick" : undefined}>
					<Icon name="check" />
				</span>
			) : null}
			<span class="tc-n-progress-dot" />
			{face.over === null ? (
				<div class="tc-n-card-title" data-n-title="" data-n-part={titlePart}>
					<Title parts={face.title} links={links} />
				</div>
			) : (
				<div class="tc-n-card-lines">
					<div class="tc-n-card-over">
						<span class="tc-n-card-over-text">{face.over}</span>
					</div>
					<div class="tc-n-card-title" data-n-title="" data-n-part={titlePart}>
						<Title parts={face.title} links={links} />
					</div>
				</div>
			)}
			{face.project !== null ? (
				<span class="tc-n-project-mark" aria-label={face.project} title={face.project} data-n-act={listed ? (full ? "full:mark" : "mark") : undefined}>
					<Icon name="project" />
				</span>
			) : null}
			{face.meta ? <Meta meta={face.meta} fold={listed} full={full} /> : null}
			{face.due ? <Due due={face.due} /> : null}
			{face.stage ? (
				<span class="tc-n-stage-mark" aria-label={stageName(face.stage)} title={stageName(face.stage)}>
					<Icon name={face.stage === "today" ? "now" : face.stage} />
				</span>
			) : null}
			{branch ? <Branches branch={branch} rowKey={rowKey} /> : null}
		</>
	);
}

/**
 * A card (the old screen's `TaskCard`, mark for mark): the dot of a task in progress, the title fading out on the right
 * (a folded task's next step under its own small title), the folder of its project, the counter over the description's
 * mark, the due date or the stage; a card peeking out under it while its subtasks are folded away.
 */
export function Card({ rowKey, face, branch, as, states = {}, links = false, attributes, full = false, bare = false }: CardProps): JSX.Element {
	const s = states;
	const colours = colourAttributes(face);
	const inside = (pick: boolean, listed: boolean, titled: boolean) => <Inside face={face} branch={branch} rowKey={rowKey} listed={listed} links={links} full={full} pick={pick} titled={titled} />;
	switch (as) {
		case "listed":
			return (
				<div
					class={`tc-n-card ${face.folded ? "is-folded" : ""} ${s.away ? "is-away" : ""} ${s.picked ? "is-picked" : ""} ${s.picking ? "is-picking" : ""} ${s.waiting ? "is-waiting" : ""} ${s.arriving ? "is-arriving" : ""} ${s.found ? "is-found" : ""}`}
					data-n-key={rowKey}
					data-row={rowKey}
					data-status={face.status}
					data-n-act={full ? "full:card" : "card"}
					{...colours}
				>
					{inside(!bare, true, false)}
				</div>
			);
		case "plain":
			return (
				<div class={`tc-n-card ${s.found ? "is-found" : ""}`} data-n-key={rowKey} data-status={face.status} {...colours}>
					{inside(!bare, false, false)}
				</div>
			);
		case "float":
			return (
				<div class="tc-n-card" data-status={face.status} {...colours}>
					{inside(false, false, false)}
				</div>
			);
		case "lifted":
			return (
				<div class={`tc-n-lifted ${s.stretched ? "is-stretched" : ""} ${s.selected ? "is-selected" : ""} ${s.measuring ? "is-measuring" : ""}`} data-n-key={rowKey} data-status={face.status} {...colours} {...attributes}>
					{inside(false, false, true)}
				</div>
			);
		case "whole":
			return (
				<div class={`tc-n-lifted tc-n-lifted-whole ${s.selected ? "is-selected" : ""} ${s.measuring ? "is-measuring" : ""}`} data-n-key={rowKey} data-status={face.status} {...colours} {...attributes}>
					{inside(false, false, true)}
				</div>
			);
		case "probe":
			return (
				<div class="tc-n-lifted tc-n-lifted-whole tc-n-lifted-probe" data-status={face.status} {...colours} {...attributes}>
					{inside(false, false, true)}
				</div>
			);
	}
}

/** The counter over the description's mark; the two together draw smaller, each its own kind. A list's counter folds the subtasks away. */
export function Meta({ meta, fold, full }: { readonly meta: NonNullable<CardFace["meta"]>; readonly fold: boolean; readonly full: boolean }): JSX.Element {
	const act = fold ? (full ? "full:counter" : "counter") : undefined;
	const count =
		meta.count === null ? null : fold ? (
			<span class="tc-n-fold-count" data-n-act={act}>
				{meta.count}
			</span>
		) : (
			<span class="tc-n-count">{meta.count}</span>
		);
	return meta.count !== null && meta.description ? (
		<span class="tc-n-meta-pair">
			{count}
			<DescriptionMark />
		</span>
	) : (
		<span class="tc-n-meta">
			{count}
			{meta.description ? <DescriptionMark /> : null}
		</span>
	);
}

/** The due day over its month, the repeat's mark beside the day; a repeat with no date its mark alone, a corner of its own. */
export function Due({ due }: { readonly due: NonNullable<CardFace["due"]> }): JSX.Element {
	if (due.day === null)
		return (
			<span class="tc-n-due-alone">
				<span class="tc-n-due-top">
					<RepeatMark />
				</span>
				{due.month !== null ? <span class="tc-n-due-mon">{due.month}</span> : null}
			</span>
		);
	const day = <span class="tc-n-due-day">{due.day}</span>;
	return (
		<span class="tc-n-due">
			{due.repeats ? (
				<span class="tc-n-due-top">
					{day}
					<RepeatMark />
				</span>
			) : (
				day
			)}
			{due.month !== null ? <span class="tc-n-due-mon">{due.month}</span> : null}
		</span>
	);
}
