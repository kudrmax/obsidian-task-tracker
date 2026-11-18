import type { App } from "obsidian";
import { createRoot } from "react-dom/client";
import { DESIGN } from "../design";
import type { Place } from "./layout/Layout";
import type { ScreenPort } from "./port";
import { createScreenStore, type ScreenStore, type Zoom } from "./store";
import { TaskScreen } from "./view/TaskScreen";

export interface MountOptions {
	readonly port: ScreenPort;
	readonly place: Place;
	readonly app: App;
	/** The note a field's links are made from: the note of a block, none for a leaf. */
	readonly sourcePath: string;
	readonly haptics: { tap(): void };
	/** The calendar's zoom kept on the device: the one it was left at (null: none yet), how to keep a new one, and the largest hour. */
	readonly zoom: { readonly kept: Zoom | null; keep(zoom: Zoom): void; readonly most: number };
}

export interface MountedScreen {
	readonly store: ScreenStore;
	unmount(): void;
}

/** The engine's screen in `el`: its own store over the port, in the element's own document and window. */
export function mountScreen(el: HTMLElement, { port, place, app, sourcePath, haptics, zoom }: MountOptions): MountedScreen {
	const doc = el.ownerDocument;
	const store = createScreenStore(port, zoom.kept ?? DESIGN.hourPx);
	const keep = store.subscribe((s, was) => {
		if (s.zoom !== was.zoom && s.gesture !== "zoom") zoom.keep(s.zoom);
		else if (was.gesture === "zoom" && s.gesture !== "zoom") zoom.keep(s.zoom);
	});
	const root = createRoot(el);
	root.render(<TaskScreen store={store} place={place} host={{ doc, win: doc.defaultView ?? window, layerRoot: doc.body, app, sourcePath, haptics, zoomMost: zoom.most }} />);
	return {
		store,
		unmount: () => {
			keep();
			root.unmount();
		},
	};
}
