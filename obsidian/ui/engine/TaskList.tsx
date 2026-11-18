import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";
import { motion } from "motion/react";
import { type CSSProperties, memo, type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import type { DropColumn } from "../../../core/application/contracts";
import { PROPERTY } from "../design";
import type { LocalDate } from "../types";
import { Card } from "./Card";
import type { DragSource } from "./drag/DragLayer";
import { dragId, dropId } from "./drag/dragState";
import { useListShape } from "./drag/geometry";
import { type Entry, entriesOf } from "./drag/listDrag";
import { useHost, useScreen } from "./ScreenContext";
import type { ShownList } from "./screenStore";

/** How far the list is scrolled from its top and how much of it lies below: the fades at its edges follow them. */
interface Edges {
	readonly above: number;
	readonly below: number;
}

/** Every card that changes place glides there, the same way whatever moved it (spec, «How the stack solves…»). */
const GLIDE = { type: "spring", stiffness: 520, damping: 42, mass: 0.9 } as const;

export interface TaskListProps {
	readonly column: ShownList;
	/** The day the list shows, whose date its cards leave out; null for a list of no day. */
	readonly day: LocalDate | null;
	/** The list scrolls in its own room and mounts only the cards in sight (TanStack Virtual); false: every card, the list as tall as its cards. */
	readonly scrolls: boolean;
	readonly className?: string;
	/** The room over its first row, px: the rows' lists keep a card gap there. */
	readonly padTop?: number;
	/** The list's content as drawn, for the rows' heights (`stackedLists`): its whole height and where each card ends. */
	readonly onSize?: (size: ListSize) => void;
}

export interface ListSize {
	readonly content: number;
	readonly stops: readonly number[];
}

const isDropColumn = (column: ShownList): column is DropColumn => column !== "projects";

/**
 * A column's list: each task with its open subtasks under it and their branches, the sections' headers and the empty
 * sections' plates, as the core groups them. A list that scrolls mounts only what is in sight; its edges fade as it is
 * scrolled under them. While a card is carried the cards part where the core places it (the gap) and glide back as it
 * moves on; every card is a drag source, the list a drop target.
 */
export const TaskList = memo(function TaskList({ column, day, scrolls, className = "", padTop = 0, onSize }: TaskListProps) {
	const model = useScreen((s) => s.columns[column]);
	const drag = useScreen((s) => (s.drag && (s.drag.lifted.kind !== "task" || s.drag.lifted.home?.column === column || (s.drag.aim.kind === "gap" && s.drag.aim.column === column) || s.drag.phase === "dropping") ? s.drag : null));
	const { looks } = useHost();
	const entries = useMemo(() => entriesOf(model, column, drag, looks), [model, column, drag, looks]);
	const settings = useScreen((s) => s.settings);
	const ungrouped = settings.ungrouped;
	const emptyLabel = useScreen((s) => s.funnel?.view.emptyLabel ?? "");
	const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
	const [edges, setEdges] = useState<Edges>({ above: 0, below: 0 });
	const droppable = isDropColumn(column) ? column : null;
	/** A list whose sections show: its headers lift their sections (By project's parts are not sections). */
	const grouped = useScreen((s) => (droppable ? s.grouped[droppable] : false));
	const { setNodeRef: dropRef } = useDroppable({ id: dropId.list(droppable ?? "day"), disabled: droppable === null || !scrolls });
	const listRef = useCallback(
		(el: HTMLDivElement | null) => {
			setScroller(el);
			dropRef(el);
		},
		[dropRef],
	);
	/** Every row is measured once drawn; until then it counts as a card. */
	const estimate = useCallback(() => settings.cardHeight, [settings.cardHeight]);
	const shape = useRef({ entries, onSize });
	shape.current = { entries, onSize };
	const follow = useCallback((v: Virtualizer<HTMLDivElement, Element>) => {
		const { entries: drawn, onSize: report } = shape.current;
		report?.({ content: v.getTotalSize(), stops: v.measurementsCache.filter((m) => drawn[m.index]?.kind === "card").map((m) => m.end) });
		const el = v.scrollElement;
		if (!el) return;
		const next = { above: Math.round(el.scrollTop), below: Math.max(0, Math.round(el.scrollHeight - el.clientHeight - el.scrollTop)) };
		setEdges((prev) => (prev.above === next.above && prev.below === next.below ? prev : next));
	}, []);
	const virtualizer = useVirtualizer({
		count: entries.length,
		getScrollElement: () => scroller,
		estimateSize: estimate,
		getItemKey: (i) => entries[i]?.key ?? i,
		overscan: 6,
		gap: settings.cardGap,
		enabled: scrolls,
		onChange: follow,
	});
	useListShape(scrolls ? droppable : null, () => ({ entries, measured: virtualizer.measurementsCache, scrollTop: virtualizer.scrollOffset ?? 0, padTop }));

	const draw = (entry: Entry): ReactNode => {
		if (entry.kind === "card") return droppable ? <DraggableCard column={droppable} entry={entry} day={day} /> : <Card id={entry.row.id} day={day} level={entry.row.level} branch={entry.row.branch} stage={entry.row.stage} />;
		if (entry.kind === "gap" && entry.section) return <SectionGap column={droppable!} />;
		if (entry.kind === "gap") return <Gap id={entry.id} level={entry.level} day={day} />;
		if (entry.kind === "home") return <div className="tc-gap is-home" style={{ [PROPERTY.level]: String(entry.level) } as CSSProperties} />;
		if (entry.kind === "head") {
			const head = (
				<div className={`tc-group-head${entry.group.name === null ? " is-ungrouped" : ""}`}>
					<span className="tc-group-name">{entry.group.title !== undefined ? (entry.group.title ?? "") : (entry.group.name ?? ungrouped)}</span>
				</div>
			);
			return droppable && entry.group.header && grouped ? <DraggableHead column={droppable} groupId={entry.group.id}>{head}</DraggableHead> : head;
		}
		if (entry.kind === "plate") return <div className="tc-group-empty" data-group={entry.group.name ?? ""}>{emptyLabel}</div>;
		return <div className="tc-group-empty tc-list-empty">{entry.words}</div>;
	};
	const fades = `${edges.above > 0 ? " is-under-top" : ""}${edges.below > 0 ? " is-under-bottom" : ""}`;
	const style = { [PROPERTY.scrolled]: `${edges.above}px`, [PROPERTY.scrolledBelow]: `${edges.below}px` } as CSSProperties;
	if (!scrolls)
		return (
			<div className={`tc-list ${className}`} data-list={column}>
				<div className="tc-list-items is-flow">
					{entries.map((entry) => (
						<div key={entry.key} className={`tc-list-item${entry.kind === "head" && entry.top ? " is-top" : ""}`}>
							{draw(entry)}
						</div>
					))}
				</div>
			</div>
		);
	return (
		<div className={`tc-list ${className}${fades}`} style={style} ref={listRef} data-list={column}>
			<div className="tc-list-items" style={{ height: virtualizer.getTotalSize() }}>
				{virtualizer.getVirtualItems().map((v) => {
					const entry = entries[v.index];
					return (
						<motion.div key={v.key} ref={virtualizer.measureElement} data-index={v.index} className={`tc-list-item${entry.kind === "head" && entry.top ? " is-top" : ""}`} initial={false} animate={{ y: v.start }} transition={GLIDE}>
							{draw(entry)}
						</motion.div>
					);
				})}
			</div>
		</div>
	);
});

/** A section's header as a drag source: lifting it carries its section. */
function DraggableHead({ column, groupId, children }: { readonly column: DropColumn; readonly groupId: string; readonly children: ReactNode }) {
	const source: DragSource = useMemo(() => ({ kind: "section", column, groupId }), [column, groupId]);
	const { setNodeRef, listeners, attributes } = useDraggable({ id: dragId.section(column, groupId), data: source });
	return (
		<div ref={setNodeRef} className="tc-drag-source" {...listeners} {...attributes}>
			{children}
		</div>
	);
}

/** A card as a drag source: the thin wrapper dnd-kit re-renders, around the memoized card. */
function DraggableCard({ column, entry, day }: { readonly column: DropColumn; readonly entry: Extract<Entry, { kind: "card" }>; readonly day: LocalDate | null }) {
	const source: DragSource = useMemo(() => ({ kind: "card", column, id: entry.row.id }), [column, entry.row.id]);
	const { setNodeRef, listeners, attributes } = useDraggable({ id: dragId.task(entry.row.id), data: source });
	return (
		<div ref={setNodeRef} className="tc-drag-source" {...listeners} {...attributes}>
			<Card id={entry.row.id} day={day} level={entry.row.level} branch={entry.row.branch} stage={entry.row.stage} parent={entry.parent} />
		</div>
	);
}

/**
 * The place a carried card will land: its outline at its depth. It is the carried task's own node for dnd-kit, so the
 * copy let go flies into it.
 */
function Gap({ id, level, day }: { readonly id: string | null; readonly level: number; readonly day: LocalDate | null }) {
	const twoLine = useScreen((s) => (id ? s.items[id]?.card.over !== null : false));
	/** The copy has landed and the drop's screen is still coming: the card stands in its gap, never a frame without it. */
	const landed = useScreen((s) => s.drag?.phase === "dropping" && s.drag.flown);
	/** The carried thing's own id for dnd-kit (a card's or a block's), so the copy let go flies into the gap. */
	const carriedId = useScreen((s) => (s.drag?.lifted.kind === "task" ? (s.drag.lifted.home ? dragId.task(s.drag.lifted.id) : dragId.block(s.drag.lifted.id)) : "gap"));
	const { setNodeRef } = useDraggable({ id: id ? carriedId : "gap", disabled: true });
	if (landed && id) return <Card id={id} day={day} level={level} />;
	return <div ref={setNodeRef} className={`tc-gap${twoLine ? " is-two-line" : ""}`} style={{ [PROPERTY.level]: String(level) } as CSSProperties} />;
}

/** The gap a carried section will land in, between the sections: a place outline as tall as a header; the section's node for dnd-kit. */
function SectionGap({ column }: { readonly column: DropColumn }) {
	const carriedId = useScreen((s) => (s.drag?.lifted.kind === "section" ? dragId.section(column, s.drag.lifted.groupId) : "section-gap"));
	const { setNodeRef } = useDraggable({ id: carriedId, disabled: true });
	return <div ref={setNodeRef} className="tc-group-drop" />;
}
