import { autoUpdate, flip, FloatingFocusManager, FloatingOverlay, FloatingPortal, offset, type Placement, shift, size, useDismiss, useFloating, useInteractions, useRole, useTransitionStatus } from "@floating-ui/react";
import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";
import { DESIGN } from "../../shared/design";
import { LAYER_MS } from "./motion";

export type { Placement };

/** How a part of a layer stands while it opens, is open and closes: the design's classes its CSS transitions run between. */
const motionOf = (status: string, placed: boolean): string => (status === "open" && placed ? " is-shown" : status === "close" ? " is-closing" : "");

export interface PopoverProps {
	readonly open: boolean;
	readonly onClose: () => void;
	/** The element of the view's own document that holds the layer. */
	readonly root: HTMLElement;
	/** What it opens from: it stands over the backdrop as it is, the panel beside it. */
	readonly reference: Element | null;
	/** Where the panel stands against it: over the capsule by its left edge, over the circle by its right, beside a card. */
	readonly placement: Placement;
	readonly label: string;
	/** The panel's own classes beside `tc-panel`. */
	readonly className: string;
	/** The closed layer has faded out: what was tapped in it may happen now. */
	readonly onGone?: () => void;
	/** A copy of the control it opens from, standing over the backdrop right where the control stands (the design's copy of the capsule over the blur); none beside a card. */
	readonly copy?: ReactNode;
	readonly children: ReactNode;
}

/**
 * A panel opened from a control of the screen (the design's «⋯» menu over the capsule, the menu for every picked task over
 * the circle or beside the card clicked; F137, F139, F261), as Floating UI builds a popover: the backdrop under it, a copy
 * of the control it opens from over the backdrop where the control stands (`copy`), the panel placed against it a menu's gap
 * away (`offset`, `flip`, `shift`, kept to the window's room by `size`), growing from the control's corner; Escape and a
 * press beside it close it (`useDismiss`), the focus kept inside (`FloatingFocusManager`). It opens and closes in the
 * layers' own time (`LAYER_MS`).
 */
export function Popover({ open, onClose, root, reference, placement, label, className, onGone, copy = null, children }: PopoverProps) {
	const { refs, context, floatingStyles, isPositioned, placement: placed } = useFloating({
		open,
		onOpenChange: (next) => {
			if (!next) onClose();
		},
		placement,
		strategy: "fixed",
		transform: false,
		middleware: [
			offset(DESIGN.menuGap),
			flip({ padding: DESIGN.wholeMargin }),
			shift({ padding: DESIGN.wholeMargin }),
			size({ padding: DESIGN.wholeMargin, apply: ({ availableHeight, elements }) => void elements.floating.style.setProperty("max-height", `${Math.max(0, availableHeight)}px`) }),
		],
		whileElementsMounted: autoUpdate,
		elements: { reference },
	});
	const { getFloatingProps } = useInteractions([useDismiss(context, { outsidePressEvent: "click" }), useRole(context, { role: "menu" })]);
	const { isMounted, status } = useTransitionStatus(context, { duration: { open: LAYER_MS.open, close: LAYER_MS.close } });
	/** The copy's place: the control's own box (its top left corner on the control's). */
	const over = useFloating({ open, placement: "bottom-start", strategy: "fixed", transform: false, middleware: [offset(({ rects }) => -rects.reference.height)], whileElementsMounted: autoUpdate, elements: { reference } });
	const gone = useRef(onGone);
	gone.current = onGone;
	useEffect(() => {
		if (!isMounted) gone.current?.();
	}, [isMounted]);
	if (!isMounted) return null;
	const motion = motionOf(status, isPositioned);
	return (
		<FloatingPortal root={root}>
			<FloatingOverlay className={`tc-backdrop tc-menu-layer${motion}`} />
			{copy ? (
				<div ref={over.refs.setFloating} className={`tc-control-copy${motion}`} style={over.floatingStyles as CSSProperties} aria-hidden="true">
					{copy}
				</div>
			) : null}
			<FloatingFocusManager context={context} modal={false} initialFocus={-1}>
				<div ref={refs.setFloating} role="menu" aria-label={label} tabIndex={-1} className={`tc-panel tc-popover ${className}${motion}`} data-from={placed} style={floatingStyles as CSSProperties} {...getFloatingProps()}>
					{children}
				</div>
			</FloatingFocusManager>
		</FloatingPortal>
	);
}

export interface SearchLayerProps {
	readonly open: boolean;
	readonly onClose: () => void;
	readonly root: HTMLElement;
	/** The screen's element: the phone's search covers it, the desktop's panel hangs from its top, in its middle. */
	readonly view: Element | null;
	readonly desk: boolean;
	readonly children: ReactNode;
}

/**
 * The search's layer (the design's «Поиск», F251): on the desktop a panel a gap under the view's top, in its middle, over
 * the dimmed view, as tall as the view lets it; on the phone the whole view, its field over the keyboard (its CSS). Escape
 * and, on the desktop, a press beside it close it; the focus stays inside.
 */
export function SearchLayer({ open, onClose, root, view, desk, children }: SearchLayerProps) {
	const { refs, context, floatingStyles, isPositioned } = useFloating({
		open,
		onOpenChange: (next) => {
			if (!next) onClose();
		},
		placement: "bottom",
		strategy: "fixed",
		transform: false,
		middleware: desk
			? [
					offset(({ rects }) => DESIGN.searchTop - rects.reference.height),
					size({ padding: DESIGN.searchTop, apply: ({ availableHeight, elements }) => void elements.floating.style.setProperty("max-height", `${Math.max(0, availableHeight)}px`) }),
				]
			: [],
		whileElementsMounted: autoUpdate,
		elements: { reference: view },
	});
	const { getFloatingProps } = useInteractions([useDismiss(context, { outsidePressEvent: "click", outsidePress: desk }), useRole(context, { role: "dialog" })]);
	const { isMounted, status } = useTransitionStatus(context, { duration: { open: LAYER_MS.open, close: LAYER_MS.close } });
	if (!isMounted) return null;
	const motion = motionOf(status, !desk || isPositioned);
	const panel = (
		<FloatingFocusManager context={context} modal={false} initialFocus={-1}>
			<div ref={refs.setFloating} aria-label="Search" className={`tc-search${desk ? " is-desk" : ""}${motion}`} style={desk ? (floatingStyles as CSSProperties) : undefined} {...getFloatingProps()}>
				{children}
			</div>
		</FloatingFocusManager>
	);
	if (!desk) return panel;
	return (
		<FloatingPortal root={root}>
			<FloatingOverlay className={`tc-backdrop tc-menu-layer${motion}`} />
			{panel}
		</FloatingPortal>
	);
}

/**
 * A panel in the middle of the window over the backdrop (the assistant's answer, F264): Escape and a press beside it close
 * it, the focus kept inside; it opens and closes in the layers' own time. Its place is its CSS (the window's middle).
 */
export function CenterLayer({ open, onClose, onGone, root, label, className, children }: { readonly open: boolean; readonly onClose: () => void; readonly onGone: () => void; readonly root: HTMLElement; readonly label: string; readonly className: string; readonly children: ReactNode }) {
	const { refs, context } = useFloating({
		open,
		onOpenChange: (next) => {
			if (!next) onClose();
		},
	});
	const { getFloatingProps } = useInteractions([useDismiss(context, { outsidePressEvent: "click" }), useRole(context, { role: "dialog" })]);
	const { isMounted, status } = useTransitionStatus(context, { duration: { open: LAYER_MS.open, close: LAYER_MS.close } });
	const gone = useRef(onGone);
	gone.current = onGone;
	/** Gone once it was there: never before its first frame. */
	const shown = useRef(false);
	if (isMounted) shown.current = true;
	useEffect(() => {
		if (!isMounted && shown.current) gone.current();
	}, [isMounted]);
	if (!isMounted) return null;
	const motion = motionOf(status, true);
	return (
		<FloatingPortal root={root}>
			<FloatingOverlay className={`tc-backdrop tc-menu-layer${motion}`} />
			<FloatingFocusManager context={context} modal={false} initialFocus={-1}>
				<div ref={refs.setFloating} aria-label={label} className={`tc-panel ${className}${motion}`} {...getFloatingProps()}>
					{children}
				</div>
			</FloatingFocusManager>
		</FloatingPortal>
	);
}
