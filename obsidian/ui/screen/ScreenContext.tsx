import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { ScreenActions, ScreenState, ScreenStore } from "./screenStore";

/** Where and how the screen is shown: every fact a component would otherwise read from the platform, from the host. */
export interface ScreenHost {
	readonly store: ScreenStore;
	/** The leaf's whole screen, or the block at the end of a project's note: the same screen, by props only. */
	readonly place: "main" | "note";
	/** Obsidian's phone view (`is-mobile`): touch, the phone's layout of the bottom row. */
	readonly phone: boolean;
	/** Obsidian's theme: the events' colours are computed per theme. */
	readonly theme: "dark" | "light";
	/** The view's size, px. */
	readonly width: number;
	readonly height: number;
	/** The window the view lives in (a pop-out has its own): the gestures listen there. */
	readonly win: Window;
}

export const ScreenContext = createContext<ScreenHost | null>(null);

export function useHost(): ScreenHost {
	const host = useContext(ScreenContext);
	if (!host) throw new Error("a screen component outside TaskScreen");
	return host;
}

/** A slice of the screen's store: the component draws again only when the slice changes. */
export function useScreen<T>(selector: (state: ScreenState & ScreenActions) => T): T {
	return useStore(useHost().store, selector);
}
