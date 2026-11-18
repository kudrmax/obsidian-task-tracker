import { type CSSProperties, type TouchEvent, useEffect } from "react";
import { PROPERTY } from "../../design";
import { Drag, type Grab, type Landing } from "../drag/Drag";
import { Layers } from "../layers/Layers";
import { Layout, type Place } from "../layout/Layout";
import { StoreContext, type ScreenStore } from "../store";
import { Card } from "./Card";
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

/**
 * The screen (spec, principle 1): one React tree over one store per mounted screen, the same in every place; the place
 * goes to the layout and nowhere else.
 */
export function TaskScreen({ store, host, place }: { readonly store: ScreenStore; readonly host: ScreenHost; readonly place: Place }) {
	useEffect(() => store.getState().start(), [store]);
	return (
		<StoreContext.Provider value={store}>
			<HostContext.Provider value={host}>
				<Layers>
					<Drag doc={host.doc} carried={carried} plus={CARRIED_PLUS} onLift={() => host.haptics.tap()}>
						<div className={`task-calendar is-engine is-${place}`} onTouchStart={keepTouch} onTouchMove={keepTouch} onTouchEnd={keepTouch}>
							<Layout place={place} />
						</div>
					</Drag>
				</Layers>
			</HostContext.Provider>
		</StoreContext.Provider>
	);
}
