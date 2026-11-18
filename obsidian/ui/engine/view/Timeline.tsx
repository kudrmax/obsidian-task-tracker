import { type CSSProperties, memo, useCallback, useMemo } from "react";
import { PROPERTY } from "../../design";
import { BASE_SCALE, TimeScale } from "../layout/timeScale";
import { useData, useScreen } from "../store";
import { MovingRow } from "./MovingRow";

const px = (n: number) => `${n}px`;

/**
 * The shown day's timeline: its hours, the now line on today, its timed tasks as blocks, each placed by the one time scale
 * (spec, «Time scale»). It scrolls natively; it opens on the now line, revealed by the browser (`scrollIntoView`).
 */
export const Timeline = memo(function Timeline() {
	const day = useData((d) => d.day);
	const readBlocks = useData((d) => d.day.blocks, true);
	const now = useScreen((s) => s.now);
	const scale = BASE_SCALE;
	const order = useMemo(() => readBlocks.map((b) => `${b.id}@${b.start}-${b.end}:${b.lane}/${b.lanes}`).join(" "), [readBlocks]);
	/** On opening, the now line in the middle of the room; another day opens at its top. */
	const reveal = useCallback((el: HTMLElement | null) => el?.scrollIntoView({ block: "center", inline: "nearest" }), []);
	const y = (minute: number) => ({ [PROPERTY.y]: px(scale.y(minute)) }) as CSSProperties;
	const canvas = { [PROPERTY.hour]: px(scale.hourPx) } as CSSProperties;
	return (
		<div className="tc-timeline" data-timeline="">
			<div className="tc-canvas" style={canvas}>
				{day.hours.map((label, hour) => (
					<div key={label} className="tc-hour-mark">
						<div className={`tc-hour-label${day.isToday && Math.abs(scale.y(hour * 60) - scale.y(now.minute)) < TimeScale.NEAR_NOW ? " is-hidden" : ""}`} style={y(hour * 60)} data-hour={label}>
							{label}
						</div>
						<div className="tc-hour-line" style={y(hour * 60)} />
					</div>
				))}
				<div className="tc-items">
						{day.blocks.map((block) => (
							<MovingRow key={block.id} id={block.id} order={order} carried={false} fresh={false} className="tc-block" style={{ ...y(block.start), [PROPERTY.length]: px(scale.y(block.end) - scale.y(block.start)), [PROPERTY.x]: `${(100 * block.lane) / block.lanes}%`, [PROPERTY.xEnd]: `${(100 * (block.lanes - block.lane - 1)) / block.lanes}%` } as CSSProperties}>
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
	);
});

const BlockFace = memo(function BlockFace({ id }: { readonly id: string }) {
	const face = useData((d) => d.cards[id]);
	if (!face) return null;
	return (
		<div className="tc-block-card" data-block={id} data-status={face.inProgress ? "inProgress" : "open"} data-priority={face.color ?? undefined}>
			<div className="tc-card-title">{face.title}</div>
		</div>
	);
});
