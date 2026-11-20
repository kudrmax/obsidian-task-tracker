import { type CSSProperties, type MouseEvent, type TouchEvent, useEffect, useState } from "react";
import { PROPERTY } from "../../design";
import { Drag, type Grab, type Landing } from "../drag/Drag";
import { Layers } from "../layers/Layers";
import { Layout, type Place } from "../layout/Layout";
import { StoreContext, type ScreenStore, useScreen } from "../store";
import { type BlockLook, Card, PressedLook } from "./Card";
import { QuickBar } from "./QuickBar";
import { Icon } from "./Icon";
import { HostContext, type ScreenHost } from "./host";

/** Touches stay the screen's: Obsidian's drawers never take a swipe meant for it (stage 0, «Integration findings» 8). */
const keepTouch = (event: TouchEvent) => event.stopPropagation();

/** The carried plus: the round button itself, under the finger. */
const CARRIED_PLUS = (
	<div className="tc-btn is-round is-accent tc-plus is-carried">
		<Icon name="plus" />
	</div>
);

/**
 * The carried task: a compact plate around the point the pointer took it by (`--tc-grab-x`, `--tc-grab-y`), the title cut
 * short; let go, it takes the shape of its place (`--tc-landing-…`, a block's look on the calendar).
 */
const carried = (id: string, grab: Grab, landing: Landing) => (
	<div
		className={`tc-carried${landing.block ? " is-block" : ""}`}
		style={{ [PROPERTY.grabX]: `${grab.x}px`, [PROPERTY.grabY]: `${grab.y}px`, [PROPERTY.landingLevel]: String(landing.level), ...(landing.width === null ? {} : { [PROPERTY.landingWidth]: `${landing.width}px` }), ...(landing.height === null ? {} : { [PROPERTY.landingHeight]: `${landing.height}px` }) } as CSSProperties}
	>
		<Card id={id} copy />
	</div>
);

/** A tap anywhere on the screen but on a calendar's task or its dots lets the selected task go (F102); one on a layer (the menu, its backdrop) leaves it. */
const letSelectionGo = (event: MouseEvent, store: ScreenStore) => {
	if (!(event.target as Element | null)?.closest?.(".tc-block, .tc-pinned, .tc-backdrop, .tc-panel")) store.getState().select(null);
};

/**
 * The screen (spec, principle 1): one React tree over one store per mounted screen, the same in every place; the place
 * goes to the layout and nowhere else.
 */
export function TaskScreen({ store, host, place }: { readonly store: ScreenStore; readonly host: ScreenHost; readonly place: Place }) {
	useEffect(() => store.getState().start(), [store]);
	const [pressed] = useState<{ current: BlockLook | null }>(() => ({ current: null }));
	return (
		<PressedLook.Provider value={pressed}>
		<StoreContext.Provider value={store}>
			<HostContext.Provider value={host}>
				<Layers>
					<Drag doc={host.doc} carried={carried} plus={CARRIED_PLUS} onLift={() => host.haptics.tap()}>
						<Root place={place} store={store} />
					</Drag>
				</Layers>
			</HostContext.Provider>
		</StoreContext.Provider>
		</PressedLook.Provider>
	);
}

/** The screen's element: its place's class, `is-entering` while a task is typed, new or renamed (Obsidian's phone toolbar stays away then, the design's «Полоса»). */
function Root({ place, store }: { readonly place: Place; readonly store: ScreenStore }) {
	/** A task typed: a new one, or one renamed in place (both the plugin's quick entry). */
	const entering = useScreen((s) => s.entry !== null);
	return (
		<div className={`task-calendar is-engine is-${place}${entering ? " is-entering" : ""}`} onTouchStart={keepTouch} onTouchMove={keepTouch} onTouchEnd={keepTouch} onClick={(event) => letSelectionGo(event, store)}>
			<Layout place={place} />
			<QuickBar />
		</div>
	);
}
