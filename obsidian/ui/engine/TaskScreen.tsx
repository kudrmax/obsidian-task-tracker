import { motion, useMotionValue } from "motion/react";
import { type TouchEvent, useEffect } from "react";
import { Capsule, Plus, useWheelStyle, ViewButton, Wheel } from "./BottomRow";
import { RibbonStage } from "./Ribbon";
import { ScreenContext, type ScreenHost, useHost, useScreen } from "./ScreenContext";
import { StillStage } from "./StillStage";

/** The now line moves once a minute; it is asked this often so a minute is never late by much. */
const NOW_TICK_MS = 15_000;

/**
 * The screen: one component for the plugin's leaf and the block in a project's note, differing only by props. It draws the
 * view the core reads (`FunnelView`): the mode's layout, the bottom row; or, with no tasks file, the offer to create it.
 */
export function TaskScreen(host: ScreenHost) {
	return (
		<ScreenContext.Provider value={host}>
			<Screen />
		</ScreenContext.Provider>
	);
}

/** Obsidian's phone opens its side panels on a sideways swipe from the edges: inside the view the fingers are the view's. */
const keepFromObsidian = (e: TouchEvent) => e.stopPropagation();

function Screen() {
	const { store, place, win } = useHost();
	const phase = useScreen((s) => s.phase);
	const view = useScreen((s) => s.funnel?.view ?? null);
	const position = useMotionValue(0);
	const wheelStyle = useWheelStyle(position);

	useEffect(() => {
		void store.getState().refresh();
		void store.getState().refreshEvents();
		const tick = win.setInterval(() => store.getState().tickNow(), NOW_TICK_MS);
		return () => win.clearInterval(tick);
	}, [store, win]);

	const ribbon = view?.layout.swipe === "pages";
	const classes = ["task-calendar", place === "note" ? "is-note is-block" : "", view?.wheel ? "has-wheel" : ""].filter(Boolean).join(" ");
	return (
		<motion.div className={classes} style={wheelStyle} onTouchStart={keepFromObsidian} onTouchMove={keepFromObsidian} onTouchEnd={keepFromObsidian} onTouchCancel={keepFromObsidian}>
			{phase === "missing" ? <MissingFile /> : null}
			{phase === "ready" && view ? ribbon ? <RibbonStage position={position} /> : <StillStage layout={view.layout} /> : null}
			<div className="tc-fade" />
			{phase === "ready" ? (
				<>
					<Capsule />
					{view?.wheel ? <Wheel position={position} /> : null}
					<ViewButton />
					<Plus />
				</>
			) : null}
		</motion.div>
	);
}

/** No tasks file: the path the settings name and a button that creates it. */
function MissingFile() {
	const { store } = useHost();
	const path = useScreen((s) => s.settings.tasksFile);
	return (
		<div className="tc-missing">
			<div>{`No tasks file at ${path}`}</div>
			<button className="tc-btn is-pill is-plain tc-missing-btn" onClick={() => void store.getState().createFile()}>
				Create file
			</button>
		</div>
	);
}
