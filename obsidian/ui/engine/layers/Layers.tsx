import { autoUpdate, flip, FloatingFocusManager, FloatingOverlay, FloatingPortal, hide, type Middleware, offset, type Placement, shift, size, useDismiss, useFloating, useInteractions, useRole, useTransitionStatus } from "@floating-ui/react";
import { type CSSProperties, createContext, type MutableRefObject, type ReactNode, useContext, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DESIGN, LAYOUT } from "../../design";
import { LAYER_MS } from "./motion";
import { groupsAbove } from "./split";

/**
 * Layers and focus (spec, «The owners»): every menu, popover and sheet is a Floating UI element. It is placed against the
 * element it opens from (`flip`, `shift`), dismissed by Escape and an outside press (`useDismiss`; the key table takes no
 * Escape then), keeps the focus inside (`FloatingFocusManager`) and is portalled into the view's own document, so a
 * pop-out window draws its own (stage 0, «Integration findings» 11).
 */

/** The element a layer opens from: the view hands it over as it opens one (a pressed card). */
const AnchorContext = createContext<MutableRefObject<Element | null> | null>(null);
/** The new task's field as it stands on the screen: the desktop's capsule stands by it. */
const FieldContext = createContext<{ readonly field: Element | null; readonly setField: (el: Element | null) => void } | null>(null);

export function Layers({ children }: { readonly children: ReactNode }) {
	const anchor = useRef<Element | null>(null);
	const [field, setField] = useState<Element | null>(null);
	const fields = useMemo(() => ({ field, setField }), [field]);
	return (
		<AnchorContext.Provider value={anchor}>
			<FieldContext.Provider value={fields}>{children}</FieldContext.Provider>
		</AnchorContext.Provider>
	);
}

/** The new task's field and how it says where it stands. */
export function useField(): { readonly field: Element | null; readonly setField: (el: Element | null) => void } {
	const field = useContext(FieldContext);
	if (!field) throw new Error("a field outside the screen's layers");
	return field;
}

/** Where the next layer opens from. */
export function useAnchor(): MutableRefObject<Element | null> {
	const anchor = useContext(AnchorContext);
	if (!anchor) throw new Error("a layer's anchor outside the screen's layers");
	return anchor;
}

export interface MenuLayerProps {
	readonly open: boolean;
	readonly onClose: () => void;
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
	/** The start of a description by the copy (F129, F130), and what a tap on it does. */
	readonly peek?: { readonly content: ReactNode; readonly onPress: () => void };
	/** The copy keeps the pressed thing's width (an event wraps its title inside it); otherwise it grows right for its title. */
	readonly keepWidth?: boolean;
}

/** A panel keeps its left edge on the copy's unless that would take it closer than the menu's gap to the window's right (the plugin's `placePanel`). */
const EDGES = { left: 0, right: DESIGN.menuGap, top: DESIGN.wholeMargin, bottom: DESIGN.wholeMargin };

/** How a part of the menu stands while it opens, is open and closes: the design's classes, which its CSS transitions run between. */
const motionClass = (status: string, ready: boolean) => (status === "open" && ready ? " is-shown" : status === "close" ? " is-closing" : "");

/**
 * The menu over a pressed card, block or event (the plugin's `LiftedMenu`, F110, F297), as Floating UI builds a menu:
 * the backdrop (`FloatingOverlay`), a copy of what was pressed standing exactly over it (its whole title showing, kept
 * inside the window by `shift`), and the panel under the copy, its left edge on the copy's. A panel taller than the room
 * under the copy and over it splits: its first groups, as many as fit whole, stand over the copy and the rest under it,
 * each part scrolling within its room (`groupsAbove`, the plugin's `placePanel`). Escape and a press on the backdrop
 * close it (`useDismiss`).
 *
 * Every part is placed before it is shown (`isPositioned`): it mounts in its closed state at its place, and only then
 * takes `is-shown`, so its CSS transition grows it from the copy (`--tc-menu-rise`, `--tc-menu-scale`) and never slides it
 * in from where it stood unplaced. The parts open together and close together (Floating UI's transition status keeps
 * them mounted while they fade, `LAYER_MS`).
 */
export function MenuLayer({ open, onClose, root, reference, panelBy = null, label, over, groups, panelClass, page, peek, keepWidth = false }: MenuLayerProps) {
	const [above, setAbove] = useState(0);
	const [overEl, setOverEl] = useState<HTMLElement | null>(null);
	const parts = useRef<{ upper: HTMLElement | null; lower: HTMLElement | null }>({ upper: null, lower: null });
	const copy = useFloating({
		open,
		placement: "bottom-start",
		strategy: "fixed",
		transform: false,
		middleware: [size({ apply: ({ rects, elements }) => void Object.assign(elements.floating.style, { minWidth: `${rects.reference.width}px`, maxWidth: keepWidth ? `${rects.reference.width}px` : "", minHeight: `${rects.reference.height}px` }) }), cover],
		whileElementsMounted: autoUpdate,
		elements: { reference },
	});
	const lower = useFloating({
		open,
		onOpenChange: (next) => {
			if (!next) onClose();
		},
		placement: "bottom-start",
		strategy: "fixed",
		transform: false,
		middleware: [offset(DESIGN.menuGap), splitBy(parts), shift({ padding: EDGES }), size({ padding: DESIGN.wholeMargin, apply: scrollWithin })],
		whileElementsMounted: autoUpdate,
		elements: { reference: panelBy ?? overEl },
	});
	const upper = useFloating({
		open,
		placement: "top-start",
		strategy: "fixed",
		transform: false,
		middleware: [offset(DESIGN.menuGap), shift({ padding: EDGES }), size({ padding: DESIGN.wholeMargin, apply: scrollWithin })],
		whileElementsMounted: autoUpdate,
		elements: { reference: panelBy ?? overEl },
	});
	const count = Math.min(above, groups.length);
	/** Floating UI keeps a middleware whose code reads the same, so what changes between renders is read through a ref. */
	const split = useRef({ count, total: groups.length });
	split.current = { count, total: groups.length };
	const peeking = useFloating({
		open,
		placement: "top-start",
		strategy: "fixed",
		transform: false,
		middleware: [peekPlace(parts, split)],
		whileElementsMounted: autoUpdate,
		elements: { reference: overEl },
	});
	const placePeek = peeking.update;
	/** The panel split or joined: the description goes by it again. */
	useLayoutEffect(() => placePeek(), [count, placePeek]);
	const peekSide = peeking.middlewareData.peek as { under: boolean; away: boolean } | undefined;
	const wanted = (lower.middlewareData.split as { above?: number } | undefined)?.above;
	/** A new page is laid out afresh: until its split is measured, nothing of it shows. */
	useLayoutEffect(() => setAbove(0), [page]);
	useLayoutEffect(() => {
		if (wanted !== undefined && wanted !== above) setAbove(wanted);
	}, [wanted, above]);
	const { isMounted, status } = useTransitionStatus(lower.context, { duration: { open: LAYER_MS.open, close: LAYER_MS.close } });
	/** Closed by the click, not the press: the finger's tap ends on the backdrop, never on a card under the fading menu. */
	const dismiss = useDismiss(lower.context, { outsidePressEvent: "click", outsidePress: (event) => !(event.target instanceof Node && [overEl, parts.current.upper, parts.current.lower].some((part) => part?.contains(event.target as Node))) });
	const { getFloatingProps } = useInteractions([dismiss, useRole(lower.context, { role: "menu" })]);
	if (!isMounted) return null;
	const settled = wanted === count || (wanted !== undefined && wanted >= groups.length && count === groups.length);
	const ready = copy.isPositioned && (count === groups.length || lower.isPositioned) && (count === 0 || upper.isPositioned) && (!peek || peeking.isPositioned) && settled;
	const motion = motionClass(status, ready);
	const panel = `tc-panel is-menu ${panelClass}`;
	return (
		<FloatingPortal root={root}>
			<FloatingOverlay className={`tc-backdrop tc-menu-layer${motion}`} />
			<div className={`tc-level tc-menu-layer${motion}`}>
				<div ref={(el) => {
					copy.refs.setFloating(el);
					setOverEl(el);
				}} style={copy.floatingStyles} className="tc-menu-over">
					{over}
				</div>
				<FloatingFocusManager context={lower.context} modal={false} initialFocus={-1}>
					<div>
						{count > 0 ? (
							<div ref={(el) => {
								upper.refs.setFloating(el);
								parts.current.upper = el;
							}} style={upper.floatingStyles} className={`${panel} is-above${motion}`} aria-label={label} role="menu">
								{groups.slice(0, count)}
							</div>
						) : null}
						{count < groups.length ? (
							<div ref={(el) => {
								lower.refs.setFloating(el);
								parts.current.lower = el;
							}} style={lower.floatingStyles} className={`${panel}${motion}`} aria-label={label} {...getFloatingProps()}>
								{groups.slice(count)}
							</div>
						) : (
							<div ref={(el) => {
								lower.refs.setFloating(el);
								parts.current.lower = el;
							}} style={lower.floatingStyles} className="tc-menu-measure" {...getFloatingProps()} />
						)}
					</div>
				</FloatingFocusManager>
				{peek ? (
					<div ref={peeking.refs.setFloating} style={peeking.floatingStyles} className={`tc-desc-peek${peekSide?.under ? " is-under" : ""}${peekSide?.away ? " is-away" : ""}${motion}`} onClick={peek.onPress}>
						{peek.content}
					</div>
				) : null}
			</div>
		</FloatingPortal>
	);
}

/**
 * The copy stands exactly over what was pressed (its size the pressed thing's at least: `size`); grown for its title, it
 * moves left and up only as far as it must to stay inside the window less its margin, never past where the pressed thing
 * already reached (the core's `grownStart`).
 */
const cover: Middleware = {
	name: "cover",
	fn: ({ rects, elements }) => {
		const page = elements.floating.ownerDocument.documentElement;
		const start = (at: number, size: number, grown: number, room: number) => Math.max(Math.min(at, DESIGN.wholeMargin), Math.min(at, Math.max(at + size, room - DESIGN.wholeMargin) - grown));
		return { x: start(rects.reference.x, rects.reference.width, rects.floating.width, page.clientWidth), y: start(rects.reference.y, rects.reference.height, rects.floating.height, page.clientHeight) };
	},
};

/**
 * Where the start of a description stands (the plugin's `DescriptionPeek.place` and `placeBeside`): over the copy when the
 * panel is under it and there is room for three lines, else under the copy past a panel over it, else past the panel on
 * its far side; by a panel split over and under the copy, right of its part over the copy, or nowhere where the window
 * is too narrow (the phone). It keeps to its room, `--tc-desc-peek-max` at most, and stays away with less than three lines.
 */
function peekPlace(parts: MutableRefObject<{ upper: HTMLElement | null; lower: HTMLElement | null }>, split: MutableRefObject<{ count: number; total: number }>): Middleware {
	return {
		name: "peek",
		async fn({ rects, platform, elements, strategy }) {
			const { count, total } = split.current;
			const page = elements.floating.ownerDocument.documentElement;
			const [height, width] = [page.clientHeight, page.clientWidth];
			const copy = rects.reference;
			const gap = LAYOUT.descPeekGap;
			const margin = DESIGN.wholeMargin;
			const least = LAYOUT.descPeekLeast;
			const freeAbove = copy.y - gap - margin;
			const freeBelow = height - (copy.y + copy.height) - gap - margin;
			let over = true;
			let edge = copy.y - gap;
			let room = freeAbove;
			let x = Math.max(margin, Math.min(copy.x, width - margin - rects.floating.width));
			if (count > 0 && count < total) {
				const upper = parts.current.upper;
				/** Its left as placed (it grows from that edge) and its width unscaled: it may still be growing in. */
				const beside = upper ? (await platform.getElementRects({ reference: upper, floating: elements.floating, strategy })).reference : null;
				const wide = upper ? (await platform.getDimensions(upper)).width : 0;
				x = beside ? beside.x + wide + DESIGN.menuGap : width;
				const fits = x + rects.floating.width <= width - margin;
				if (!fits) room = 0;
				else if (freeAbove < least) [over, edge, room] = [false, copy.y + copy.height + gap, freeBelow];
			} else {
				const menuAbove = count === total;
				const menu = menuAbove ? parts.current.upper : parts.current.lower;
				const span = DESIGN.menuGap + (menu ? (await platform.getDimensions(menu)).height : 0);
				if (!menuAbove && freeAbove >= least) [over, edge, room] = [true, copy.y - gap, freeAbove];
				else if (menuAbove && freeBelow >= least) [over, edge, room] = [false, copy.y + copy.height + gap, freeBelow];
				else if (menuAbove) [over, edge, room] = [true, copy.y - span - gap, copy.y - span - gap - margin];
				else [over, edge, room] = [false, copy.y + copy.height + span + gap, height - (copy.y + copy.height) - span - gap - margin];
			}
			const most = `${Math.max(0, Math.min(DESIGN.descPeekMax, room))}px`;
			if (elements.floating.style.maxHeight !== most) {
				elements.floating.style.maxHeight = most;
				return { reset: { rects: true } };
			}
			return { x, y: over ? edge - rects.floating.height : edge, data: { under: !over, away: room < least } };
		},
	};
}

/** A part taller than its room keeps to it and scrolls (the plugin's `keepWithin`). */
function scrollWithin({ availableHeight, elements }: { availableHeight: number; elements: { floating: HTMLElement } }): void {
	const floating = elements.floating;
	floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
}

/**
 * How many of the panel's groups stand over the copy (the plugin's `groupsAbove` over its `placePanel`): measured by
 * Floating UI as the panel is placed, each group's height wherever it stands now, against the room over and under the copy.
 */
function splitBy(parts: MutableRefObject<{ upper: HTMLElement | null; lower: HTMLElement | null }>): Middleware {
	return {
		name: "split",
		async fn({ rects, platform, elements }) {
			const groups = [parts.current.upper, parts.current.lower].flatMap((part) => (part ? [...part.children] : []));
			/** As one panel would stand: a group drawn first in its part has no band over it, every group but the panel's first has one. */
			const heights = await Promise.all(groups.map(async (group, i) => (await platform.getDimensions(group)).height - (group.previousElementSibling ? DESIGN.menuBand : 0) + (i > 0 ? DESIGN.menuBand : 0)));
			const cuts = heights.slice(0, -1).map((_, i) => heights.slice(0, i + 1).reduce((a, b) => a + b, 0));
			const total = heights.reduce((a, b) => a + b, 0);
			const windowHeight = elements.floating.ownerDocument.documentElement.clientHeight;
			const roomOver = rects.reference.y - DESIGN.menuGap - DESIGN.wholeMargin;
			const roomUnder = windowHeight - (rects.reference.y + rects.reference.height) - DESIGN.menuGap - DESIGN.wholeMargin;
			return { data: { above: groupsAbove(cuts, total, roomOver, roomUnder, groups.length > 1) } };
		},
	};
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
	readonly children: ReactNode;
}

/**
 * Something pinned onto an element of the screen and lying over every layer, a menu's backdrop too: a selected task's dots
 * (F102, F103), which stay where they can be pulled while the task's menu is open. Floating UI places it against the
 * element and follows it every frame (the element glides and stretches); hidden while the element is scrolled out of
 * sight (`hide`).
 */
export function Pinned({ reference, placement, into, along, root, children }: PinnedProps) {
	const { refs, floatingStyles, middlewareData } = useFloating({
		placement,
		middleware: [offset({ mainAxis: -into, crossAxis: along }), hide()],
		whileElementsMounted: (reference, floating, update) => autoUpdate(reference, floating, update, { animationFrame: true }),
		elements: { reference },
	});
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
 * over the keyboard by its CSS and nothing places it. A press on it never takes the focus from the field.
 */
export function FieldBar({ desk, className, children }: { readonly desk: boolean; readonly className: string; readonly children: (side: "under" | "over", capsule: Element | null) => ReactNode }) {
	const { field } = useField();
	const [capsule, setCapsule] = useState<Element | null>(null);

	const { refs, floatingStyles, placement, middlewareData, isPositioned } = useFloating({
		open: desk,
		placement: "bottom-end",
		strategy: "absolute",
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
	return (
		<div
			ref={hold}
			style={style}
			className={`${className}${desk ? " is-desk" : ""}${away ? " is-away" : ""}`}
			onPointerDown={keepFocus}
			onMouseDown={keepFocus}
		>
			{children(placement.startsWith("top") ? "over" : "under", capsule)}
		</div>
	);
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
