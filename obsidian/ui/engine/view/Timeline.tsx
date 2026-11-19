import { type CSSProperties, memo, type MouseEvent, useCallback, useMemo, useRef, useState } from "react";
import { DESIGN, LAYOUT, PROPERTY } from "../../design";
import { CalendarBlocks, SortableRow, useCalendarDrop, useNewSlot } from "../drag/Drag";
import { type Edge, useResize } from "../gestures/Resize";
import { hourOf, useCalendarZoom, type ZoomAnchor } from "../gestures/Zoom";
import { useAnchor } from "../layers/Layers";
import { type EventBox, layEvents, layTasks, stackEnd, type TaskBox } from "../layout/calendar";
import { TimeScale } from "../layout/timeScale";
import type { AllDayEvent, Block, DayEvent } from "../port";
import { useData, useScreen, useScreenApi } from "../store";
import { useHost } from "./host";
import { MovingRow } from "./MovingRow";
import { EntryField } from "./QuickAdd";

const px = (n: number) => `${n}px`;
const at = (minute: number, scale: TimeScale) => ({ [PROPERTY.y]: px(scale.y(minute)) }) as CSSProperties;
const boxStyle = (box: TaskBox, z: number) => ({ [PROPERTY.y]: px(box.top), [PROPERTY.length]: px(box.height), [PROPERTY.x]: px(box.left), [PROPERTY.stackZ]: String(z) }) as CSSProperties;

/**
 * The shown day's calendar (spec, «Time scale»; the design's «Правая колонка — календарь дня» and «Задачи на таймлайне»):
 * its hours and their finer marks, the now line on today, the all-day events over it, its events, its timed tasks as
 * cards stacked by the calendar's layout, each placed by the one time scale at the zoom. It scrolls natively; today opens
 * on the now line, another day on the hour the port names, revealed by the browser (`scrollIntoView`). It is a drop
 * target holding its blocks (`useCalendarDrop`, `CalendarBlocks`): a block is carried like a card, and a card carried
 * over it stands as the card it will be, its start written on its dashed place. A long press on empty time lifts a new
 * task's place there (`useNewSlot`); a pinch zooms it (`useCalendarZoom`); a tap on a task opens its menu and selects it,
 * its two dots resizing it (`useResize`).
 */
export const Timeline = memo(function Timeline() {
	const day = useData((d) => d.day);
	const now = useScreen((s) => s.now);
	const zoom = useScreen((s) => s.zoom);
	const plusMinute = useScreen((s) => s.plusMinute);
	const entry = useScreen((s) => s.entry);
	const dayOffset = useScreen((s) => s.dayOffset);
	const { zoomMost } = useHost();
	const [fit, setFit] = useState<number | null>(null);
	const scale = useMemo(() => new TimeScale(hourOf(zoom, fit, zoomMost)), [zoom, fit, zoomMost]);
	const events = useMemo(() => layEvents(day.events, scale), [day.events, scale]);
	/** A new task's place or field on the calendar stands in the stack as a card without a length. */
	const extra = plusMinute !== null ? plusMinute : entry?.at !== undefined && entry.dayOffset === dayOffset ? entry.at : null;
	const boxes = useMemo(() => layTasks([...day.blocks.map((b) => ({ start: b.start, length: b.length })), ...(extra === null ? [] : [{ start: extra, length: null }])], events, scale), [day.blocks, extra, events, scale]);
	const end = stackEnd(boxes);
	const order = useMemo(() => day.blocks.map((b) => `${b.id}@${b.start}+${b.length}`).join(" "), [day.blocks]);
	/**
	 * The blocks drawn in one order whatever their times (by id): each is placed by its own box, and a node the browser moves
	 * among its siblings drops its running glide; which lies over which is its rank in the stack.
	 */
	const drawn = useMemo(() => day.blocks.map((block, index) => ({ block, box: boxes[index] })).sort((a, b) => (a.block.id < b.block.id ? -1 : a.block.id > b.block.id ? 1 : 0)), [day.blocks, boxes]);
	const ids = useMemo(() => drawn.map(({ block }) => block.id), [drawn]);
	const room = useRef<HTMLDivElement | null>(null);
	/** The start a task's top `y` pixels under the day's top takes. */
	const minuteAt = useCallback((y: number) => scale.start(y), [scale]);
	const drop = useCalendarDrop(minuteAt);
	const slot = useNewSlot();
	const [anchor, setAnchor] = useState<ZoomAnchor | null>(null);
	const measure = useCalendarZoom(room, scale, zoomMost, end, setFit, setAnchor);
	/** While a pinch runs, its minute revealed at its height after every step (the browser's reveal, its scroll margin the height). */
	const revealAnchor = useCallback((el: HTMLElement | null) => el?.scrollIntoView({ block: "start", inline: "nearest" }), []);
	const setRoom = useCallback(
		(element: HTMLDivElement | null) => {
			room.current = element;
			drop.room(element);
			measure(element);
		},
		[drop.room, measure],
	);
	const setCanvas = useCallback(
		(element: HTMLDivElement | null) => {
			drop.canvas(element);
			slot.ref(element);
		},
		[drop.canvas, slot.ref],
	);
	/** On opening, today's now line in the middle of the room; another day at the hour the port names, at its top. */
	const revealNow = useCallback((el: HTMLElement | null) => el?.scrollIntoView({ block: "center", inline: "nearest" }), []);
	const revealHour = useCallback((el: HTMLElement | null) => el?.scrollIntoView({ block: "start", inline: "nearest" }), []);
	const nearNow = (minute: number) => day.isToday && Math.abs(scale.y(minute) - scale.y(now.minute)) < TimeScale.NEAR_NOW;
	const marks = useMemo(() => scale.marks(), [scale]);
	const top = events.length + boxes.length;
	const canvas = { [PROPERTY.hour]: px(scale.hourPx), [PROPERTY.stackEnd]: px(end) } as CSSProperties;
	return (
		<CalendarBlocks ids={ids}>
			<AllDayRows rows={day.allDay} />
			<div className="tc-timeline" data-timeline="" data-hour-px={scale.hourPx} data-step={scale.step} style={{ [PROPERTY.allDayExtraRows]: String(Math.max(0, day.allDay.length - 1)) } as CSSProperties} ref={setRoom}>
				<div className="tc-canvas" style={canvas} ref={setCanvas} {...slot.listeners}>
					{day.hours.map((label, hour) => (
						<div key={label} className="tc-hour-mark">
							<div className={`tc-hour-label${nearNow(hour * 60) ? " is-hidden" : ""}`} style={at(hour * 60, scale)} data-hour={label}>
								{label}
							</div>
							<div className="tc-hour-line" style={at(hour * 60, scale)} />
						</div>
					))}
					{marks.map((mark) => (
						<div key={mark.minute} className="tc-hour-mark">
							{mark.label === null ? null : (
								<div className={`tc-hour-label is-minor${nearNow(mark.minute) ? " is-hidden" : ""}`} style={at(mark.minute, scale)}>
									{mark.label}
								</div>
							)}
							<div className="tc-hour-line is-minor" style={at(mark.minute, scale)} />
						</div>
					))}
					{day.isToday ? null : <div className="tc-opens-at" style={at(day.opensAt, scale)} ref={revealHour} />}
					{anchor === null ? null : <div key={scale.hourPx} className="tc-zoom-anchor" style={{ ...at(anchor.minute, scale), [PROPERTY.anchorOffset]: px(anchor.offset) } as CSSProperties} ref={revealAnchor} />}
					<div className="tc-items">
						{day.events.map((event, i) => (
							<EventItem key={event.id} event={event} box={events[i]} scale={scale} />
						))}
						{drawn.map(({ block, box }) => (
							<BlockItem key={block.id} block={block} box={box} order={order} z={events.length + box.rank} top={top} />
						))}
						{extra === null ? null : <NewPlace minute={extra} box={boxes[boxes.length - 1]} z={top} field={plusMinute === null} />}
						<Grips blocks={day.blocks} boxes={boxes} scale={scale} z={top + 1} />
					</div>
					{day.isToday ? (
						<div className="tc-now" style={at(now.minute, scale)} ref={revealNow}>
							<span className="tc-now-pill">{now.label}</span>
							<div className="tc-now-line" />
						</div>
					) : null}
				</div>
			</div>
		</CalendarBlocks>
	);
});

/** The all-day events, a row each over the calendar (the design's «Строка событий на весь день»); a tap opens the event's menu. */
const AllDayRows = memo(function AllDayRows({ rows }: { readonly rows: readonly AllDayEvent[] }) {
	const open = useOpenMenu();
	if (rows.length === 0) return null;
	return (
		<div className="tc-allday-rows">
			<div className="tc-allday-backing" />
			{rows.map((row) => (
				<div key={row.id} className={`tc-allday${row.past ? " is-past" : ""}`} data-event={row.id} style={{ [PROPERTY.eventColor]: row.color } as CSSProperties} onClick={(e) => open(row.id, e)}>
					<div className="tc-event-bar" />
					<div className="tc-allday-title">{row.title}</div>
				</div>
			))}
		</div>
	);
});

/** A tap on an event or a task opens its menu, from the element tapped. */
function useOpenMenu(): (id: string, event: MouseEvent<HTMLElement>) => void {
	const api = useScreenApi();
	const anchor = useAnchor();
	return (id, event) => {
		anchor.current = event.currentTarget;
		api.getState().openMenu(id);
	};
}

/** A read-only event in its calendar's colour, over others it starts during, faded once over; a tap opens its menu. */
const EventItem = memo(function EventItem({ event, box, scale }: { readonly event: DayEvent; readonly box: EventBox; readonly scale: TimeScale }) {
	const open = useOpenMenu();
	const length = scale.y(event.end - event.start);
	const tiny = length - DESIGN.itemGap < LAYOUT.tinyItemHeight;
	const style = { ...at(event.start, scale), [PROPERTY.length]: px(length), [PROPERTY.x]: px(box.left), [PROPERTY.stackZ]: String(box.layer), [PROPERTY.eventColor]: event.color } as CSSProperties;
	return (
		<div className={`tc-item tc-event${event.past ? " is-past" : ""}${tiny ? " is-tiny" : ""}`} data-event={event.id} data-own-press="" style={style} onClick={(e) => open(event.id, e)}>
			<div className="tc-event-bar" />
			<div className="tc-event-body">
				<div className="tc-item-title">{event.title}</div>
			</div>
		</div>
	);
});

/** A task on the calendar: the card of the lists at its box in the stack, gliding when the box changes. */
/** `top`: how high the selected task lies, over every other (its dots one higher). */
const BlockItem = memo(function BlockItem({ block, box, order, z, top }: { readonly block: Block; readonly box: TaskBox; readonly order: string; readonly z: number; readonly top: number }) {
	const lifted = useScreen((s) => s.lifted === block.id);
	const selected = useScreen((s) => s.selected === block.id);
	const resizing = useScreen((s) => (s.resizing?.id === block.id ? s.resizing.edge : null));
	const className = `tc-block${selected ? " is-selected" : ""}${resizing ? " is-resizing" : ""}`;
	return (
		<MovingRow id={block.id} order={order} carried={lifted} fresh={false} placed className={className} style={boxStyle(box, selected || resizing ? top : z)}>
			<BlockFace block={block} corner={box.stacked ? block.startParts : box.shortLength ? block.lengthParts : null} pill={resizing === "start" ? block.clock : resizing === "end" ? (block.endClock ?? block.clock) : null} />
		</MovingRow>
	);
});

/**
 * A task's card on the calendar, carried by dnd-kit like a card's; a tap opens its task's menu and selects it. A folded
 * task's card is named by its next step. On the right, its start in a stack or its length when shorter than the card;
 * while a dot is pulled, the moving edge's time on a pill; carried, its dashed place writes the start it will take.
 */
const BlockFace = memo(function BlockFace({ block, corner, pill }: { readonly block: Block; readonly corner: readonly [string, string] | null; readonly pill: string | null }) {
	const face = useData((d) => d.cards[block.id]);
	const api = useScreenApi();
	const anchor = useAnchor();
	if (!face) return null;
	return (
		<SortableRow
			id={block.id}
			placed
			onTap={(target) => {
				anchor.current = target;
				api.getState().openMenu(block.id);
				api.getState().select(block.id);
			}}
		>
			<div className="tc-block-card" data-block={block.id} data-own-press="" data-status={face.inProgress ? "inProgress" : "open"} data-priority={face.color ?? undefined}>
				<div className="tc-card-title">{block.step ?? face.title}</div>
				{face.count || face.description ? (
					<span className={`tc-meta${face.count && face.description ? " is-pair" : ""}`}>
						{face.count ? <span className="tc-count">{`${face.count.done}/${face.count.total}`}</span> : null}
					</span>
				) : null}
				<span className={`tc-block-meta${corner ? "" : " is-hidden"}`}>
					<span>{corner?.[0]}</span>
					<span>{corner?.[1]}</span>
				</span>
				<span className="tc-block-pill">{pill}</span>
				<span className="tc-slot-time">{block.clock}</span>
			</div>
		</SortableRow>
	);
});

/** The new task's place on the calendar, carried by the plus or a long press (its start written on it), or its field once let go. */
function NewPlace({ minute, box, z, field }: { readonly minute: number; readonly box: TaskBox; readonly z: number; readonly field: boolean }) {
	const clock = useScreen((s) => s.clockOf(minute));
	const entrySeq = useScreen((s) => s.entrySeq);
	if (field)
		return (
			<div className="tc-block tc-calendar-entry" data-own-press="" style={boxStyle(box, z)}>
				<EntryField key={entrySeq} depth={0} />
				<span className="tc-field-time">{clock}</span>
			</div>
		);
	return (
		<div className="tc-block is-new-slot" style={boxStyle(box, z)}>
			<div className="tc-drag-source is-lifted">
				<div className="tc-block-card">
					<span className="tc-slot-time">{clock}</span>
				</div>
			</div>
		</div>
	);
}

/** The selected task's two dots (F102, F103): the top one at its top right, the bottom one at its bottom left. */
function Grips({ blocks, boxes, scale, z }: { readonly blocks: readonly Block[]; readonly boxes: readonly TaskBox[]; readonly scale: TimeScale; readonly z: number }) {
	const selected = useScreen((s) => s.selected);
	const lifted = useScreen((s) => s.lifted);
	const index = blocks.findIndex((b) => b.id === selected);
	if (index < 0 || lifted === selected) return null;
	return (
		<div className="tc-grips is-shown" style={boxStyle(boxes[index], z)}>
			<Grip block={blocks[index]} edge="start" scale={scale} />
			<Grip block={blocks[index]} edge="end" scale={scale} />
		</div>
	);
}

function Grip({ block, edge, scale }: { readonly block: Block; readonly edge: Edge; readonly scale: TimeScale }) {
	const dayOffset = useScreen((s) => s.dayOffset);
	const { haptics } = useHost();
	const bind = useResize(block, edge, scale, dayOffset, () => haptics.tap());
	return <div className={`tc-grip is-${edge}`} data-own-press="" data-grip={edge} {...bind()} />;
}
