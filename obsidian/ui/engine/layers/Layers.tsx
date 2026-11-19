import { autoUpdate, FloatingFocusManager, FloatingOverlay, FloatingPortal, hide, type Middleware, offset, type Placement, shift, size, useDismiss, useFloating, useInteractions, useRole, useTransitionStatus } from "@floating-ui/react";
import { createContext, type MutableRefObject, type ReactNode, useContext, useLayoutEffect, useRef, useState } from "react";
import { DESIGN } from "../../design";
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

export function Layers({ children }: { readonly children: ReactNode }) {
	const anchor = useRef<Element | null>(null);
	return <AnchorContext.Provider value={anchor}>{children}</AnchorContext.Provider>;
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
	readonly label: string;
	/** The copy of what was pressed, and under it a calendar task's subtasks (F107), drawn over the backdrop where it stood. */
	readonly over: ReactNode;
	/** The panel's groups, top to bottom: when the panel fits on neither side of the copy, its first groups stand over it. */
	readonly groups: readonly ReactNode[];
	/** The panel's own classes beside `tc-panel is-menu`: its page's. */
	readonly panelClass: string;
	/** The page shown: another page lays the panel out afresh. */
	readonly page: string;
	/** The start of a description over the copy, or under the panel when there is no room over it (F129). */
	readonly peek?: ReactNode;
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
export function MenuLayer({ open, onClose, root, reference, label, over, groups, panelClass, page, peek, keepWidth = false }: MenuLayerProps) {
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
		middleware: [offset(DESIGN.menuGap), split(parts), shift({ padding: EDGES }), size({ padding: DESIGN.wholeMargin, apply: scrollWithin })],
		whileElementsMounted: autoUpdate,
		elements: { reference: overEl },
	});
	const upper = useFloating({
		open,
		placement: "top-start",
		strategy: "fixed",
		transform: false,
		middleware: [offset(DESIGN.menuGap), shift({ padding: EDGES }), size({ padding: DESIGN.wholeMargin, apply: scrollWithin })],
		whileElementsMounted: autoUpdate,
		elements: { reference: overEl },
	});
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
	const count = Math.min(above, groups.length);
	const settled = wanted === count || (wanted !== undefined && wanted >= groups.length && count === groups.length);
	const ready = copy.isPositioned && (count === groups.length || lower.isPositioned) && (count === 0 || upper.isPositioned) && settled;
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
				{peek ?? null}
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

/** A part taller than its room keeps to it and scrolls (the plugin's `keepWithin`). */
function scrollWithin({ availableHeight, elements }: { availableHeight: number; elements: { floating: HTMLElement } }): void {
	const floating = elements.floating;
	floating.style.maxHeight = `${Math.max(0, availableHeight)}px`;
}

/**
 * How many of the panel's groups stand over the copy (the plugin's `groupsAbove` over its `placePanel`): measured by
 * Floating UI as the panel is placed, each group's height wherever it stands now, against the room over and under the copy.
 */
function split(parts: MutableRefObject<{ upper: HTMLElement | null; lower: HTMLElement | null }>): Middleware {
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
