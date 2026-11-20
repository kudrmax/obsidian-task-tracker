import type { App } from "obsidian";
import { createContext, useContext } from "react";
import type { TrackpadFingers } from "../gestures/trackpadFollow";

/**
 * What the host passes the screen (spec, «Haptics, theme, platform»): the view's own document and window (a pop-out has its
 * own), Obsidian's app for its editor, and the haptics. The theme and the platform reach the screen as CSS tokens and
 * Obsidian's body classes.
 */
export interface ScreenHost {
	readonly doc: Document;
	readonly win: Window;
	/** The element of the view's document that holds the screen's layers. */
	readonly layerRoot: HTMLElement;
	readonly app: App;
	/** The note a field's links are made from. */
	readonly sourcePath: string;
	readonly haptics: { tap(): void };
	/** The calendar's largest hour, in pixels (the zoom's levels in the settings): a pinch stops there. */
	readonly zoomMost: number;
	/** Obsidian runs on the desktop: no keyboard rises, the new task's bar is a capsule by its field (the design's «Десктоп»). */
	readonly desk: boolean;
	/** Draws markdown into `el` as Obsidian does (a description's start by the menu); returns what takes it away. */
	readonly markdown: (text: string, el: HTMLElement, sourcePath: string) => () => void;
	/** macOS's touch and lift of the fingers on the trackpad (Decision 126); null where the host can't hear them: the ribbon then reads them from the deltas. */
	readonly fingers: TrackpadFingers | null;
}

export const HostContext = createContext<ScreenHost | null>(null);

export function useHost(): ScreenHost {
	const host = useContext(HostContext);
	if (!host) throw new Error("a screen's component outside its screen");
	return host;
}
