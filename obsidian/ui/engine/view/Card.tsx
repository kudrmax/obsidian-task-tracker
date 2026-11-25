import { type CSSProperties, type HTMLAttributes, memo, type ReactNode, useRef } from "react";
import { PROPERTY } from "../../shared/design";
import type { BlockLook } from "../layers/Layers";
import type { CardFace as Face } from "../port";
import { useData, useScreen, useScreenApi } from "../store";
import { ObsidianEditor } from "./ObsidianEditor";
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
	/** A list's card: a tap on its counter folds its subtasks away or shows them (F196); the rest of the card keeps its tap. */
	readonly onFold?: () => void;
}

/**
 * A task's card, by its id, the one face of a task in a list and on the calendar (F91): drawn again only when its own face
 * changes (a memoized face over a selector, spec principle 8). The dot of a task in progress, the title fading out on the
 * right, the counter and the description's mark, the date in a list; on the calendar, its look there (`BlockLook`). A card
 * whose task has left the screen keeps its last face while its row fades (`MovingRows`).
 */
export const Card = memo(function Card({ id, depth = 0, copy = false, block, onFold }: CardProps) {
	const read = useData((d) => d.cards[id]);
	const leaving = useLeaving();
	const last = useRef(read);
	if (read) last.current = read;
	const face = read ?? (leaving ? last.current : undefined);
	const stepping = useScreen((s) => !copy && s.firstStep === id);
	if (!face) return null;
	const marked = copy ? { "data-copy": id } : block ? { "data-block": id, "data-own-press": "" } : { "data-id": id };
	if (stepping) return <FirstStepCard face={face} block={block} depth={depth} />;
	return <CardFace face={face} block={block} onFold={onFold} className={block ? "tc-block-card" : "tc-card"} {...marked} data-collapsed={!block && face.folded ? "true" : undefined} style={block ? undefined : ({ [PROPERTY.level]: String(depth) } as CSSProperties)} />;
});

/**
 * A card whose First step is typed on it (F199–F201; `docs/plugin/tasks.md` «Подзадачи»): ringed in the accent, folded;
 * in a list two lines, the task's title small over the field the step is typed in, on the calendar the block's one line
 * the field, growing down for a long text. Enter or a tap elsewhere write the step, Escape writes nothing.
 */
function FirstStepCard({ face, block, depth }: { readonly face: Face; readonly block?: BlockLook; readonly depth: number }) {
	const api = useScreenApi();
	/** A press in the field is the field's: the card under it neither opens its menu nor lifts. */
	const own = (event: { stopPropagation(): void }) => event.stopPropagation();
	const field = (
		<div className="tc-first-step-line" onClick={own} onPointerDown={own} onMouseDown={own} onTouchStart={own}>
			<ObsidianEditor text="" className="tc-quick-field tc-title-field tc-first-step-field" onEnter={(text) => api.getState().endFirstStep("enter", text)} onEscape={() => api.getState().endFirstStep("escape", "")} onLeave={(_, text) => api.getState().endFirstStep("blur", text())} />
		</div>
	);
	if (block)
		return (
			<div className="tc-block-card is-first-step" data-block={face.id} data-own-press="" data-priority={face.color ?? undefined}>
				{field}
			</div>
		);
	return (
		<div className="tc-card is-two-line is-first-step" data-id={face.id} data-collapsed="true" data-priority={face.color ?? undefined} style={{ [PROPERTY.level]: String(depth) } as CSSProperties}>
			<div className="tc-card-lines">
				<div className="tc-card-over">
					<span className="tc-card-over-text">{face.title}</span>
				</div>
				{field}
			</div>
		</div>
	);
}

/** The element's own attributes besides the face: its marks (`data-…`), its handlers and its style. */
type FaceAttributes = Omit<HTMLAttributes<HTMLDivElement>, "className" | "children"> & { readonly [mark: `data-${string}`]: string | undefined };

/**
 * A task's face drawn once for every place that shows it (spec, principle 8): a list's card, a calendar's block, the copy
 * over a menu's backdrop and a card of a menu's stack. Its status and level on the element, two lines for a folded task's
 * step in a list; `children` after its insides (a task's notes in the menu's copy).
 */
export function CardFace({ face, block, onFold, className, children, ...attributes }: { readonly face: Face; readonly block?: BlockLook; readonly onFold?: () => void; readonly className: string; readonly children?: ReactNode } & FaceAttributes) {
	return (
		<div className={`${className}${!block && face.step !== null ? " is-two-line" : ""}`} data-status={face.inProgress ? "inProgress" : "open"} data-priority={face.color ?? undefined} {...attributes}>
			<CardInsides face={face} block={block} onFold={onFold} />
			{children}
		</div>
	);
}

/**
 * What a card shows inside its edge: its title (a folded task's in a list small over its next step, F79; on the calendar
 * the step alone, F94), the counter and the description's mark, the date in a list, its look on
 * the calendar. The card and its copy over a menu's backdrop draw the same insides.
 */
function CardInsides({ face, block, onFold }: { readonly face: Face; readonly block?: BlockLook; readonly onFold?: () => void }) {
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
					{face.count ? (
						<span
							className="tc-count"
							onClick={
								onFold &&
								((event) => {
									event.stopPropagation();
									onFold();
								})
							}
						>{`${face.count.done}/${face.count.total}`}</span>
					) : null}
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
			) : face.stage ? (
				<span className="tc-stage-mark">
					<Icon name={face.stage} />
				</span>
			) : null}
		</>
	);
}
