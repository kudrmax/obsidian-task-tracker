import { type CSSProperties, type TouchEvent, useEffect } from "react";
import { Drag } from "../drag/Drag";
import { Layers } from "../layers/Layers";
import { Layout, type Place } from "../layout/Layout";
import { StoreContext, type ScreenStore } from "../store";
import { Card } from "./Card";
import { HostContext, type ScreenHost } from "./host";

/** Touches stay the screen's: Obsidian's drawers never take a swipe meant for it (stage 0, «Integration findings» 8). */
const keepTouch = (event: TouchEvent) => event.stopPropagation();

/** The carried card: a compact plate around the point the pointer took it by (`--tc-grab-x`), the title cut short. */
const carried = (id: string, grab: number) => (
	<div className="tc-carried" style={{ "--tc-grab-x": `${grab}px` } as CSSProperties}>
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
					<Drag doc={host.doc} carried={carried} onLift={() => host.haptics.tap()}>
						<div className={`task-calendar is-engine is-${place}`} onTouchStart={keepTouch} onTouchMove={keepTouch} onTouchEnd={keepTouch}>
							<Layout place={place} />
						</div>
					</Drag>
				</Layers>
			</HostContext.Provider>
		</StoreContext.Provider>
	);
}
