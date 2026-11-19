import { type CSSProperties, memo, type MouseEvent, useCallback, useContext, useMemo, useRef, useState } from "react";
import { DESIGN, PROPERTY } from "../../design";
import { CalendarBlocks, SortableRow, useCalendarDrop, useNewSlot } from "../drag/Drag";
import { type Edge, useResize } from "../gestures/Resize";
import { hourOf, type RoomMeasure, useCalendarZoom } from "../gestures/Zoom";
import { Pinned, useAnchor } from "../layers/Layers";
import { type EventBox, layEvents, layTasks, opening, type Shade, shadesOn, stackEnd, type TaskBox } from "../layout/calendar";
import { TimeScale } from "../layout/timeScale";
import { type DayTurn, DayTurnContext } from "../gestures/FollowRibbon";
import type { AllDayEvent, Block, DayData, DayEvent, EventPaint, Now } from "../port";
import { DayContext, useData, useScreen, useScreenApi } from "../store";
import { Card, PressedLook } from "./Card";
import { useHost } from "./host";
import { MovingRow } from "./MovingRow";
import { EntryField } from "./QuickAdd";
import { DaySlide } from "./Slide";

const px = (n: number) => `${n}px`;
const at = (minute: number, scale: TimeScale) => ({ [PROPERTY.y]: px(scale.y(minute)) }) as CSSProperties;
const boxStyle = (box: TaskBox, z: number) => ({ [PROPERTY.y]: px(box.top), [PROPERTY.length]: px(box.height), [PROPERTY.x]: px(box.left), [PROPERTY.stackZ]: String(z) }) as CSSProperties;
/** An event's paint in both themes, as the port gives it: the stylesheet shows the theme's own. */
export const paintStyle = (paint: EventPaint) =>
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
 * cards stacked by the calendar's layout, each placed by the one time scale at the zoom, the all-day rows on a band over
 * it. It scrolls natively between the day's ends; today opens with the now line at the middle of what a person sees of it
 * as far as those ends let it, another day on the hour the port names, revealed by the browser (`scrollIntoView`).
 * It is a drop target holding its blocks (`useCalendarDrop`, `CalendarBlocks`): a block is carried like a card, and a
 * card carried over it stands as the card it will be, its start written on its dashed place. A long press on empty time
 * lifts a new task's place there (`useNewSlot`); a pinch zooms it at the pointer (`useCalendarZoom`); a tap or a long press on a task
 * opens its menu and selects it, its two dots resizing it (`useResize`).
 */
export const Timeline = memo(function Timeline() {
	const day = useData((d) => d.day);
	const now = useScreen((s) => s.now);
	const zoom = useScreen((s) => s.zoom);
	const plusMinute = useScreen((s) => s.plusMinute);
	const entry = useScreen((s) => s.entry);
	const dayOffset = useScreen((s) => s.dayOffset);
	const own = useContext(DayContext);
	const turn = useContext(DayTurnContext);
	const { zoomMost } = useHost();
	const [measured, setMeasured] = useState<RoomMeasure | null>(null);
	const scale = useMemo(() => new TimeScale(hourOf(zoom, measured?.fit ?? null, zoomMost)), [zoom, measured, zoomMost]);
	/** A new task's place or field on the calendar stands in the stack as a card without a length. */
	const extra = plusMinute !== null ? plusMinute : entry?.at !== undefined && entry.dayOffset === dayOffset ? entry.at : null;
	const { boxes, drawn } = useDayLayout(day, extra, scale);
	const end = stackEnd(boxes);
	const placedBy = usePlacedBy(scale.hourPx, day.blocks, day.events, extra);
	const ids = useMemo(() => drawn.map(({ block }) => block.id), [drawn]);
	const room = useRef<HTMLDivElement | null>(null);
	const foot = useRef<HTMLDivElement | null>(null);
	/** The start a task's top `y` pixels under the day's top takes. */
	const minuteAt = useCallback((y: number) => scale.start(y), [scale]);
	const drop = useCalendarDrop(minuteAt);
	const slot = useNewSlot();
	const measure = useCalendarZoom(room, foot, scale, zoomMost, setMeasured);
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
	 * Where the calendar opens, worked out once the room is measured, for the day it opened on: today with the now line at
	 * its share of what a person sees, as far as the day's ends let it (the scroll stops at them: no room is ever kept over
	 * the first hour or under the last); another day on the port's hour. Days turned to by a finger keep the hours where
	 * they stand (the plugin's «заголовок и часы стоят»).
	 */
	const [opened] = useState(() => ({ minute: now.minute, isToday: day.isToday, opensAt: day.opensAt }));
	const opens = useMemo(() => (measured && opened.isToday ? opening(scale.y(opened.minute), DESIGN.dayHours * scale.hourPx, measured.visible) : null), [measured, opened, scale]);
	/** The browser's reveal of a mark: put at the top of the room, less its scroll margin. */
	const reveal = useCallback((el: HTMLElement | null) => el?.scrollIntoView({ block: "start", inline: "nearest" }), []);
	/** The days drawn: a turn's, or the one this calendar shows. */
	const days = turn?.days ?? [own ?? dayOffset];
	/** An hour's label gives way to the now line while today is drawn. */
	const todayDrawn = turn ? days.includes(0) : day.isToday;
	const nearNow = (minute: number) => todayDrawn && Math.abs(scale.y(minute) - scale.y(now.minute)) < TimeScale.NEAR_NOW;
	const marks = useMemo(() => scale.marks(), [scale]);
	const canvas = { [PROPERTY.hour]: px(scale.hourPx), [PROPERTY.stackEnd]: px(end) } as CSSProperties;
	const layers = days.map((d) => <DayItems key={d} day={d} turn={turn} scale={scale} shown={d === (own ?? dayOffset)} now={now} />);
	return (
		<CalendarBlocks ids={ids}>
			<AllDayBand days={days} turn={turn} shownDay={own ?? dayOffset} />
			<div className="tc-timeline" data-timeline="" data-hour-px={scale.hourPx} data-step={scale.step} style={{ [PROPERTY.allDayExtraRows]: String(Math.max(0, day.allDay.length - 1)) } as CSSProperties} ref={setRoom}>
				<div className="tc-foot-probe" ref={foot} />
				<div className={`tc-canvas${placedBy === "scale" ? " is-rescaled" : ""}`} style={canvas} ref={setCanvas} {...slot.listeners}>
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
					{measured === null ? null : opened.isToday ? (
						<div key="now" className="tc-reveal" style={{ ...at(opened.minute, scale), [PROPERTY.anchorOffset]: px(opens?.above ?? 0) } as CSSProperties} ref={reveal} />
					) : (
						<div key="opens" className="tc-reveal" style={{ ...at(opened.opensAt, scale), [PROPERTY.anchorOffset]: px(DESIGN.labelLift) } as CSSProperties} ref={reveal} />
					)}
					{turn ? layers : <DayContext.Provider value={own}>{layers}</DayContext.Provider>}
				</div>
			</div>
		</CalendarBlocks>
	);
});

/** The day's items laid out: its events, its blocks with the new task's place, and the blocks in one order by id. */
function useDayLayout(day: DayData, extra: number | null, scale: TimeScale) {
	const events = useMemo(() => layEvents(day.events, scale), [day.events, scale]);
	const boxes = useMemo(() => layTasks([...day.blocks.map((b) => ({ start: b.start, length: b.length })), ...(extra === null ? [] : [{ start: extra, length: null }])], events, scale), [day.blocks, extra, events, scale]);
	/**
	 * The blocks drawn in one order whatever their times (by id): each is placed by its own box, and a node the browser moves
	 * among its siblings drops its running glide; which lies over which is its rank in the stack.
	 */
	const drawn = useMemo(() => day.blocks.map((block, index) => ({ block, box: boxes[index] })).sort((a, b) => (a.block.id < b.block.id ? -1 : a.block.id > b.block.id ? 1 : 0)), [day.blocks, boxes]);
	return { events, boxes, drawn };
}

/**
 * One day's items on the calendar: its events, its tasks stacked, the new task's place on the shown day, and its now line
 * on today. As the days turn they slide through the items' room, each seen only within it, the hours standing still.
 */
const DayItems = memo(function DayItems({ day, turn, scale, shown, now }: { readonly day: number; readonly turn: DayTurn | null; readonly scale: TimeScale; readonly shown: boolean; readonly now: Now }) {
	if (!turn) return <DayItemsOf day={day} turn={null} scale={scale} shown={shown} now={now} />;
	return (
		<DayContext.Provider value={day}>
			<DayItemsOf day={day} turn={turn} scale={scale} shown={shown} now={now} />
		</DayContext.Provider>
	);
});

function DayItemsOf({ day: offset, turn, scale, shown, now }: { readonly day: number; readonly turn: DayTurn | null; readonly scale: TimeScale; readonly shown: boolean; readonly now: Now }) {
	const day = useData((d) => d.day);
	const plusMinute = useScreen((s) => (shown ? s.plusMinute : null));
	const entry = useScreen((s) => (shown ? s.entry : null));
	const dayOffset = useScreen((s) => s.dayOffset);
	const extra = plusMinute !== null ? plusMinute : entry?.at !== undefined && entry.dayOffset === dayOffset ? entry.at : null;
	const { events, boxes, drawn } = useDayLayout(day, extra, scale);
	const order = useMemo(() => day.blocks.map((b) => `${b.id}@${b.start}+${b.length}`).join(" "), [day.blocks]);
	const top = events.length + boxes.length;
	const shades = useShades(boxes, day.blocks, events.length, top, plusMinute === null);
	const turning = turn?.at ?? null;
	return (
		<>
			<DaySlide day={offset} at={turning} window="own" className="tc-items">
				{day.events.map((event, i) => (
					<EventItem key={event.id} event={event} box={events[i]} scale={scale} />
				))}
				{drawn.map(({ block, box }) => (
					<BlockItem key={block.id} block={block} box={box} shades={shades.get(block.id) ?? NO_SHADES} order={order} z={events.length + box.rank} top={top} scale={scale} />
				))}
				{extra === null ? null : <NewPlace minute={extra} box={boxes[boxes.length - 1]} z={top} field={plusMinute === null} />}
			</DaySlide>
			{day.isToday ? (
				<DaySlide day={offset} at={turning} window="now" className="tc-now-lane">
					<div className="tc-now" style={at(now.minute, scale)}>
						<span className="tc-now-pill">{now.label}</span>
						<div className="tc-now-line" />
					</div>
				</DaySlide>
			) : null}
		</>
	);
}

/**
 * The all-day rows over the calendar: the band and its line stand; each day's rows slide with its items. The shown day's
 * rows hold the band's height (a shown day without any has no band); a day coming in lies over it.
 */
function AllDayBand({ days, turn, shownDay }: { readonly days: readonly number[]; readonly turn: DayTurn | null; readonly shownDay: number }) {
	const rows = useData((d) => d.day.allDay);
	if (!turn || rows.length === 0) return <AllDayRows rows={rows} />;
	return (
		<div className="tc-allday-rows">
			<div className="tc-allday-backing" />
			{days.map((day) => (
				<DayContext.Provider key={day} value={day}>
					<AllDayOf day={day} turn={turn} lying={day !== shownDay} />
				</DayContext.Provider>
			))}
		</div>
	);
}

function AllDayOf({ day, turn, lying }: { readonly day: number; readonly turn: DayTurn; readonly lying: boolean }) {
	const rows = useData((d) => d.day.allDay);
	const open = useOpenMenu();
	return (
		<DaySlide day={day} at={turn.at} window="own" className={`tc-allday-day${lying ? " is-lying" : ""}`}>
			{rows.map((row) => (
				<AllDayRow key={row.id} row={row} open={open} />
			))}
		</DaySlide>
	);
}

const NO_SHADES: readonly Shade[] = [];

/**
 * The shades each block takes from the cards drawn over it (Decision 60), by its id: a card lies higher by its rank in the
 * stack, the selected or resized one and the new task's field over every other; a carried task's dashed place and the
 * new task's place neither cast nor take one.
 */
function useShades(boxes: readonly TaskBox[], blocks: readonly Block[], events: number, top: number, field: boolean): ReadonlyMap<string, readonly Shade[]> {
	const lifted = useScreen((s) => s.lifted);
	const selected = useScreen((s) => s.selected);
	const resizing = useScreen((s) => s.resizing?.id ?? null);
	return useMemo(() => {
		const height = boxes.map((box, i) => {
			const block = blocks[i];
			if (!block) return field ? top : null;
			if (block.id === lifted) return null;
			return block.id === selected || block.id === resizing ? top : events + box.rank;
		});
		const cast = shadesOn(boxes, height);
		return new Map(blocks.map((block, i) => [block.id, cast[i]]));
	}, [boxes, blocks, events, top, field, lifted, selected, resizing]);
}

/**
 * Why the blocks stand where they are drawn: the scale last changed (a zoom, a refit), or what the day holds (a task
 * dropped, resized, written back, a new task's place, an event that stacks them). A change of scale is no move: drawn by
 * it, the blocks stand on the grid in the same frame as the hour lines, never gliding behind them (Max, 2026-11-19); a
 * change of what the day holds lets them glide again. It holds until the other changes, not for one render only, so a
 * render that changes neither keeps the blocks where the last change put them, without a glide.
 */
function usePlacedBy(hourPx: number, blocks: readonly Block[], events: readonly DayEvent[], extra: number | null): "scale" | "data" {
	const [placed, setPlaced] = useState({ hourPx, blocks, events, extra, by: "data" as "scale" | "data" });
	if (placed.hourPx !== hourPx || placed.blocks !== blocks || placed.events !== events || placed.extra !== extra) {
		const by = placed.hourPx !== hourPx ? "scale" : "data";
		setPlaced({ hourPx, blocks, events, extra, by });
		return by;
	}
	return placed.by;
}

/** The all-day events, a row each over the calendar (the design's «Строка событий на весь день»); a tap opens the event's menu. */
const AllDayRows = memo(function AllDayRows({ rows }: { readonly rows: readonly AllDayEvent[] }) {
	const open = useOpenMenu();
	if (rows.length === 0) return null;
	return (
		<div className="tc-allday-rows">
			<div className="tc-allday-backing" />
			{rows.map((row) => (
				<AllDayRow key={row.id} row={row} open={open} />
			))}
		</div>
	);
});

function AllDayRow({ row, open }: { readonly row: AllDayEvent; readonly open: (id: string, event: MouseEvent<HTMLElement>) => void }) {
	return (
		<div className={`tc-allday${row.past ? " is-past" : ""}`} data-event={row.id} style={paintStyle(row.paint)} onClick={(e) => open(row.id, e)}>
			<div className="tc-event-bar" />
			<div className="tc-allday-title">{row.title}</div>
		</div>
	);
}

/** A tap on an event or a task opens its menu, from the element tapped. */
function useOpenMenu(): (id: string, event: MouseEvent<HTMLElement>) => void {
	const api = useScreenApi();
	const anchor = useAnchor();
	const pressed = useContext(PressedLook);
	return (id, event) => {
		pressed.current = null;
		anchor.current = event.currentTarget.querySelector(".tc-event-block") ?? event.currentTarget;
		api.getState().openMenu(id, "calendar");
	};
}

/**
 * A read-only event in its calendar's colour, faded once over; a tap opens its menu. In a cluster of overlapping events it
 * stands in its lane, its title past the cluster's last lane; when an earlier title holds the line at its start, its block
 * begins on the next free line and its bar's stem runs up to its start (Decision 52).
 */
const EventItem = memo(function EventItem({ event, box, scale }: { readonly event: DayEvent; readonly box: EventBox; readonly scale: TimeScale }) {
	const open = useOpenMenu();
	const held = box.blockTop > 0;
	const style = {
		...at(event.start, scale),
		[PROPERTY.length]: px(box.drawnHeight + DESIGN.itemGap),
		[PROPERTY.x]: px(box.left),
		[PROPERTY.stackZ]: String(box.layer),
		[PROPERTY.blockTop]: px(box.blockTop),
		[PROPERTY.lanesAfter]: String(box.lanesAfter),
		[PROPERTY.labelRoom]: px(box.labelRoom),
		...paintStyle(event.paint),
	} as CSSProperties;
	return (
		<div className={`tc-item tc-event${event.past ? " is-past" : ""}${box.tiny ? " is-tiny" : ""}${held ? " is-held" : ""}`} data-event={event.id} data-own-press="" style={style} onClick={(e) => open(event.id, e)}>
			{held ? <div className="tc-event-stem" /> : null}
			<div className="tc-event-block">
				<div className="tc-event-bar" />
			</div>
			<div className="tc-event-label">
				<div className="tc-event-body">
					<div className="tc-item-title">{event.title}</div>
				</div>
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
const BlockItem = memo(function BlockItem({ block, box, shades, order, z, top, scale }: { readonly block: Block; readonly box: TaskBox; readonly shades: readonly Shade[]; readonly order: string; readonly z: number; readonly top: number; readonly scale: TimeScale }) {
	const lifted = useScreen((s) => s.lifted === block.id);
	const selected = useScreen((s) => s.selected === block.id);
	const resizing = useScreen((s) => (s.resizing?.id === block.id ? s.resizing.edge : null));
	const api = useScreenApi();
	const anchor = useAnchor();
	const pressed = useContext(PressedLook);
	const [element, setElement] = useState<HTMLDivElement | null>(null);
	const className = `tc-block${selected ? " is-selected" : ""}${resizing ? " is-resizing" : ""}`;
	const look = { step: block.step, corner: box.stacked ? block.startParts : box.shortLength ? block.lengthParts : null, pill: resizing === "start" ? block.clock : resizing === "end" ? (block.endClock ?? block.clock) : null, clock: block.clock };
	return (
		<MovingRow ref={setElement} id={block.id} order={order} carried={lifted} fresh={false} placed className={className} style={boxStyle(box, selected || resizing ? top : z)}>
			<SortableRow
				id={block.id}
				placed
				onTap={(target) => {
					anchor.current = target.querySelector("[data-block]") ?? target;
					pressed.current = look;
					api.getState().openMenu(block.id, "calendar");
					api.getState().select(block.id);
				}}
			>
				<Card id={block.id} block={look} />
			</SortableRow>
			{shades.length > 0 ? (
				<div className="tc-shades" aria-hidden="true">
					{shades.map((shade, i) => (
						<div key={i} className="tc-shade" style={{ [PROPERTY.y]: px(shade.top), [PROPERTY.x]: px(shade.left), [PROPERTY.length]: px(shade.height) } as CSSProperties} />
					))}
				</div>
			) : null}
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
