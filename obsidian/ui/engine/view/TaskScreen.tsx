import { type CSSProperties, type MouseEvent, type PointerEvent, type TouchEvent, useEffect, useId, useRef } from "react";
import { PROPERTY } from "../../shared/design";
import { Drag, type Grab, type Landing, useTouchPresses } from "../drag/Drag";
import { Layers } from "../layers/Layers";
import { Layout, listsOf, type Place, reachOf, useProjectsPlace } from "../layout/Layout";
import { StoreContext, type ScreenStore, useScreen } from "../store";
import { Card } from "./Card";
import { RowScreen } from "./MovingRow";
import { MissingFile } from "./MissingFile";
import { QuickBar } from "./QuickBar";
import { Icon } from "./Icon";
import { HostContext, type ScreenHost, useHost } from "./host";

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
		<CarriedFace id={id} />
	</div>
);

/**
 * What is carried, as the card it lifted: a task's card, or a section's header drawn as a plate of a card's look, its
 * name and how many tasks it holds (the design's «Поднятая секция», F63).
 */
function CarriedFace({ id }: { readonly id: string }) {
	const section = useScreen((s) => Object.values(s.shown.lists).flatMap((list) => list.rows).find((row) => row.kind === "section" && row.id === id));
	if (section?.kind !== "section") return <Card id={id} copy />;
	return (
		<div className="tc-card tc-section-plate" data-copy={id}>
			<div className="tc-card-title">{section.title}</div>
			<span className="tc-count">{section.tasks}</span>
		</div>
	);
}

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
	const rows = useId();
	return (
		<RowScreen.Provider value={rows}>
		<StoreContext.Provider value={store}>
			<HostContext.Provider value={host}>
				<Layers>
					<Drag doc={host.doc} carried={carried} plus={CARRIED_PLUS} onLift={() => host.haptics.tap()}>
						<Root place={place} store={store} />
					</Drag>
				</Layers>
			</HostContext.Provider>
		</StoreContext.Provider>
		</RowScreen.Provider>
	);
}

/**
 * What the screen tells its store once a read is on the page (Decision 132): the read drawn, so what came in it no longer
 * comes in; and the port's notice shown once.
 */
function useDrawn(store: ScreenStore) {
	const { notice: show } = useHost();
	const readSeq = useScreen((s) => s.readSeq);
	const notice = useScreen((s) => s.notice);
	useEffect(() => store.getState().drawn(readSeq), [store, readSeq]);
	useEffect(() => {
		if (notice) show(notice.text);
	}, [notice, show]);
}

/** Where a press keeps the typing going: the field itself, its bar and the bar's panels. */
const TYPING = ".tc-quick-row, .tc-quick-bar, .tc-quick-panel";

/** The screen's element: its place's class, `is-entering` while a task is typed, new or renamed (Obsidian's phone toolbar stays away then, the design's «Полоса»). */
function Root({ place, store }: { readonly place: Place; readonly store: ScreenStore }) {
	/** A task typed: a new one, or one renamed in place (both the plugin's quick entry). */
	const entering = useScreen((s) => s.entry !== null);
	const lists = useScreen((s) => listsOf(s.view));
	const touches = useTouchPresses();
	const projects = useProjectsPlace();
	useDrawn(store);
	/**
	 * A finger's tap elsewhere ends the typing and does only that (the audit's 17, as the menu's backdrop does, Decision 74):
	 * the text is written and the card tapped opens no menu. A scroll is no tap: it ends nothing.
	 */
	const ending = useRef(false);
	const pressed = (event: PointerEvent) => {
		ending.current = event.pointerType === "touch" && store.getState().entry !== null && !(event.target as Element).closest?.(TYPING);
	};
	const clicked = (event: MouseEvent) => {
		if (!ending.current) return;
		ending.current = false;
		event.stopPropagation();
		const s = store.getState();
		if (s.entry && !s.entry.stack) s.commitEntry(s.entryText, false);
	};
	return (
		<div className={`task-calendar is-engine is-${place}${entering ? " is-entering" : ""}${projects.className}`} style={projects.style} onPointerDownCapture={pressed} onClickCapture={clicked} {...touches} onTouchStart={keepTouch} onTouchMove={keepTouch} onTouchEnd={keepTouch} onClick={(event) => letSelectionGo(event, store)}>
			<Layout place={place} />
			<QuickBar reach={reachOf(place, lists)} />
			<MissingFile />
		</div>
	);
}
