import { type CSSProperties, memo } from "react";
import { type Branch, type CardDue, cardDue, type PriorityColor, type ProjectsStage, textParts, type TaskItem } from "../../../core/application/contracts";
import { dayOfMonth, monthAbbreviation } from "../dates";
import { PROPERTY } from "../design";
import { LABEL_SLOTS } from "../priorityColors";
import type { LocalDate } from "../types";
import { Icon } from "./Icon";
import { useScreen } from "./ScreenContext";

/** A title as typed, each link by its word (`textParts`): a link opens only from the menu's copy, never from the card. */
export function Title({ text, className = "tc-card-title" }: { readonly text: string; readonly className?: string }) {
	return (
		<div className={className}>
			{textParts(text).map((part, i) =>
				part.kind === "text" ? (
					part.text
				) : (
					<span key={i} className="tc-link" data-kind={part.kind} data-target={part.target}>
						{part.label}
					</span>
				),
			)}
		</div>
	);
}

/** A card's paint: its first colour tints it as a priority does; a card of several also carries each, as stripes or a blend. */
export function paintOf(colors: readonly PriorityColor[]): Record<string, string> {
	const paint: Record<string, string> = {};
	if (colors.length > 0) paint["data-priority"] = colors[0];
	if (colors.length > 1) {
		paint["data-labels"] = String(colors.length);
		LABEL_SLOTS.forEach((slot, i) => {
			if (i < colors.length) paint[slot.attribute] = colors[i];
		});
	}
	return paint;
}

/** The counter of subtasks over the description's mark, either alone when the task has only that. */
function Meta({ item }: { readonly item: TaskItem }) {
	if (!item.progress && !item.description) return null;
	return (
		<span className={`tc-meta${item.progress && item.description ? " is-pair" : ""}`}>
			{item.progress ? <span className="tc-count">{`${item.progress.done}/${item.progress.total}`}</span> : null}
			{item.description ? <Icon name="description" className="tc-desc-mark" /> : null}
		</span>
	);
}

/** By project, the stage's mark on the right of a card: the symbols of the wheel and of Backlog's title. */
const STAGES = {
	today: { icon: "now", name: "Today" },
	soon: { icon: "soon", name: "Soon" },
	inbox: { icon: "inbox", name: "Inbox" },
	backlog: { icon: "backlog", name: "Backlog" },
	done: { icon: "done", name: "Done" },
} as const;

/** The corner: the due date as any card's, or by project the stage's mark, or for a dated card its date. */
function Corner({ item, day, stage }: { readonly item: TaskItem; readonly day: LocalDate | null; readonly stage: ProjectsStage | null | undefined }) {
	if (!stage) return <Due due={cardDue(item, day)} />;
	if (stage.kind === "date") return <Due due={{ date: stage.date, repeats: cardDue(item, null)?.repeats ?? false }} />;
	const shown = STAGES[stage.kind];
	return (
		<span className="tc-stage-mark" aria-label={shown.name} title={shown.name}>
			<Icon name={shown.icon} />
		</span>
	);
}

/** The date in the corner, its day over its month, the repeat's mark beside the day; a repeat with no date its mark alone. */
function Due({ due }: { readonly due: CardDue | null }) {
	if (!due) return null;
	const date = due.date ? <span className="tc-due-day">{dayOfMonth(due.date)}</span> : null;
	return (
		<span className={`tc-due${due.date ? "" : " is-repeat-only"}`}>
			{due.repeats ? (
				<span className="tc-due-top">
					{date}
					<Icon name="repeat" className="tc-due-repeat" />
				</span>
			) : (
				date
			)}
			{due.date ? <span className="tc-due-mon">{monthAbbreviation(due.date)}</span> : null}
		</span>
	);
}

/** The folder of the task's project; the Mac's tooltip names it. (A tap choosing the project comes with the filter's title, stage 3.) */
function ProjectMark({ item }: { readonly item: TaskItem }) {
	const project = item.project;
	if (!project?.mark) return null;
	return (
		<span className="tc-project-mark" aria-label={project.name} title={project.name}>
			<Icon name="project" />
		</span>
	);
}

/**
 * A card of a list, by its task's id: drawn again only when that task's data changes. The dot of a task in progress, the
 * title fading out on the right (a folded task's next step under its own title, small), the project's folder, the
 * counter and the description's mark, the due date.
 */
export interface CardProps {
	readonly id: string;
	readonly day: LocalDate | null;
	/** Its depth under its task, 0 for a task. */
	readonly level?: number;
	/** The branch lines from its task: the core's (`branchOf`); none at the top level. */
	readonly branch?: Branch | null;
	/** By project: the stage's corner (`RowModel.stage`); undefined: the card's own. */
	readonly stage?: ProjectsStage | null;
	/** A copy of the card (the one a finger carries): marked as the task's copy, not as its card. */
	readonly copy?: boolean;
	/** Drawn but unseen: a card just let go, waiting at its place for its copy to land there. */
	readonly unseen?: boolean;
	/** The card a carried one would go under, outlined (a look the stand switches on). */
	readonly parent?: boolean;
}

export const Card = memo(function Card({ id, day, level = 0, branch = null, stage, copy = false, unseen = false, parent = false }: CardProps) {
	const item = useScreen((s) => s.items[id]);
	if (!item) return null;
	const face = item.card;
	const twoLines = face.over !== null;
	return (
		<div className={`tc-card${twoLines ? " is-two-line" : ""}${unseen ? " tc-invisible" : ""}${parent ? " is-drop-parent" : ""}`} {...(copy ? { "data-copy": id } : { "data-id": id })} data-status={item.status} data-collapsed={item.collapsed} style={{ [PROPERTY.level]: String(level) } as CSSProperties} {...paintOf(item.colors)}>
			<span className="tc-pick">
				<Icon name="check" />
			</span>
			{twoLines ? (
				<div className="tc-card-lines">
					<div className="tc-card-over">
						<span className="tc-card-over-text">{face.over}</span>
					</div>
					<Title text={face.text} />
				</div>
			) : (
				<Title text={face.text} />
			)}
			<ProjectMark item={item} />
			<Meta item={item} />
			<Corner item={item} day={day} stage={stage} />
			{branch ? <BranchLines branch={branch} /> : null}
		</div>
	);
});

/** A subtask's branch from its task, bending in if it is the last, and the lines of the tasks further up that go on past it. */
function BranchLines({ branch }: { readonly branch: Branch }) {
	return (
		<>
			<span className={branch.last ? "tc-branch is-last" : "tc-branch"} />
			{branch.through.map((goesOn, i) => (goesOn ? <span key={i} className="tc-branch-pass" style={{ [PROPERTY.pass]: String(branch.through.length - i) } as CSSProperties} /> : null))}
		</>
	);
}
