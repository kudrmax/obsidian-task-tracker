import type { App } from "obsidian";
import { createRoot } from "react-dom/client";
import type { Place } from "./layout/Layout";
import type { ScreenPort } from "./port";
import { createScreenStore, type ScreenStore } from "./store";
import { TaskScreen } from "./view/TaskScreen";

export interface MountOptions {
	readonly port: ScreenPort;
	readonly place: Place;
	readonly app: App;
	/** The note a field's links are made from: the note of a block, none for a leaf. */
	readonly sourcePath: string;
	readonly haptics: { tap(): void };
}

export interface MountedScreen {
	readonly store: ScreenStore;
	unmount(): void;
}

/** The engine's screen in `el`: its own store over the port, in the element's own document and window. */
export function mountScreen(el: HTMLElement, { port, place, app, sourcePath, haptics }: MountOptions): MountedScreen {
	const doc = el.ownerDocument;
	const store = createScreenStore(port);
	const root = createRoot(el);
	root.render(<TaskScreen store={store} place={place} host={{ doc, win: doc.defaultView ?? window, layerRoot: doc.body, app, sourcePath, haptics }} />);
	return { store, unmount: () => root.unmount() };
}
