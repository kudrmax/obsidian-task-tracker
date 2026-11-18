import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { ScreenActions, ScreenState, ScreenStore } from "./screenStore";

/**
 * The looks Max has not chosen yet (docs/superpowers/specs/2026-11-18-ui-engine.md, «Not decided»): the stand switches
 * between them; the plugin draws the released ones. Once he chooses, the switch and the other look go.
 */
export interface ScreenLooks {
	/** Over the timeline, where a carried card lands: the released accent line with its time, or the block at its landing (stage 0). */
	readonly timelineDrop: "line" | "block";
	/** A card carried away from its place: the released dashed outline stays there, or the place closes (stage 0). */
	readonly homePlace: "outline" | "closed";
	/** A card about to become a subtask: no mark (released), or an outline around its parent. */
	readonly parentOutline: boolean;
}

/** The released screen's looks. */
export const RELEASED_LOOKS: ScreenLooks = { timelineDrop: "line", homePlace: "outline", parentOutline: false };

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
	/** A light tap of the phone's haptics (none on the desktop): a card lifted and let go. */
	readonly haptics: { tap(): void };
	readonly looks: ScreenLooks;
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
