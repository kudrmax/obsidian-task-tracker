import { createContext, useContext } from "react";
import { useStore } from "zustand";
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
