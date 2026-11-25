import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, type Modifier, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

/** Rows of Obsidian's settings put in order by hand (F300, Decision 172): what each row holds is the settings' own. */
export interface SortableRowsOptions {
	readonly count: number;
	readonly rowClass: string;
	readonly gripLabel: string;
	/** How long a row glides aside or into its place, and on what curve: the settings' tokens. */
	readonly glide: { readonly duration: number; readonly easing: string };
	/** Draws the row's content after its grip, once; `at()` is the row's place in the list at the moment it is asked. */
	fill(row: HTMLElement, grip: HTMLElement, at: () => number): void;
	/** A row let go at another place: from its place to the new one. */
	move(from: number, to: number): void;
}

/** dnd-kit's documented custom modifier for a vertical list: the row follows the finger up and down only. */
const vertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });

function Row({ id, options, at }: { readonly id: string; readonly options: SortableRowsOptions; readonly at: () => number }) {
	const { setNodeRef, setActivatorNodeRef, listeners, attributes, transform, transition, isDragging } = useSortable({ id, transition: options.glide });
	const row = useRef<HTMLDivElement | null>(null);
	const grip = useRef<HTMLDivElement | null>(null);
	useLayoutEffect(() => {
		if (row.current && grip.current) options.fill(row.current, grip.current, at);
	}, []);
	return (
		<div
			ref={(el) => {
				row.current = el;
				setNodeRef(el);
			}}
			className={isDragging ? `${options.rowClass} is-dragging` : options.rowClass}
			style={{ transform: CSS.Translate.toString(transform), transition }}
		>
			<div
				ref={(el) => {
					grip.current = el;
					setActivatorNodeRef(el);
				}}
				className="clickable-icon extra-setting-button tc-row-grip"
				aria-label={options.gripLabel}
				{...attributes}
				{...listeners}
			/>
		</div>
	);
}

/**
 * The rows as dnd-kit's sortable vertical list (its «Sortable» preset: `SortableContext` with
 * `verticalListSortingStrategy`, a drag handle by `setActivatorNodeRef`, the keyboard's `sortableKeyboardCoordinates`):
 * the row follows its grip, the others slide aside, let go it glides into its place. The rows keep who they are through a
 * move, so the settings draw nothing anew.
 */
function SortableRows({ options }: { readonly options: SortableRowsOptions }) {
	const [order, setOrder] = useState(() => Array.from({ length: options.count }, (_, i) => String(i)));
	const now = useRef(order);
	now.current = order;
	const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
	const end = ({ active, over }: DragEndEvent) => {
		if (!over || active.id === over.id) return;
		const from = order.indexOf(String(active.id));
		const to = order.indexOf(String(over.id));
		setOrder(arrayMove(order, from, to));
		options.move(from, to);
	};
	return (
		<DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[vertical]} onDragEnd={end}>
			<SortableContext items={order} strategy={verticalListSortingStrategy}>
				{order.map((id) => (
					<Row key={id} id={id} options={options} at={() => now.current.indexOf(id)} />
				))}
			</SortableContext>
		</DndContext>
	);
}

/** The rows in `el`, until the returned function takes them off. */
export function mountSortableRows(el: HTMLElement, options: SortableRowsOptions): () => void {
	const root = createRoot(el);
	flushSync(() => root.render(<SortableRows options={options} />));
	return () => root.unmount();
}
