import type { App } from "obsidian";
import { createContext, useContext } from "react";

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
}

export const HostContext = createContext<ScreenHost | null>(null);

export function useHost(): ScreenHost {
	const host = useContext(HostContext);
	if (!host) throw new Error("a screen's component outside its screen");
	return host;
}
