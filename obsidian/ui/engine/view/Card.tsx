import { type CSSProperties, memo } from "react";
import { PROPERTY } from "../../design";
import { useData } from "../store";
import { Icon } from "./Icon";

/**
 * What a task's card shows on the calendar besides what it shows in a list (F91, F93, F94): the name it takes there (a
 * folded task's next step), its corner (its start in a stack, its length when shorter than the card), the moving edge's
 * time on a pill while a dot is pulled, and the start written on its dashed place while carried. No due date there.
 */
export interface BlockLook {
	readonly step: string | null;
	readonly corner: readonly [string, string] | null;
	readonly pill: string | null;
	readonly clock: string;
}

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
		<div className={block ? "tc-block-card" : "tc-card"} {...marked} data-status={face.inProgress ? "inProgress" : "open"} data-priority={face.color ?? undefined} style={block ? undefined : ({ [PROPERTY.level]: String(depth) } as CSSProperties)}>
			<div className="tc-card-title">{block?.step ?? face.title}</div>
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
		</div>
	);
});
