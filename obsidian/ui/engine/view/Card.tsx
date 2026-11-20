import { createContext, type CSSProperties, memo } from "react";
import { PROPERTY } from "../../design";
import type { CardFace } from "../port";
import { useData } from "../store";
import { Icon } from "./Icon";

/**
 * What a task's card shows on the calendar besides what it shows in a list (F91, F93, F94): its corner (its start in a stack, its length when shorter than the card), the moving edge's
 * time on a pill while a dot is pulled, and the start written on its dashed place while carried. No due date there.
 */
export interface BlockLook {
	readonly corner: readonly [string, string] | null;
	readonly pill: string | null;
	readonly clock: string;
}

/** How a block pressed on the calendar looks there (its corner, its pill): its copy over the menu's backdrop is drawn the same. */
export const PressedLook = createContext<{ current: BlockLook | null }>({ current: null });

export interface CardProps {
	readonly id: string;
	/** Its depth under its task, 0 for a task. */
	readonly depth?: number;
	/** The copy a finger carries: marked as the task's copy, not its card. */
	readonly copy?: boolean;
	/** On the calendar: the card's look there; absent, the card of a list. */
	readonly block?: BlockLook;
}

/**
 * A task's card, by its id, the one face of a task in a list and on the calendar (F91): drawn again only when its own face
 * changes (a memoized face over a selector, spec principle 8). The dot of a task in progress, the title fading out on the
 * right, the counter and the description's mark, the date in a list; on the calendar, its look there (`BlockLook`).
 */
export const Card = memo(function Card({ id, depth = 0, copy = false, block }: CardProps) {
	const face = useData((d) => d.cards[id]);
	if (!face) return null;
	const marked = copy ? { "data-copy": id } : block ? { "data-block": id, "data-own-press": "" } : { "data-id": id };
	return (
		<div className={`${block ? "tc-block-card" : "tc-card"}${!block && face.step !== null ? " is-two-line" : ""}`} {...marked} data-collapsed={!block && face.folded ? "true" : undefined} data-status={face.inProgress ? "inProgress" : "open"} data-priority={face.color ?? undefined} style={block ? undefined : ({ [PROPERTY.level]: String(depth) } as CSSProperties)}>
			<CardInsides face={face} block={block} />
		</div>
	);
});

/**
 * What a card shows inside its edge: its title (a folded task's in a list small over its next step, F79; on the calendar
 * the step alone, F94), the counter and the description's mark, the date in a list, its look on
 * the calendar. The card and its copy over a menu's backdrop draw the same insides.
 */
export function CardInsides({ face, block }: { readonly face: CardFace; readonly block?: BlockLook }) {
	return (
		<>
			{block || face.step === null ? (
				<div className="tc-card-title">{face.step ?? face.title}</div>
			) : (
				<div className="tc-card-lines">
					<div className="tc-card-over">
						<span className="tc-card-over-text">{face.title}</span>
					</div>
					<div className="tc-card-title">{face.step}</div>
				</div>
			)}
			{face.count || face.description ? (
				<span className={`tc-meta${face.count && face.description ? " is-pair" : ""}`}>
					{face.count ? <span className="tc-count">{`${face.count.done}/${face.count.total}`}</span> : null}
					{face.description ? <Icon name="description" className="tc-desc-mark" /> : null}
				</span>
			) : null}
			{block ? (
				<>
					<span className={`tc-block-meta${block.corner ? "" : " is-hidden"}`}>
						<span>{block.corner?.[0]}</span>
						<span>{block.corner?.[1]}</span>
					</span>
					<span className="tc-block-pill">{block.pill}</span>
					<span className="tc-slot-time">{block.clock}</span>
				</>
			) : face.due ? (
				<span className="tc-due">
					<span className="tc-due-day">{face.due.day}</span>
					<span className="tc-due-mon">{face.due.month}</span>
				</span>
			) : null}
		</>
	);
}
