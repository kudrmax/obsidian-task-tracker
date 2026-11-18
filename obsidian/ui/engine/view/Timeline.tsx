import { type CSSProperties, memo, useCallback, useMemo, useRef } from "react";
import { DESIGN, PROPERTY } from "../../design";
import { CalendarBlocks, SortableRow, useCalendarDrop } from "../drag/Drag";
import { useAnchor } from "../layers/Layers";
import { BASE_SCALE, TimeScale } from "../layout/timeScale";
import { useData, useScreen, useScreenApi } from "../store";
import { MovingRow } from "./MovingRow";

const px = (n: number) => `${n}px`;

/**
 * The shown day's timeline: its hours, the now line on today, its timed tasks as blocks, each placed by the one time scale
 * (spec, «Time scale»). It scrolls natively; it opens on the now line, revealed by the browser (`scrollIntoView`). It is
 * a drop target holding its blocks (`useCalendarDrop`, `CalendarBlocks`): a block is carried like a card, and a card carried over it stands
 * as the block it will be, at the start the time scale reads under its top. Its blocks glide to where the shown day puts
 * them (their boxes' CSS transition); the carried task's place, a block too, steps from start to start.
 */
export const Timeline = memo(function Timeline() {
	const day = useData((d) => d.day);
	const now = useScreen((s) => s.now);
	const lifted = useScreen((s) => s.lifted);
	const scale = BASE_SCALE;
	const order = useMemo(() => day.blocks.map((b) => `${b.id}@${b.start}-${b.end}:${b.lane}/${b.lanes}`).join(" "), [day.blocks]);
	/**
	 * The blocks drawn in one order whatever their times (by id): each is placed by its own box, and a node the browser moves
	 * among its siblings drops its running glide, so a block passing another never reorders them.
	 */
	const drawn = useMemo(() => [...day.blocks].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)), [day.blocks]);
	const ids = useMemo(() => drawn.map((b) => b.id), [drawn]);
	const room = useRef<HTMLDivElement | null>(null);
	/** The start a task's top `y` pixels under the room's top takes: the room's scroll counted, and the label's room over the first hour (the canvas's top margin). */
	const minuteAt = useCallback((y: number) => scale.start(y + (room.current?.scrollTop ?? 0) - DESIGN.labelLift), [scale]);
	const drop = useCalendarDrop(minuteAt);
	const setRoom = useCallback(
		(element: HTMLDivElement | null) => {
			room.current = element;
			drop.room(element);
		},
		[drop.room],
	);
	/** On opening, the now line in the middle of the room; another day opens at its top. */
	const reveal = useCallback((el: HTMLElement | null) => el?.scrollIntoView({ block: "center", inline: "nearest" }), []);
	const y = (minute: number) => ({ [PROPERTY.y]: px(scale.y(minute)) }) as CSSProperties;
	const hours = { [PROPERTY.hour]: px(scale.hourPx) } as CSSProperties;
	return (
		<CalendarBlocks ids={ids}>
			<div className="tc-timeline" data-timeline="" ref={setRoom}>
				<div className="tc-canvas" style={hours} ref={drop.canvas}>
					{day.hours.map((label, hour) => (
						<div key={label} className="tc-hour-mark">
							<div className={`tc-hour-label${day.isToday && Math.abs(scale.y(hour * 60) - scale.y(now.minute)) < TimeScale.NEAR_NOW ? " is-hidden" : ""}`} style={y(hour * 60)} data-hour={label}>
								{label}
							</div>
							<div className="tc-hour-line" style={y(hour * 60)} />
						</div>
					))}
					<div className="tc-items">
						{drawn.map((block) => (
							<MovingRow key={block.id} id={block.id} order={order} carried={lifted === block.id} fresh={false} placed className="tc-block" style={{ ...y(block.start), [PROPERTY.length]: px(scale.y(block.end) - scale.y(block.start)), [PROPERTY.x]: `${(100 * block.lane) / block.lanes}%`, [PROPERTY.xEnd]: `${(100 * (block.lanes - block.lane - 1)) / block.lanes}%` } as CSSProperties}>
								<BlockFace id={block.id} />
							</MovingRow>
						))}
					</div>
					{day.isToday ? (
						<div className="tc-now" style={y(now.minute)} ref={reveal}>
							<span className="tc-now-pill">{now.label}</span>
							<div className="tc-now-line" />
						</div>
					) : null}
				</div>
			</div>
		</CalendarBlocks>
	);
});

/** A block's face, carried by dnd-kit like a card's; a tap opens its task's menu. */
const BlockFace = memo(function BlockFace({ id }: { readonly id: string }) {
	const face = useData((d) => d.cards[id]);
	const api = useScreenApi();
	const anchor = useAnchor();
	if (!face) return null;
	return (
		<SortableRow
			id={id}
			placed
			onTap={(target) => {
				anchor.current = target;
				api.getState().openMenu(id);
			}}
		>
			<div className="tc-block-card" data-block={id} data-status={face.inProgress ? "inProgress" : "open"} data-priority={face.color ?? undefined}>
				<div className="tc-card-title">{face.title}</div>
			</div>
		</SortableRow>
	);
});
