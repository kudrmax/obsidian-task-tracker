import { motion, type MotionValue, useTransform } from "motion/react";
import { type CSSProperties, memo } from "react";
import { type DropColumn, funnelPlaceShowing } from "../../../core/application/contracts";
import { PROPERTY } from "../design";
import type { IconName } from "../kit/icons";
import { Icon } from "./Icon";
import { useHost, useScreen } from "./ScreenContext";

/** Bottom left: Undo, dim when there is nothing to take back, and «⋯». */
export const Capsule = memo(function Capsule() {
	const { store } = useHost();
	const canUndo = useScreen((s) => s.canUndo);
	return (
		<div className="tc-capsule">
			<button className={`tc-btn is-icon is-plain tc-undo${canUndo ? "" : " is-off"}`} aria-label="Undo" onClick={() => void store.getState().undo()}>
				<Icon name="undo" />
			</button>
			<button className="tc-btn is-icon is-plain tc-more-open" aria-label="More">
				<Icon name="more" />
			</button>
		</div>
	);
});

/** Bottom right: the plus. */
export const Plus = memo(function Plus() {
	/** While a card is carried the plus and the capsule beside it fade out, and fade back once it lands. */
	const carrying = useScreen((s) => s.drag !== null);
	return (
		<button className={`tc-btn is-round is-accent tc-plus${carrying ? " is-hidden" : ""}`} aria-label="New task">
			<Icon name="plus" />
		</button>
	);
});

/** The core names a mode's icon by Lucide's name; the design draws its own. */
const VIEW_ICONS: Readonly<Record<string, IconName>> = { "columns-2": "columns2", "columns-4": "columns4", "rows-3": "rows", "folder-tree": "byProject" };

/** The view button: the plus's circle wearing the chosen mode's icon. */
export const ViewButton = memo(function ViewButton() {
	const icon = useScreen((s) => s.funnel?.view.icon ?? null);
	const name = icon ? VIEW_ICONS[icon] : undefined;
	if (!name) return null;
	return (
		<button className="tc-btn is-round is-plain tc-view-btn" aria-label="View">
			<Icon name={name} />
		</button>
	);
});

type WheelColumn = "inbox" | "soon" | "now" | "calendar";
const WHEEL: readonly WheelColumn[] = ["inbox", "soon", "now", "calendar"];
const WHEEL_NAMES: Readonly<Record<WheelColumn, string>> = { inbox: "Inbox", soon: "Soon", now: "Now", calendar: "Calendar" };
const WHEEL_LISTS: Readonly<Record<WheelColumn, DropColumn | null>> = { inbox: "inbox", soon: "soon", now: "day", calendar: null };
const HALF = 0.5;
/** The wheel's window shows two columns: the place's pair. */
const SPAN = 2;

/** The wheel's own measures at `position` (0 at Inbox–Soon, 2 at Now–calendar), set on the screen: the view button stands by them too. */
export function useWheelStyle(position: MotionValue<number>): CSSProperties {
	const before = useTransform(position, (at) => Math.max(0, Math.min(1, at)));
	const after = useTransform(position, (at) => Math.max(0, Math.min(1, WHEEL.length - at - SPAN)));
	return { [PROPERTY.windowAt]: position, [PROPERTY.span]: SPAN, [PROPERTY.before]: before, [PROPERTY.after]: after } as unknown as CSSProperties;
}

/**
 * The wheel at the bottom, two columns only: four icons, Inbox, Soon, Now and the calendar, rolling under a pill that shows
 * which two the window holds; it turns with the ribbon. A tap on an icon outside the window turns the ribbon to the
 * nearest place that shows it (`funnelPlaceShowing`, the core's).
 */
export const Wheel = memo(function Wheel({ position }: { readonly position: MotionValue<number> }) {
	const { store } = useHost();
	const alert = useScreen((s) => s.events.alert);
	const words = useScreen((s) => s.events.words.alert);
	const tap = (column: WheelColumn) => {
		const list = WHEEL_LISTS[column];
		const at = store.getState().place;
		store.getState().setPlace(list === null ? "calendar" : funnelPlaceShowing(list, at));
	};
	const reel = (lens: boolean) => (
		<span className="tc-seg-reel">
			{WHEEL.map((column, i) => (
				<WheelIcon key={column} column={column} index={i} position={position} lens={lens} onTap={tap} dot={column === "calendar" ? { alert, words } : null} />
			))}
		</span>
	);
	return (
		<div className="tc-seg" role="group" aria-label="Columns" tabIndex={0}>
			<div className="tc-seg-view">{reel(false)}</div>
			<span className="tc-seg-pill">{reel(true)}</span>
		</div>
	);
});

function WheelIcon({ column, index, position, lens, onTap, dot }: { readonly column: WheelColumn; readonly index: number; readonly position: MotionValue<number>; readonly lens: boolean; readonly onTap: (column: WheelColumn) => void; readonly dot: { readonly alert: string; readonly words: string } | null }) {
	/** Away from the window an icon shrinks and fades by how far out it stands. */
	const depth = useTransform(position, (at) => Math.max(0, Math.abs(index + HALF - (at + SPAN / 2)) - (SPAN / 2 - HALF)));
	return (
		<motion.span className="tc-seg-icon" data-column={column} aria-label={lens ? undefined : WHEEL_NAMES[column]} aria-hidden={lens ? "true" : undefined} style={{ [PROPERTY.depth]: depth } as unknown as CSSProperties} onClick={() => onTap(column)}>
			<Icon name={column} />
			{dot ? <span className={`tc-dot${dot.alert === "none" ? "" : " is-shown"}${dot.alert === "broken" ? " is-broken" : ""}`} title={dot.words || undefined} /> : null}
		</motion.span>
	);
}
