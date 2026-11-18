import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { ScreenData } from "../port";
import type { Screen, ScreenStore } from "./screenStore";

/** The mounted screen's store; every component reaches it by a selector (spec, «Screen state»). */
export const StoreContext = createContext<ScreenStore | null>(null);

function useScreenStore(): ScreenStore {
	const store = useContext(StoreContext);
	if (!store) throw new Error("a screen's component outside its screen");
	return store;
}

/** A part of the screen's state: the component draws again only when that part changes. */
export function useScreen<T>(select: (s: Screen) => T): T {
	return useStore(useScreenStore(), select);
}

/** The store itself, for actions and for a gesture's handlers that read the state as it is at the moment. */
export function useScreenApi(): ScreenStore {
	return useScreenStore();
}

/** The day a region draws (the day's list and its calendar, each copy of the day's slide); outside them, the shown day. */
export const DayContext = createContext<number | null>(null);

/**
 * A part of the screen's data as the region draws it: the shown day's, or, in the copy sliding out, the day the screen
 * turned away from (it keeps showing that day until it is gone). `read`: the data as last read, not a drop's preview.
 */
export function useData<T>(select: (data: ScreenData) => T, read = false): T {
	const day = useContext(DayContext);
	return useScreen((s) => {
		const left = day !== null && day !== s.dayOffset ? (s.left[day] ?? null) : null;
		return select(left ? (read ? left.read : left.shown) : read ? s.read : s.shown);
	});
}
