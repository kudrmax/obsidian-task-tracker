import { autoUpdate, flip, FloatingFocusManager, FloatingOverlay, FloatingPortal, hide, offset, type Placement, shift, useDismiss, useFloating, useInteractions, useRole } from "@floating-ui/react";
import { createContext, type MutableRefObject, type ReactNode, useContext, useRef } from "react";

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

/** The space between a layer and the element it opens from, and kept from the view's edges (the design's `--tc-menu-gap`, `--tc-space-8`). */
const GAP_PX = 12;
const EDGE_PX = 8;

export interface PopoverProps {
	readonly open: boolean;
	readonly onClose: () => void;
	/** The element of the view's own document that holds the layer. */
	readonly root: HTMLElement;
	readonly label: string;
	readonly className: string;
	readonly children: ReactNode;
}

/** A layer anchored to the element it opened from, over the design's backdrop (Floating UI's `FloatingOverlay`), as Floating UI's docs build a popover menu. */
export function Popover({ open, onClose, root, label, className, children }: PopoverProps) {
	const anchor = useAnchor();
	const { refs, floatingStyles, context } = useFloating({
		open,
		onOpenChange: (next) => {
			if (!next) onClose();
		},
		placement: "bottom-start",
		middleware: [offset(GAP_PX), flip({ padding: EDGE_PX }), shift({ padding: EDGE_PX })],
		whileElementsMounted: autoUpdate,
		elements: { reference: anchor.current },
	});
	const { getFloatingProps } = useInteractions([useDismiss(context), useRole(context, { role: "menu" })]);
	if (!open) return null;
	return (
		<FloatingPortal root={root}>
			<FloatingOverlay className="tc-backdrop is-shown" />
			<FloatingFocusManager context={context} modal={false} initialFocus={-1}>
				<div ref={refs.setFloating} style={floatingStyles} className={className} aria-label={label} {...getFloatingProps()}>
					{children}
				</div>
			</FloatingFocusManager>
		</FloatingPortal>
	);
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
