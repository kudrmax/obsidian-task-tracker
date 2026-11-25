import { type CSSProperties, memo, useState } from "react";
import { DESIGN, PROPERTY } from "../../shared/design";
import type { IconName } from "../../shared/icons";
import type { FollowGestures } from "../gestures/FollowRibbon";
import { StripWheel } from "../gestures/RibbonTrack";
import { useWheelTurn } from "../gestures/WheelTurn";
import { CALENDAR, offsetOf, standAt, type Stop, stopShowing } from "../layout/columns";
import type { ListId } from "../port";
import { useData, useScreenApi } from "../store";
import { Icon } from "./Icon";

/** The wheel's icons, left to right: the columns of the strip, the day's list as Now. */
const ICONS: readonly { readonly name: IconName; readonly label: string; readonly shows: ListId | null }[] = [
	{ name: "inbox", label: "Inbox", shows: "inbox" },
	{ name: "soon", label: "Soon", shows: "soon" },
	{ name: "now", label: "Now", shows: "day" },
	{ name: "calendar", label: "Calendar", shows: null },
];

/** The stop a tap on an icon turns to: where it stands, when it shows the icon's column; else the nearest that does; the calendar's own for the calendar. */
const stopFor = (list: ListId | null, from: Stop): Stop => (list === null ? "calendar" : stopShowing(from, list));

/**
 * The wheel at the bottom centre (F28–F30, F33; the design's «Колёсико»): a window two icons wide stands still, the four
 * icons roll under it with the ribbon, and the track holds one neighbour on either side where there is one. A tap on an
 * icon out of the window turns the ribbon to the nearest stop showing it; a finger turns the wheel (a quick swipe one
 * stop, a slow one freely), and the columns slide once it is let go. A dot on the calendar's icon says a calendar in use
 * has gone old (orange) or broken (red). ← and → are the screen's keys (F31), the same steps.
 */
export const Wheel = memo(function Wheel({ at }: { readonly at: FollowGestures["at"] }) {
	const api = useScreenApi();
	const alert = useData((d) => d.day.alert);
	const [held, setHeld] = useState<number | null>(null);
	const [settling, setSettling] = useState<number | null>(null);
	const standing = () => offsetOf(api.getState().stop);
	const go = (to: number) => {
		setSettling(to === standing() ? null : to);
		if (to !== standing()) standAt(api.getState(), to);
	};
	const bind = useWheelTurn({
		standing,
		last: CALENDAR,
		step: () => DESIGN.wheelIcon,
		turned: setHeld,
		landed: (to) => {
			setHeld(null);
			go(to ?? standing());
		},
	});
	const tap = (list: ListId | null) => {
		const from = api.getState().stop;
		const to = stopFor(list, from);
		if (to !== from) go(offsetOf(to));
	};
	const reel = (lens: boolean) => (
		<span className="tc-seg-reel">
			{ICONS.map((icon, i) => (
				<span key={icon.name} className="tc-seg-icon" style={{ [PROPERTY.wheelIcon]: String(i) } as CSSProperties} aria-hidden={lens || undefined} aria-label={lens ? undefined : icon.label} onClick={lens ? undefined : () => tap(icon.shows)}>
					<Icon name={icon.name} />
					{icon.name === "calendar" && alert !== "none" ? <span className={`tc-dot${alert === "broken" ? " is-broken" : ""}`} /> : null}
				</span>
			))}
		</span>
	);
	return (
		<StripWheel at={at} last={CALENDAR} held={held} settling={settling} onSettled={() => setSettling(null)} className="tc-seg" role="group" aria-label="Columns" tabIndex={0} {...bind()}>
			<span className="tc-seg-view">{reel(false)}</span>
			<span className="tc-seg-pill">{reel(true)}</span>
		</StripWheel>
	);
});
