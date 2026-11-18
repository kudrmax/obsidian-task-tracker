import { createRoot, type Root } from "react-dom/client";
import { detectHaptics, type HapticsHost } from "../haptics";
import { StatusBarRoom } from "../StatusBarRoom";
import { RELEASED_LOOKS, type ScreenLooks } from "./ScreenContext";
import { createScreenStore, type ScreenPlace, type ScreenServices, type ScreenStore } from "./screenStore";
import { TaskScreen } from "./TaskScreen";

/** A screen mounted in a host's element: the leaf's content or a note's block. */
export interface MountedScreen {
	readonly store: ScreenStore;
	/** The element's size or Obsidian's look changed: the screen draws for it. */
	refit(): void;
	unmount(): void;
}

/**
 * Mounts `TaskScreen` in `el` with its own store over the services: the one way both hosts show the screen. The host
 * follows its element's size and Obsidian's phone view and theme here, so no component reads the platform.
 */
export function mountScreen(el: HTMLElement, services: ScreenServices, place: ScreenPlace, looks: () => ScreenLooks = () => RELEASED_LOOKS): MountedScreen {
	const doc = el.ownerDocument;
	const win = doc.defaultView ?? window;
	const phone = () => doc.body.classList.contains("is-mobile");
	const store = createScreenStore(services, place, () => !phone());
	const haptics = detectHaptics(win as unknown as HapticsHost);
	const root: Root = createRoot(el);
	let drawn = "";
	const draw = () => {
		const look = { phone: phone(), theme: doc.body.classList.contains("theme-light") ? ("light" as const) : ("dark" as const), width: el.clientWidth, height: el.clientHeight };
		const key = JSON.stringify({ ...look, looks: looks() });
		if (key === drawn) return;
		drawn = key;
		root.render(<TaskScreen store={store} place={place.kind} win={win} haptics={haptics} looks={looks()} {...look} />);
	};
	/** Obsidian's onResize misses the phone view's layout changes: the host follows its element's size itself. */
	const sized = new win.ResizeObserver(() => draw());
	sized.observe(el);
	/** Obsidian's theme and phone view are classes on the body. */
	const obsidianLooks = new win.MutationObserver(() => draw());
	obsidianLooks.observe(doc.body, { attributes: true, attributeFilter: ["class"] });
	/** The bottom row stands above Obsidian's status bar while the bar shows. */
	const release = StatusBarRoom.hold(doc);
	draw();
	return {
		store,
		refit: () => {
			drawn = "";
			draw();
		},
		unmount() {
			release();
			sized.disconnect();
			obsidianLooks.disconnect();
			store.getState().dispose();
			root.unmount();
		},
	};
}
