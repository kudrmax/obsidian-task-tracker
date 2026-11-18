import { type CSSProperties, memo } from "react";
import { PROPERTY } from "../../design";
import { useData } from "../store";
import { Icon } from "./Icon";

export interface CardProps {
	readonly id: string;
	/** Its depth under its task, 0 for a task. */
	readonly depth?: number;
	/** The copy a finger carries: marked as the task's copy, not its card. */
	readonly copy?: boolean;
}

/**
 * A task's card, by its id: drawn again only when its own face changes (a memoized face over a selector, spec principle
 * 8). The dot of a task in progress, the title fading out on the right, the counter and the description's mark, the date.
 */
export const Card = memo(function Card({ id, depth = 0, copy = false }: CardProps) {
	const face = useData((d) => d.cards[id]);
	if (!face) return null;
	const marked = copy ? { "data-copy": id } : { "data-id": id };
	return (
		<div className="tc-card" {...marked} data-status={face.inProgress ? "inProgress" : "open"} data-priority={face.color ?? undefined} style={{ [PROPERTY.level]: String(depth) } as CSSProperties}>
			<div className="tc-card-title">{face.title}</div>
			{face.count || face.description ? (
				<span className={`tc-meta${face.count && face.description ? " is-pair" : ""}`}>
					{face.count ? <span className="tc-count">{`${face.count.done}/${face.count.total}`}</span> : null}
					{face.description ? <Icon name="description" className="tc-desc-mark" /> : null}
				</span>
			) : null}
			{face.due ? (
				<span className="tc-due">
					<span className="tc-due-day">{face.due.day}</span>
					<span className="tc-due-mon">{face.due.month}</span>
				</span>
			) : null}
		</div>
	);
});
