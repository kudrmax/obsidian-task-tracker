import { closestCorners, DndContext, type DragEndEvent, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "motion/react";
import { memo, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";

/** The same drag list as the spike plugin's columns, outside Obsidian: dnd-kit sensors, Motion cards, a portalled overlay. */
const SPRING = { type: "spring", stiffness: 520, damping: 42, mass: 0.9 } as const;
const log: string[] = [];

function App() {
	const [items, setItems] = useState(() => Array.from({ length: 40 }, (_, i) => `task-${i + 1}`));
	const [active, setActive] = useState<string | null>(null);
	const [status, setStatus] = useState("ready");
	const list = useRef<HTMLDivElement>(null);
	const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }));
	const note = (line: string) => {
		log.push(line);
		const sel = document.getSelection()?.toString() ?? "";
		setStatus(`${log.slice(-3).join("\n")}\nscrollTop ${Math.round(list.current?.scrollTop ?? 0)} | pageY ${Math.round(window.scrollY)} | selection "${sel}" | order ${items.slice(0, 4).join(",")}`);
	};
	useEffect(() => {
		const el = list.current!;
		const onScroll = () => note(`scroll ${Math.round(el.scrollTop)}`);
		el.addEventListener("scroll", onScroll, { passive: true });
		document.addEventListener("contextmenu", () => note("CONTEXTMENU"));
		document.addEventListener("selectionchange", () => { const s = document.getSelection()?.toString(); if (s) note(`SELECTION "${s}"`); });
		return () => el.removeEventListener("scroll", onScroll);
	});
	const onDragEnd = ({ active, over }: DragEndEvent) => {
		setActive(null);
		if (over && over.id !== active.id) setItems((xs) => arrayMove(xs, xs.indexOf(String(active.id)), xs.indexOf(String(over.id))));
		note(`drop ${active.id} on ${over?.id ?? "nothing"}`);
	};
	return (
		<DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={({ active }) => { setActive(String(active.id)); note(`DRAG START ${active.id}`); }} onDragEnd={onDragEnd} onDragCancel={() => { setActive(null); note("cancel"); }}>
			<div className="screen">
				<div className="status" id="status">{status}</div>
				<div className="list" ref={list}>
					<SortableContext items={items} strategy={verticalListSortingStrategy}>
						<AnimatePresence initial={false} mode="popLayout">
							{items.map((id) => <Card key={id} id={id} />)}
						</AnimatePresence>
					</SortableContext>
				</div>
			</div>
			{createPortal(<DragOverlay>{active ? <div className="card is-overlay">{active}</div> : null}</DragOverlay>, document.body)}
		</DndContext>
	);
}

const Card = memo(function Card({ id }: { id: string }) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
	return (
		<motion.div className="card-outer" layout={!isDragging} layoutId={isDragging ? undefined : id} transition={SPRING}>
			<div ref={setNodeRef} className={`card-inner ${isDragging ? "is-placeholder" : ""}`} style={{ transform: CSS.Translate.toString(transform), transition }} {...attributes} {...listeners}>
				<div className="card">{id} — long press, then drag</div>
			</div>
		</motion.div>
	);
});

createRoot(document.getElementById("root")!).render(<App />);
