import { type CSSProperties, memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type CalendarEvent, gridMarks, labelHidesNearNow, stackCorner, type TaskSpan, zoomShown } from "../../../core/application/contracts";
import { formatHour, formatTime } from "../dates";
import { DESIGN, LAYOUT, PROPERTY } from "../design";
import { bgAlphaFor, eventColors, eventHex } from "../eventColors";
import { gridAt, itemBox, layoutEvents, minutesToPx, scrollPlace, stackTasks } from "../timelineLayout";
import { paintOf, Title } from "./Card";
import { Icon } from "./Icon";
import { useHost, useScreen } from "./ScreenContext";

const px = (value: number) => `${value}px`;

/** An event's colours in the theme, as custom properties the stylesheet paints with (`eventColors`, the core's). */
function eventPaint(event: CalendarEvent, theme: "dark" | "light"): CSSProperties {
	const colors = eventColors(eventHex(event), bgAlphaFor(event.source), theme);
	return { [PROPERTY.eventBg]: colors.bg, [PROPERTY.eventBar]: colors.bar, [PROPERTY.eventText]: colors.text } as CSSProperties;
}

/** The all-day events over the timeline, one row each; the timeline under them steps down by the rows past the first. */
const AllDayRows = memo(function AllDayRows({ events, theme }: { readonly events: readonly CalendarEvent[]; readonly theme: "dark" | "light" }) {
	const { store } = useHost();
	const isPast = store.getState().isPast;
	return (
		<div>
			<div className="tc-allday-backing" />
			{events.map((event) => (
				<div key={event.id} className={`tc-allday${isPast(event) ? " is-past" : ""}`} style={eventPaint(event, theme)}>
					<div className="tc-event-bar" />
					<div className="tc-allday-title">{event.title}</div>
				</div>
			))}
		</div>
	);
});

/**
 * The day's timeline, drawn still (stage 1): 24 hours from the day's start, the finer marks the zoom gives room for, the
 * day's events lying over each other as the core levels them, the timed tasks stacked as the core stacks them, the now
 * line on today. It opens where the core says (`DayService.openAt`): today on the now line, another day at an hour.
 */
export const Timeline = memo(function Timeline() {
	const { store, theme } = useHost();
	const services = store.getState();
	const date = useScreen((s) => s.date);
	const slotted = useScreen((s) => s.slotted);
	const items = useScreen((s) => s.items);
	const events = useScreen((s) => s.events);
	const settings = useScreen((s) => s.settings);
	const now = useScreen((s) => s.now);
	const hourPx = zoomShown(settings.zoom, null, settings.zoomLevels);
	const scroller = useRef<HTMLDivElement | null>(null);
	const [room, setRoom] = useState({ top: 0, bottom: 0 });
	const timed = events.timed;
	const allDay = events.allDay;

	const hours = useMemo(() => Array.from({ length: DESIGN.dayHours }, (_, index) => ({ minute: index * 60, label: formatHour(services.hourAt(index)) })), [services, date, settings]);
	const minor = useMemo(() => gridMarks(gridAt(hourPx), DESIGN.dayHours), [hourPx]);
	const nowY = now === null ? null : minutesToPx(now, hourPx);

	const placedEvents = useMemo(() => {
		const spans = timed.map((event) => services.eventSpan(event));
		const boxes = layoutEvents(spans);
		return timed.map((event, i) => ({ event, span: spans[i], box: boxes[i] })).sort((a, b) => a.box.layer - b.box.layer);
	}, [timed, services]);

	const blocks = useMemo(() => {
		const tasks = slotted.map((id) => items[id]).filter((item) => item !== undefined);
		const spans: TaskSpan[] = tasks.map((item) => services.spanOf(item));
		const boxes = stackTasks(spans, placedEvents.map(({ span, box }) => ({ ...span, level: box.level })), hourPx, { height: settings.cardHeight, gap: settings.cardGap });
		return tasks.map((item, i) => ({ item, span: spans[i], box: boxes[i] }));
	}, [slotted, items, services, placedEvents, hourPx, settings.cardHeight, settings.cardGap]);
	const stackEnd = blocks.reduce((end, { box }) => Math.max(end, box.top + box.height), 0);

	/** The day opens where the core says, held at its share of the height; room past the day lets an early or late minute stand there. */
	useLayoutEffect(() => {
		const el = scroller.current;
		if (!el) return;
		const open = services.openAt(date);
		const visible = el.clientHeight - DESIGN.labelLift * 2;
		const canvasHeight = hourPx * DESIGN.dayHours;
		const place = scrollPlace({ y: minutesToPx(open.minute, hourPx), canvasTop: DESIGN.labelLift, canvasHeight, visible }, open.kind === "now" ? LAYOUT.nowFraction : 0);
		setRoom({ top: place.roomTop, bottom: place.roomBottom });
		el.scrollTop = place.scrollTop;
	}, [date, hourPx, services]);

	const canvasStyle = { [PROPERTY.hour]: px(hourPx), [PROPERTY.roomTop]: px(room.top), [PROPERTY.roomBottom]: px(room.bottom), [PROPERTY.stackEnd]: px(stackEnd) } as CSSProperties;
	const y = (minute: number) => ({ [PROPERTY.y]: px(minutesToPx(minute, hourPx)) }) as CSSProperties;
	const hidden = (minute: number, lift: number) => labelHidesNearNow(minutesToPx(minute, hourPx), nowY, lift, DESIGN.nowPillHeight);

	return (
		<div className="tc-right" style={{ [PROPERTY.allDayExtraRows]: String(Math.max(0, allDay.length - 1)) } as CSSProperties}>
			<AllDayRows events={allDay} theme={theme} />
			<div className="tc-timeline" ref={scroller} data-timeline="">
				<div className="tc-canvas" style={canvasStyle}>
					{hours.map(({ minute, label }) => (
						<HourMark key={minute} minute={minute} label={label} style={y(minute)} hidden={hidden(minute, DESIGN.labelLift)} />
					))}
					<div>
						{minor.map((mark) => (
							<HourMark key={mark.minute} minute={mark.minute} label={mark.label} style={y(mark.minute)} hidden={hidden(mark.minute, DESIGN.minorLift)} minor />
						))}
					</div>
					<div className="tc-items">
						{placedEvents.map(({ event, span, box }) => {
							const height = minutesToPx(span.end, hourPx) - minutesToPx(span.start, hourPx);
							const style = { ...eventPaint(event, theme), ...y(span.start), [PROPERTY.length]: px(height), [PROPERTY.x]: px(box.left) } as CSSProperties;
							return (
								<div key={event.id} className={`tc-item tc-event${itemBox(span.start, span.end, hourPx).tiny ? " is-tiny" : ""}${services.isPast(event) ? " is-past" : ""}`} style={style}>
									<div className="tc-event-bar" />
									<div className="tc-event-body">
										<div className="tc-item-title">{event.title}</div>
									</div>
								</div>
							);
						})}
						{blocks.map(({ item, span, box }) => {
							const corner = stackCorner(box, item.slot!.start, span);
							const style = { [PROPERTY.y]: px(box.top), [PROPERTY.length]: px(box.height), [PROPERTY.x]: px(box.left) } as CSSProperties;
							return (
								<div key={item.id} className={`tc-block${box.overlay ? " is-over" : ""}`} style={style} data-block={item.id}>
									<div className="tc-block-card" data-status={item.status} {...paintOf(item.colors)}>
										<Title text={item.block.text} />
										{item.project?.mark ? (
											<span className="tc-project-mark" aria-label={item.project.name} title={item.project.name}>
												<Icon name="project" />
											</span>
										) : null}
										{corner ? (
											<span className="tc-block-meta">
												<span>{corner[0]}</span>
												<span>{corner[1]}</span>
											</span>
										) : null}
									</div>
								</div>
							);
						})}
					</div>
					{now !== null ? (
						<div className="tc-now" style={y(now)}>
							<span className="tc-now-pill">{formatTime(services.clockMinute())}</span>
							<div className="tc-now-line" />
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
});

function HourMark({ minute, label, style, hidden, minor = false }: { readonly minute: number; readonly label: string | null; readonly style: CSSProperties; readonly hidden: boolean; readonly minor?: boolean }) {
	return (
		<>
			{label !== null ? (
				<div className={`tc-hour-label${minor ? " is-minor" : ""}${hidden ? " is-hidden" : ""}`} style={style} data-minute={minute}>
					{label}
				</div>
			) : null}
			<div className={`tc-hour-line${minor ? " is-minor" : ""}`} style={style} />
		</>
	);
}
