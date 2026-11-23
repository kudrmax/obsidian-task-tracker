import { autoUpdate, flip, FloatingFocusManager, FloatingOverlay, FloatingPortal, hide, type Middleware, type MiddlewareState, offset, type Placement, useDismiss, useFloating, useInteractions, useRole, useTransitionStatus } from "@floating-ui/react";
import { type CSSProperties, createContext, type MouseEvent as ReactMouseEvent, type MutableRefObject, type ReactNode, type RefObject, useContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DESIGN, PROPERTY } from "../../shared/design";
import type { MenuFrom } from "../port";
import { useScreenApi } from "../store";
import { blockTop } from "./block";
import { LAYER_MS } from "./motion";

/**
 * Layers and focus (spec, «The owners»): every menu, popover and sheet is a Floating UI element. It is placed against the
 * element it opens from (`flip`, `shift`), dismissed by Escape and an outside press (`useDismiss`; the key table takes no
 * Escape then), keeps the focus inside (`FloatingFocusManager`) and is portalled into the view's own document, so a
 * pop-out window draws its own (stage 0, «Integration findings» 11).
 */

/**
 * What a calendar's task shows there besides a list's card (F91, F93, F94): its corner (its start in a stack, its length
 * when shorter than the card), the moving edge's time on a pill while a dot is pulled, and the start written on its dashed
 * place while carried. The menu's copy of a pressed block is drawn in the same look.
 */
export interface BlockLook {
	readonly corner: readonly [string, string] | null;
	readonly pill: string | null;
	readonly clock: string;
}

/** Where the menu opened from: the element pressed, the copy standing over it, and a calendar block's look there. */
export interface MenuOrigin {
	readonly element: Element | null;
	readonly look: BlockLook | null;
}

const NO_ORIGIN: MenuOrigin = { element: null, look: null };
/** The one record of where the menu opened from, written only by `useMenuFrom`'s opener. */
const OriginContext = createContext<MutableRefObject<MenuOrigin> | null>(null);
/** The new task's field as it stands on the screen: the desktop's capsule stands by it. */
const FieldContext = createContext<{ readonly field: Element | null; readonly setField: (el: Element | null) => void } | null>(null);

export function Layers({ children }: { readonly children: ReactNode }) {
	const origin = useRef<MenuOrigin>(NO_ORIGIN);
	const [field, setField] = useState<Element | null>(null);
	const fields = useMemo(() => ({ field, setField }), [field]);
	return (
		<OriginContext.Provider value={origin}>
			<FieldContext.Provider value={fields}>{children}</FieldContext.Provider>
		</OriginContext.Provider>
	);
}

/** The new task's field and how it says where it stands. */
export function useField(): { readonly field: Element | null; readonly setField: (el: Element | null) => void } {
	const field = useContext(FieldContext);
	if (!field) throw new Error("a field outside the screen's layers");
	return field;
}

/**
 * A right click (the desktop's secondary click, `docs/plugin/screen.md` «правый клик — тоже меню»): the browser's own menu
 * kept away; whether it opens ours. A finger's held press is the drag's, never a menu.
 */
export const secondaryClick = (event: ReactMouseEvent): boolean => {
	event.preventDefault();
	return (event.nativeEvent as PointerEvent).pointerType !== "touch";
};

function useOrigin(): MutableRefObject<MenuOrigin> {
	const origin = useContext(OriginContext);
	if (!origin) throw new Error("a menu's origin outside the screen's layers");
	return origin;
}

/** Where the menu last opened from, for the menu to stand over it. */
export function useMenuOrigin(): MenuOrigin {
	return useOrigin().current;
}

/**
 * The one way a menu opens (spec, «Layers and focus»): the task or event `id`, opened `from` there, standing over `element`
 * (the pressed thing, found from the event's own target, never looked up in the document), a calendar block's copy drawn
 * in its `look`; `reveal` for a tap, which brings a card partly out of its list's sight into it first.
 */
export function useMenuFrom(): (id: string, from: MenuFrom, element: Element, look?: BlockLook | null, reveal?: boolean) => void {
	const origin = useOrigin();
	const api = useScreenApi();
	return useCallback(
		(id, from, element, look = null, reveal = false) => {
			origin.current = { element, look };
			api.getState().openMenu(id, from, reveal);
		},
		[origin, api],
	);
}

/** The element takes the keyboard's focus each time the store asks (`seq`, null: not asked): a card a rename ended on by a key (Decision 58). */
export function useFocusWhen(node: RefObject<HTMLElement | null>, seq: number | null): void {
	useEffect(() => {
		if (seq !== null) node.current?.focus({ preventScroll: true });
	}, [node, seq]);
}

/** The pressed thing marked `marker` around or inside `target` (a row's wrapper holds its card). */
export const pressedIn = (target: Element, marker: string): Element => target.closest(marker) ?? target.querySelector(marker) ?? target;

export interface MenuLayerProps {
	readonly open: boolean;
	readonly onClose: () => void;
	/** Escape closes the menu; not while a field typed in it takes Escape itself (a bar's panel closes first). */
	readonly escapes?: boolean;
	/** The element of the view's own document that holds the layer. */
	readonly root: HTMLElement;
	/** The element pressed: the copy stands over it. */
	readonly reference: Element | null;
	/** What the panel goes by when not the copy: a card of the stack under the copy (a subtask's menu, F107). */
	readonly panelBy?: Element | null;
	readonly label: string;
	/** The copy of what was pressed, and under it a calendar task's subtasks (F107), drawn over the backdrop where it stood. */
	readonly over: ReactNode;
	/** The panel's groups, top to bottom: when the panel fits on neither side of the copy, its first groups stand over it. */
	readonly groups: readonly ReactNode[];
	/** The panel's own classes beside `tc-panel is-menu`: its page's. */
	readonly panelClass: string;
	/** The page shown: another page lays the panel out afresh. */
	readonly page: string;
	/** What else changes the panel's height on the same page (a question in place of a row): it measures and places the block again, the focus staying where it is. */
	readonly shape?: string;
	/** The start of a description by the copy (F129, F130), and what a tap on it does. */
	readonly peek?: { readonly content: ReactNode; readonly onPress: () => void };
	/** The copy keeps the pressed thing's width (an event wraps its title inside it); otherwise it grows right for its title. */
	readonly keepWidth?: boolean;
	/** The block stands higher than what was pressed, or right over it: what is pinned on the pressed thing goes or stays. */
	readonly onLift?: (lifted: boolean) => void;
	/** The menu closed has faded out, or was taken off before it had: what was tapped in it may happen now (F132). */
	readonly onGone?: () => void;
}


/** How a part of the menu stands while it opens, is open and closes: the design's classes, which its CSS transitions run between. */
const motionClass = (status: string, ready: boolean) => (status === "open" && ready ? " is-shown" : status === "close" ? " is-closing" : "");

/**
 * The menu over a pressed card, block or event (the plugin's `LiftedMenu`, F110, F297), as Floating UI builds a menu, and
 * as iOS's context menu stands (Max, 2026-11-20, Decision 120): one block, the copy of what was pressed on top (its whole
 * title showing) and the panel right under it, its left edge on the copy's, never split around the copy. The block stands
 * over the task; where the room under the task can't take the panel, the whole block stands higher, the copy no higher
 * than the window's top, and a panel still too tall scrolls within its room. Escape and a press on the backdrop close it
 * (`useDismiss`).
 *
 * Every part is placed before it is shown (`isPositioned`): it mounts in its closed state at its place, lowered by
 * `--tc-menu-lift` onto the task, and only then takes `is-shown`, so its CSS transition lifts the block from the task to
 * its place in one move while the panel grows from the copy's edge (`--tc-menu-rise`, `--tc-menu-scale`); closing, it
 * goes back down into the task. Another page grows or shrinks the panel in place (`scrollWithin`). The parts open and
 * close together (Floating UI's transition status keeps them mounted while they fade, `LAYER_MS`).
 */
export function MenuLayer({ open, onClose, escapes = true, root, reference, label, over, groups, panelClass, page, shape, keepWidth = false, onLift, onGone }: MenuLayerProps) {
	const parts = useRef<{ upper: HTMLElement | null; lower: HTMLElement | null }>({ upper: null, lower: null });
	/** The window less the phone's safe areas (`env(safe-area-inset-*)`, the plugin's `menuRoom`): every part stays inside it. */
	const safe = useRef<HTMLElement | null>(null);
	const holdSafe = useCallback((el: HTMLDivElement | null) => {
		safe.current = el;
	}, []);
	/** Where the block stood with its panel: typing in the menu (its panel gone, a stack's card the field) keeps it there. */
	const held = useRef<number | null>(null);
	/** The block: the copy and the panel under it, one element Floating UI places against the pressed thing. */
	const block = useFloating({
		open,
		onOpenChange: (next) => {
			if (!next) onClose();
		},
		placement: "bottom-start",
		strategy: "fixed",
		transform: false,
		middleware: [blockIn(safe, parts, keepWidth, held)],
		whileElementsMounted: autoUpdate,
		elements: { reference },
	});
	const placed = block.middlewareData.block as BlockPlace | undefined;
	/** Another page measures and places the block again (its panel's own height is set from the page, which the size observer misses). */
	const placeBlock = block.update;
	useLayoutEffect(() => placeBlock(), [page, shape, groups.length, placeBlock]);
	/** Where the block last stood while open: closing, it goes back down into the task from there, though the card under it is gone meanwhile (Rename turns the card into the field in the same tap, F132). */
	const stood = useRef<{ styles: CSSProperties; spot: BlockPlace | undefined }>({ styles: {}, spot: undefined });
	if (open && block.isPositioned) stood.current = { styles: block.floatingStyles, spot: placed };
	const shown = open ? { styles: block.floatingStyles, spot: placed } : stood.current;
	const isLifted = open && Math.abs(placed?.lift ?? 0) > 0.5;
	useLayoutEffect(() => onLift?.(isLifted), [isLifted, onLift]);
	/** Another page (a subtask's menu in the same sheet too) takes the focus as the first did: a press on a stack's card gave it to nothing. */
	const firstPage = useRef(page);
	useEffect(() => {
		const lower = parts.current.lower;
		/** A page whose field took the focus as it mounted («New project…»'s name) keeps it. */
		if (page !== firstPage.current && lower && !lower.contains(lower.ownerDocument.activeElement)) lower.focus({ preventScroll: true });
	}, [page]);
	const { isMounted, status } = useTransitionStatus(block.context, { duration: { open: LAYER_MS.open, close: LAYER_MS.close } });
	const gone = useRef(onGone);
	gone.current = onGone;
	useEffect(() => {
		if (!isMounted) gone.current?.();
	}, [isMounted]);
	useEffect(() => () => gone.current?.(), []);
	const shownOnce = useRef(false);
	/** Closed by the click, not the press: the finger's tap ends on the backdrop, never on a card under the fading menu. */
	const dismiss = useDismiss(block.context, { escapeKey: escapes, outsidePressEvent: "click", outsidePress: (event) => !(event.target instanceof Element && (block.refs.floating.current?.contains(event.target) || event.target.closest(".tc-quick-bar, .tc-quick-panel"))) });
	const { getFloatingProps } = useInteractions([dismiss, useRole(block.context, { role: "menu" })]);
	if (!isMounted) return null;
	/** Shown once it stands where its page measured it: the panel's groups counted in the block's place (none while typing in the menu). */
	const ready = block.isPositioned && placed !== undefined && placed.groups === groups.length;
	/** Shown once, the menu stays shown while its pages change: only its first showing waits to be placed. */
	if (status === "open" && ready) shownOnce.current = true;
	const motion = motionClass(status, ready || (status === "open" && shownOnce.current));
	const look = shown.spot;
	return (
		<FloatingPortal root={root}>
			<FloatingOverlay className={`tc-backdrop tc-menu-layer${motion}`} />
			<div className={`tc-level tc-menu-layer${motion}`} style={{ [PROPERTY.menuLift]: `${look?.lift ?? 0}px` } as CSSProperties}>
				<div ref={holdSafe} className="tc-safe-room" aria-hidden="true" />
				<FloatingFocusManager context={block.context} modal={false} initialFocus={-1}>
					<div ref={block.refs.setFloating} style={shown.styles} className="tc-menu-block" aria-label={label} {...getFloatingProps()}>
						<div className="tc-menu-over" style={look ? ({ [PROPERTY.coverWidth]: `${look.coverWidth}px`, maxWidth: keepWidth ? `${look.coverWidth}px` : undefined, minHeight: `${look.coverHeight}px` } as CSSProperties) : undefined}>
							{over}
						</div>
						<div
							ref={(el) => {
								parts.current.lower = el;
							}}
							tabIndex={-1}
							role="menu"
							className={`tc-panel is-menu ${panelClass}${motion}${groups.length === 0 ? " is-empty" : ""}`}
							style={look ? { marginLeft: `${look.panelShift}px`, height: `${look.panelHeight}px` } : undefined}
						>
							{groups}
						</div>
					</div>
				</FloatingFocusManager>
			</div>
		</FloatingPortal>
	);
}

/** Where the menu's block stands and how its parts are sized, as `blockIn` measures them. */
interface BlockPlace {
	readonly y: number;
	/** How far above the task it opened from: it lifts from the task by that much as it opens. */
	readonly lift: number;
	/** The copy at least the pressed thing's size. */
	readonly coverWidth: number;
	readonly coverHeight: number;
	/** The panel's shift left to stay inside the window, its room under the copy (where it scrolls) and its height. */
	readonly panelShift: number;
	readonly panelRoom: number;
	readonly panelHeight: number;
	/** How many groups its page had when measured. */
	readonly groups: number;
}

/**
 * The block over the pressed thing (Decision 120): its copy right over it, at least its size, grown for its title only as
 * far left and up as the window less its margin makes it (the core's `grownStart`); the panel under the copy as tall as
 * its page, the whole block standing higher where the room under the task can't take it (`blockTop`), the panel keeping to
 * what room is left, where it scrolls, and shifted left to stay inside the window.
 */
function blockIn(safe: MutableRefObject<HTMLElement | null>, parts: MutableRefObject<{ upper: HTMLElement | null; lower: HTMLElement | null }>, keepWidth: boolean, held: MutableRefObject<number | null>): Middleware {
	return {
		name: "block",
		async fn(state) {
			const { rects, platform, elements } = state;
			const room = await roomOf(state, safe);
			const copyEl = elements.floating.firstElementChild;
			const panelEl = parts.current.lower;
			const copy = copyEl ? await platform.getDimensions(copyEl) : { width: rects.reference.width, height: rects.reference.height };
			const copyWidth = keepWidth ? rects.reference.width : Math.max(copy.width, rects.reference.width);
			const copyHeight = Math.max(copy.height, rects.reference.height);
			const start = (at: number, size: number, grown: number, from: number, to: number) => Math.max(Math.min(at, from + DESIGN.wholeMargin), Math.min(at, Math.max(at + size, to - DESIGN.wholeMargin) - grown));
			const panelWidth = panelEl ? (await platform.getDimensions(panelEl)).width : 0;
			const x = start(rects.reference.x, rects.reference.width, copyWidth, room.left, room.right);
			const over = start(rects.reference.y, rects.reference.height, copyHeight, room.top, room.bottom);
			const groups = panelEl ? [...panelEl.children] : [];
			const page = (await Promise.all(groups.map(async (group) => (await platform.getDimensions(group)).height))).reduce((a, b) => a + b, 0);
			const y = groups.length === 0 && held.current !== null ? held.current : blockTop(over, copyHeight, page, DESIGN.menuGap, room, DESIGN.wholeMargin);
			if (groups.length > 0) held.current = y;
			const panelRoom = Math.max(0, room.bottom - DESIGN.wholeMargin - (y + copyHeight + DESIGN.menuGap));
			/** The panel keeps to the window's gap at the right; under a copy as wide as it or wider (a task's notes in it), it stands on the copy's left edge. */
			const panelShift = copyWidth >= panelWidth - 0.5 ? 0 : Math.min(0, room.right - DESIGN.menuGap - (x + panelWidth));
			const data: BlockPlace = { y, lift: rects.reference.y - y, coverWidth: rects.reference.width, coverHeight: rects.reference.height, panelShift, panelRoom, panelHeight: Math.min(panelRoom, page), groups: groups.length };
			return { x, y, data };
		},
	};
}

/** The window less its safe areas, in the floating element's own terms (Floating UI's measure of the level's safe room); the viewport, by Floating UI's clipping measure, without one. */
async function roomOf(state: MiddlewareState, safe: MutableRefObject<HTMLElement | null>): Promise<{ readonly top: number; readonly bottom: number; readonly left: number; readonly right: number }> {
	const el = safe.current;
	if (el) {
		const r = (await state.platform.getElementRects({ reference: el, floating: state.elements.floating, strategy: state.strategy })).reference;
		return { top: r.y, bottom: r.y + r.height, left: r.x, right: r.x + r.width };
	}
	const view = await state.platform.getClippingRect({ element: state.elements.floating, boundary: "clippingAncestors", rootBoundary: "viewport", strategy: state.strategy });
	return { top: view.y, bottom: view.y + view.height, left: view.x, right: view.x + view.width };
}

export interface PinnedProps {
	/** The element it stands on. */
	readonly reference: Element;
	/** Where on it: `top-end` its top edge at the right, `bottom-start` its bottom edge at the left. */
	readonly placement: Placement;
	/** How far into the element across its edge (half its own height centres it on the edge) and along it from the corner. */
	readonly into: number;
	readonly along: number;
	/** The element of the view's own document that holds the layer. */
	readonly root: HTMLElement;
	/** The element moves now (it glides, stretches, or the screen under it slides or zooms): followed every frame while it does; else on its own changes. */
	readonly moving: boolean;
	readonly children: ReactNode;
}

/**
 * Something pinned onto an element of the screen and lying over every layer, a menu's backdrop too: a selected task's dots
 * (F102, F103), which stay where they can be pulled while the task's menu is open. Floating UI places it against the
 * element and follows it every frame (the element glides and stretches); hidden while the element is scrolled out of
 * sight (`hide`). Floating UI follows it every frame only while it moves (`moving`); standing, its own changes of size,
 * scroll and place move the pins (`autoUpdate`'s observers).
 */
export function Pinned({ reference, placement, into, along, root, moving, children }: PinnedProps) {
	const { refs, floatingStyles, middlewareData, elements, update } = useFloating({
		placement,
		middleware: [offset({ mainAxis: -into, crossAxis: along }), hide()],
		elements: { reference },
	});
	/** Floating UI's `autoUpdate` called as its docs show for options that change: set up again when the pins start or stop following every frame. */
	useEffect(() => (elements.floating ? autoUpdate(reference, elements.floating, update, { animationFrame: moving }) : undefined), [reference, elements.floating, update, moving]);
	return (
		<FloatingPortal root={root}>
			<div ref={refs.setFloating} style={floatingStyles} className={`tc-pinned${middlewareData.hide?.referenceHidden ? " is-hidden" : ""}`}>
				{children}
			</div>
		</FloatingPortal>
	);
}

/**
 * The new task's capsule on the desktop (the design's «Десктоп: капсула у поля», F185): right under the field, right edges
 * together, 8 px from it; over the field where there is no room under it; out of sight while no part of the field shows.
 * Floating UI places it against the field and follows it as the field moves, grows or scrolls. On the phone the bar lies
 * over the keyboard by its CSS and nothing places it. A press on it never takes the focus from the field. A field in a
 * menu's stack (`over`, the layer's `root`) takes it over the menu's blur, as the plugin's bar leaves the view for the page.
 */
export function FieldBar({ desk, over, className, children }: { readonly desk: boolean; readonly over: HTMLElement | null; readonly className: string; readonly children: (side: "under" | "over", capsule: Element | null) => ReactNode }) {
	const { field } = useField();
	const [capsule, setCapsule] = useState<Element | null>(null);

	const { refs, floatingStyles, placement, middlewareData, isPositioned } = useFloating({
		open: desk,
		placement: "bottom-end",
		strategy: over ? "fixed" : "absolute",
		transform: false,
		middleware: [offset(DESIGN.deskBarGap), flip({ fallbackPlacements: ["top-end"], padding: DESIGN.wholeMargin }), hide()],
		whileElementsMounted: autoUpdate,
		elements: { reference: desk ? field : null },
	});
	const setFloating = refs.setFloating;
	const hold = useCallback(
		(el: HTMLElement | null) => {
			setFloating(el);
			setCapsule(el);
		},
		[setFloating],
	);
	const away = desk && (!isPositioned || middlewareData.hide?.referenceHidden === true);
	const style: CSSProperties | undefined = desk ? floatingStyles : undefined;
	const bar = (
		<div
			ref={hold}
			style={style}
			className={`${className}${desk ? " is-desk" : ""}${away ? " is-away" : ""}${over ? " is-over" : ""}`}
			onPointerDown={keepFocus}
			onMouseDown={keepFocus}
		>
			{children(placement.startsWith("top") ? "over" : "under", capsule)}
		</div>
	);
	return over ? <FloatingPortal root={over}>{bar}</FloatingPortal> : bar;
}

/** A press on the bar or its panels leaves the focus in the field (the plugin's bar). */
const keepFocus = (event: { preventDefault(): void; target: EventTarget | null }) => {
	if (!(event.target instanceof Element && event.target.closest("input, textarea, [contenteditable]"))) event.preventDefault();
};

/**
 * A panel of the bar (the flag's levels, the projects, the places, the month): on the phone over the bar at its right by
 * the design's CSS; on the desktop from the capsule (`capsule`), right edges together, on its side away from the field,
 * or the other where only that has room (the plugin's `panelSide`), placed by Floating UI before it shows. It grows in
 * and fades out as every panel does (Floating UI's transition status); a press outside it or Escape closes it.
 */
export function BarPanel({ open, onClose, reference, capsule, away, className, children }: { readonly open: boolean; readonly onClose: () => void; readonly reference: Element | null; readonly capsule: Element | null; readonly away: "under" | "over"; readonly className: string; readonly children: ReactNode }) {
	const desk = capsule !== null;
	const { refs, context, floatingStyles, placement, isPositioned } = useFloating({
		open,
		onOpenChange: (next) => {
			if (!next) onClose();
		},
		placement: away === "under" ? "bottom-end" : "top-end",
		strategy: "fixed",
		transform: false,
		middleware: [offset(DESIGN.deskBarGap), flip({ padding: DESIGN.wholeMargin })],
		whileElementsMounted: autoUpdate,
		elements: { reference: capsule ?? reference },
	});
	const { getFloatingProps } = useInteractions([useDismiss(context, { outsidePress: (event) => !(reference && event.target instanceof Node && reference.contains(event.target)) })]);
	const { isMounted, status } = useTransitionStatus(context, { duration: { open: LAYER_MS.open, close: LAYER_MS.close } });
	if (!isMounted) return null;
	return (
		<div
			ref={refs.setFloating}
			style={desk ? floatingStyles : undefined}
			className={`tc-panel tc-quick-panel ${className}${desk ? " is-placed" : ""}${(desk ? placement.startsWith("bottom") : away === "under") ? " is-below" : " is-above"}${motionClass(status, !desk || isPositioned)}`}
			{...getFloatingProps()}
			onPointerDown={keepFocus}
			onMouseDown={keepFocus}
		>
			{children}
		</div>
	);
}

/**
 * A sheet over the whole screen (the full-screen task, F239): one layer of the layer stack, a Floating UI element with
 * the menu's transition status (`is-shown`, `is-closing`, mounted while it fades); Escape closes it while `escapes` (no
 * menu over it, nothing typed in it: `useDismiss`, the key table takes no Escape then). It stands in the screen's own
 * element, under the menus' layers.
 */
export function Sheet({ open, onClose, escapes, className, children }: { readonly open: boolean; readonly onClose: () => void; readonly escapes: boolean; readonly className: string; readonly children: ReactNode }) {
	const { refs, context } = useFloating({
		open,
		onOpenChange: (next) => {
			if (!next) onClose();
		},
	});
	const { getFloatingProps } = useInteractions([useDismiss(context, { escapeKey: escapes, outsidePress: false })]);
	const { isMounted, status } = useTransitionStatus(context, { duration: { open: LAYER_MS.open, close: LAYER_MS.close } });
	if (!isMounted) return null;
	return (
		<div ref={refs.setFloating} className={`tc-sheet ${className}${motionClass(status, true)}`} {...getFloatingProps()}>
			{children}
		</div>
	);
}
