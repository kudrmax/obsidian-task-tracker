import { type CSSProperties, memo, type MouseEvent, useCallback, useMemo, useRef, useState } from "react";
import { DESIGN, LAYOUT, PROPERTY } from "../../design";
import { CalendarBlocks, SortableRow, useCalendarDrop, useNewSlot } from "../drag/Drag";
import { type Edge, useResize } from "../gestures/Resize";
import { hourOf, type RoomMeasure, useCalendarZoom, type ZoomAnchor } from "../gestures/Zoom";
import { Pinned, useAnchor } from "../layers/Layers";
import { type EventBox, layEvents, layTasks, opening, stackEnd, type TaskBox } from "../layout/calendar";
import { TimeScale } from "../layout/timeScale";
import type { AllDayEvent, Block, DayEvent, EventPaint } from "../port";
import { useData, useScreen, useScreenApi } from "../store";
import { Card } from "./Card";
import { useHost } from "./host";
import { MovingRow } from "./MovingRow";
import { EntryField } from "./QuickAdd";

const px = (n: number) => `${n}px`;
const at = (minute: number, scale: TimeScale) => ({ [PROPERTY.y]: px(scale.y(minute)) }) as CSSProperties;
const boxStyle = (box: TaskBox, z: number) => ({ [PROPERTY.y]: px(box.top), [PROPERTY.length]: px(box.height), [PROPERTY.x]: px(box.left), [PROPERTY.stackZ]: String(z) }) as CSSProperties;
/** An event's paint in both themes, as the port gives it: the stylesheet shows the theme's own. */
const paintStyle = (paint: EventPaint) =>
	({
		[PROPERTY.eventBgDark]: paint.dark.bg,
		[PROPERTY.eventBarDark]: paint.dark.bar,
		[PROPERTY.eventTextDark]: paint.dark.text,
		[PROPERTY.eventBgLight]: paint.light.bg,
		[PROPERTY.eventBarLight]: paint.light.bar,
		[PROPERTY.eventTextLight]: paint.light.text,
	}) as CSSProperties;

/**
 * The shown day's calendar (spec, «Time scale»; the design's «Правая колонка — календарь дня» and «Задачи на таймлайне»):
 * its hours and their finer marks, the now line on today, the all-day events over it, its events, its timed tasks as
 * cards stacked by the calendar's layout, each placed by the one time scale at the zoom. It scrolls natively; today opens
 * with the now line a bit above the middle of what a person sees of it (with room over the day's first hour or under its
 * last when the line is near them), another day on the hour the port names, revealed by the browser (`scrollIntoView`).
 * It is a drop target holding its blocks (`useCalendarDrop`, `CalendarBlocks`): a block is carried like a card, and a
 * card carried over it stands as the card it will be, its start written on its dashed place. A long press on empty time
 * lifts a new task's place there (`useNewSlot`); a pinch zooms it (`useCalendarZoom`); a tap or a long press on a task
 * opens its menu and selects it, its two dots resizing it (`useResize`).
 */
export const Timeline = memo(function Timeline() {
	const day = useData((d) => d.day);
	const now = useScreen((s) => s.now);
	const zoom = useScreen((s) => s.zoom);
	const plusMinute = useScreen((s) => s.plusMinute);
	const entry = useScreen((s) => s.entry);
	const dayOffset = useScreen((s) => s.dayOffset);
	const { zoomMost } = useHost();
	const [measured, setMeasured] = useState<RoomMeasure | null>(null);
	const scale = useMemo(() => new TimeScale(hourOf(zoom, measured?.fit ?? null, zoomMost)), [zoom, measured, zoomMost]);
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
	const foot = useRef<HTMLDivElement | null>(null);
	/** The start a task's top `y` pixels under the day's top takes. */
	const minuteAt = useCallback((y: number) => scale.start(y), [scale]);
	const drop = useCalendarDrop(minuteAt);
	const slot = useNewSlot();
	const [anchor, setAnchor] = useState<ZoomAnchor | null>(null);
	/** How far under the room's content top the day starts: the label's room over the first hour, and today's opening room. */
	const dayTop = useRef<number>(DESIGN.labelLift);
	const measure = useCalendarZoom(room, foot, scale, zoomMost, setMeasured, setAnchor, dayTop);
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
	/**
	 * Where today opens, worked out once the room is measured: the now line at its share of what a person sees, with room
	 * over the day's first hour or under its last when the line stands near them (the plugin's `scrollPlace`).
	 */
	const [opened] = useState(() => ({ minute: now.minute }));
	const opens = useMemo(() => (measured && day.isToday ? opening(scale.y(opened.minute), DESIGN.dayHours * scale.hourPx, measured.visible) : null), [measured, day.isToday, opened, scale]);
	dayTop.current = DESIGN.labelLift + (opens?.roomTop ?? 0);
	/** The browser's reveal of a mark: put at the top of the room, less its scroll margin. */
	const reveal = useCallback((el: HTMLElement | null) => el?.scrollIntoView({ block: "start", inline: "nearest" }), []);
	const nearNow = (minute: number) => day.isToday && Math.abs(scale.y(minute) - scale.y(now.minute)) < TimeScale.NEAR_NOW;
	const marks = useMemo(() => scale.marks(), [scale]);
	const top = events.length + boxes.length;
	const canvas = { [PROPERTY.hour]: px(scale.hourPx), [PROPERTY.stackEnd]: px(end), [PROPERTY.roomTop]: px(opens?.roomTop ?? 0), [PROPERTY.roomBottom]: px(opens?.roomBottom ?? 0) } as CSSProperties;
	return (
		<CalendarBlocks ids={ids}>
			<AllDayRows rows={day.allDay} />
			<div className="tc-timeline" data-timeline="" data-hour-px={scale.hourPx} data-step={scale.step} style={{ [PROPERTY.allDayExtraRows]: String(Math.max(0, day.allDay.length - 1)) } as CSSProperties} ref={setRoom}>
				<div className="tc-foot-probe" ref={foot} />
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
					{measured === null ? null : day.isToday ? (
						<div key="now" className="tc-reveal" style={{ ...at(opened.minute, scale), [PROPERTY.anchorOffset]: px(opens?.above ?? 0) } as CSSProperties} ref={reveal} />
					) : (
						<div key="opens" className="tc-reveal" style={{ ...at(day.opensAt, scale), [PROPERTY.anchorOffset]: px(DESIGN.labelLift) } as CSSProperties} ref={reveal} />
					)}
					{anchor === null ? null : <div key={scale.hourPx} className="tc-reveal" style={{ ...at(anchor.minute, scale), [PROPERTY.anchorOffset]: px(anchor.offset) } as CSSProperties} ref={reveal} />}
					<div className="tc-items">
						{day.events.map((event, i) => (
							<EventItem key={event.id} event={event} box={events[i]} scale={scale} />
						))}
						{drawn.map(({ block, box }) => (
							<BlockItem key={block.id} block={block} box={box} order={order} z={events.length + box.rank} top={top} scale={scale} />
						))}
						{extra === null ? null : <NewPlace minute={extra} box={boxes[boxes.length - 1]} z={top} field={plusMinute === null} />}
					</div>
					{day.isToday ? (
						<div className="tc-now" style={at(now.minute, scale)}>
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
				<div key={row.id} className={`tc-allday${row.past ? " is-past" : ""}`} data-event={row.id} style={paintStyle(row.paint)} onClick={(e) => open(row.id, e)}>
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
	const style = { ...at(event.start, scale), [PROPERTY.length]: px(length), [PROPERTY.x]: px(box.left), [PROPERTY.stackZ]: String(box.layer), ...paintStyle(event.paint) } as CSSProperties;
	return (
		<div className={`tc-item tc-event${event.past ? " is-past" : ""}${tiny ? " is-tiny" : ""}`} data-event={event.id} data-own-press="" style={style} onClick={(e) => open(event.id, e)}>
			<div className="tc-event-bar" />
			<div className="tc-event-body">
				<div className="tc-item-title">{event.title}</div>
			</div>
		</div>
	);
});

/**
 * A task on the calendar: the card of the lists at its box in the stack, gliding when the box changes, carried by dnd-kit
 * like a card; a tap opens its task's menu and selects it. Selected, it lies over every other (`top`) and its two dots are
 * pinned on it. A folded task's card is named by its next step; on the right, its start in a stack or its length when
 * shorter than the card; while a dot is pulled, the moving edge's time on a pill; carried, its dashed place writes the
 * start it will take.
 */
const BlockItem = memo(function BlockItem({ block, box, order, z, top, scale }: { readonly block: Block; readonly box: TaskBox; readonly order: string; readonly z: number; readonly top: number; readonly scale: TimeScale }) {
	const lifted = useScreen((s) => s.lifted === block.id);
	const selected = useScreen((s) => s.selected === block.id);
	const resizing = useScreen((s) => (s.resizing?.id === block.id ? s.resizing.edge : null));
	const api = useScreenApi();
	const anchor = useAnchor();
	const [element, setElement] = useState<HTMLDivElement | null>(null);
	const className = `tc-block${selected ? " is-selected" : ""}${resizing ? " is-resizing" : ""}`;
	const look = { step: block.step, corner: box.stacked ? block.startParts : box.shortLength ? block.lengthParts : null, pill: resizing === "start" ? block.clock : resizing === "end" ? (block.endClock ?? block.clock) : null, clock: block.clock };
	return (
		<MovingRow ref={setElement} id={block.id} order={order} carried={lifted} fresh={false} placed className={className} style={boxStyle(box, selected || resizing ? top : z)}>
			<SortableRow
				id={block.id}
				placed
				onTap={(target) => {
					anchor.current = target;
					api.getState().openMenu(block.id);
					api.getState().select(block.id);
				}}
			>
				<Card id={block.id} block={look} />
			</SortableRow>
			{(selected || resizing) && !lifted && element ? <Grips block={block} reference={element} scale={scale} /> : null}
		</MovingRow>
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

/**
 * The selected task's two dots (F102, F103), pinned on it over every layer, the menu's backdrop too, so they can be pulled
 * while its menu is open (pulling one closes it): the top one on its top edge at the right, the bottom one on its bottom
 * edge at the left.
 */
function Grips({ block, reference, scale }: { readonly block: Block; readonly reference: Element; readonly scale: TimeScale }) {
	const { layerRoot } = useHost();
	return (
		<>
			<Pinned reference={reference} placement="top-end" into={DESIGN.grip / 2} along={-DESIGN.gripStartRight} root={layerRoot}>
				<Grip block={block} edge="start" scale={scale} />
			</Pinned>
			<Pinned reference={reference} placement="bottom-start" into={DESIGN.grip / 2} along={DESIGN.gripEndLeft} root={layerRoot}>
				<Grip block={block} edge="end" scale={scale} />
			</Pinned>
		</>
	);
}

function Grip({ block, edge, scale }: { readonly block: Block; readonly edge: Edge; readonly scale: TimeScale }) {
	const { haptics } = useHost();
	const bind = useResize(block, edge, scale, () => haptics.tap());
	return <div className="tc-grip" data-own-press="" data-grip={edge} {...bind()} />;
}
