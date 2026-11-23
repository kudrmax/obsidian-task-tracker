import { type CSSProperties, type HTMLAttributes, memo, type ReactNode, type Ref, useRef } from "react";
import { PROPERTY } from "../../shared/design";
import type { BlockLook } from "../layers/Layers";
import type { CardFace as Face } from "../port";
import { useData, useScreen } from "../store";
import { Icon } from "./Icon";
import { useLeaving } from "./MovingRow";

export interface CardProps {
	readonly id: string;
	/** Its depth under its task, 0 for a task. */
	readonly depth?: number;
	/** The copy a finger carries: marked as the task's copy, not its card. */
	readonly copy?: boolean;
	/** On the calendar: the card's look there; absent, the card of a list. */
	readonly block?: BlockLook;
	/** On the carried copy's corner: how many tasks the stack holds (F149). */
	readonly badge?: ReactNode;
}

/**
 * A task's card, by its id, the one face of a task in a list and on the calendar (F91): drawn again only when its own face
 * changes (a memoized face over a selector, spec principle 8). The dot of a task in progress, the title fading out on the
 * right, the counter and the description's mark, the date in a list; on the calendar, its look there (`BlockLook`). A card
 * whose task has left the screen keeps its last face while its row fades (`MovingRows`).
 */
export const Card = memo(function Card({ id, depth = 0, copy = false, block, badge = null }: CardProps) {
	const read = useData((d) => d.cards[id]);
	const leaving = useLeaving();
	const last = useRef(read);
	if (read) last.current = read;
	/** Picked for actions on several tasks (F135, F138): the selection's ground, and in Select tasks the circle's check. */
	const picked = useScreen((s) => !block && s.picked.includes(id));
	/** The task the search led to: the ring until the screen is touched (F256). */
	const ringed = useScreen((s) => !copy && s.ringed === id);
	/** Carried along in a stack, it waits in its place, dashed, until the stack lands (F149, the design's «Массовые действия»). */
	const waiting = useScreen((s) => !copy && s.along.includes(id));
	const face = read ?? (leaving ? last.current : undefined);
	if (!face) return null;
	const marked = copy ? { "data-copy": id } : block ? { "data-block": id, "data-own-press": "" } : { "data-id": id };
	const marks = `${picked ? " is-selected" : ""}${ringed ? " is-found" : ""}${waiting ? " is-waiting" : ""}`;
	return (
		<CardFace face={face} block={block} className={`${block ? "tc-block-card" : "tc-card"}${marks}`} {...marked} data-collapsed={!block && face.folded ? "true" : undefined} style={block ? undefined : ({ [PROPERTY.level]: String(depth) } as CSSProperties)}>
			{block ? null : PICK_CIRCLE}
			{badge}
		</CardFace>
	);
});

/** The circle Select tasks shows at a list card's start (the design's «Выбор задач»): empty, or the accent with a check once picked; out of sight otherwise. */
const PICK_CIRCLE = (
	<span className="tc-pick" aria-hidden="true">
		<Icon name="check" />
	</span>
);

/** The element's own attributes besides the face: its marks (`data-…`), its handlers and its style. */
type FaceAttributes = Omit<HTMLAttributes<HTMLDivElement>, "className" | "children"> & { readonly [mark: `data-${string}`]: string | undefined };

/**
 * A task's face drawn once for every place that shows it (spec, principle 8): a list's card, a calendar's block, the copy
 * over a menu's backdrop and a card of a menu's stack. Its status and level on the element, two lines for a folded task's
 * step in a list; `children` after its insides (a task's notes in the menu's copy).
 */
export function CardFace({ face, block, lines, className, children, ref, ...attributes }: { readonly face: Face; readonly block?: BlockLook; readonly lines?: FoundLines; readonly className: string; readonly children?: ReactNode; readonly ref?: Ref<HTMLDivElement> } & FaceAttributes) {
	const twoLine = !block && (face.step !== null || (lines?.over ?? null) !== null);
	return (
		<div ref={ref} className={`${className}${twoLine ? " is-two-line" : ""}`} data-status={face.inProgress ? "inProgress" : "open"} data-priority={face.color ?? undefined} {...attributes}>
			<CardInsides face={face} block={block} lines={lines} />
			{children}
		</div>
	);
}

/**
 * A found task's title lines on its card (the search, F252, F254): its found words picked out (`title`, null: as the card
 * draws it), its place among the projects small over it (`over`, in place of a folded task's own title), the found line of
 * its project's name or its notes under it (`under`).
 */
export interface FoundLines {
	readonly over: string | null;
	readonly title: ReactNode | null;
	readonly under: ReactNode | null;
}

function FoundTitle({ face, lines }: { readonly face: Face; readonly lines: FoundLines }) {
	const over = lines.over ?? (face.step === null ? null : face.title);
	const title = <div className="tc-card-title">{face.step === null ? (lines.title ?? face.title) : face.step}</div>;
	const main = lines.under ? (
		<div className="tc-hit-text">
			{title}
			{lines.under}
		</div>
	) : (
		title
	);
	if (over === null) return main;
	return (
		<div className="tc-card-lines">
			<div className="tc-card-over">
				<span className="tc-card-over-text">{over}</span>
			</div>
			{main}
		</div>
	);
}

/**
 * What a card shows inside its edge: its title (a folded task's in a list small over its next step, F79; on the calendar
 * the step alone, F94), the counter and the description's mark, the date in a list, its look on
 * the calendar. The card and its copy over a menu's backdrop draw the same insides.
 */
function CardInsides({ face, block, lines }: { readonly face: Face; readonly block?: BlockLook; readonly lines?: FoundLines }) {
	return (
		<>
			{lines ? (
				<FoundTitle face={face} lines={lines} />
			) : block || face.step === null ? (
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
