import type { App } from "obsidian";
import { createRoot } from "react-dom/client";
import { DESIGN } from "../shared/design";
import type { Place } from "./layout/Layout";
import type { TrackpadFingers } from "./gestures/trackpadFollow";
import type { ScreenContext, ScreenPort } from "./port";
import { createScreenStore, type ScreenStore, type Zoom } from "./store";
import { TaskScreen } from "./view/TaskScreen";
import { AnswerPopup } from "./view/AnswerPopup";
import { HostContext } from "./view/host";
import type { Answer } from "./port";

export interface MountOptions {
	readonly port: ScreenPort;
	readonly place: Place;
	readonly app: App;
	/** The note a field's links are made from: the note of a block, none for a leaf. */
	readonly sourcePath: string;
	readonly haptics: { tap(): void };
	/** The calendar's zoom kept on the device: the one it was left at (null: none yet), how to keep a new one, and the largest hour. */
	readonly zoom: { readonly kept: Zoom | null; keep(zoom: Zoom): void; readonly most: number };
	/** The day list's share beside the calendar kept on the device: the one the divider was let go at (null: none yet), and how to keep a new one. */
	readonly listShare: { readonly kept: number | null; keep(share: number): void };
	/** Obsidian on the desktop (`Platform.isMobile` false). */
	readonly desk: boolean;
	/** Draws markdown as Obsidian does: the start of a description by the menu. */
	readonly markdown: (text: string, el: HTMLElement, sourcePath: string) => () => void;
	/** Shows a notice as Obsidian does. */
	readonly notice: (text: string) => void;
	/** macOS's touch and lift on the trackpad, where the host hears them (Decision 126). */
	readonly fingers?: TrackpadFingers | null;
	/** The context the screen opens in: a project note's block shows its project's tasks; every task when absent. */
	readonly context?: ScreenContext;
}

export interface MountedScreen {
	readonly store: ScreenStore;
	unmount(): void;
}

/** The engine's screen in `el`: its own store over the port, in the element's own document and window. */
export function mountScreen(el: HTMLElement, { port, place, app, sourcePath, haptics, zoom, listShare, markdown, desk, notice, fingers = null, context }: MountOptions): MountedScreen {
	const doc = el.ownerDocument;
	const store = createScreenStore(port, zoom.kept ?? DESIGN.hourPx, listShare.kept ?? undefined, context);
	const keep = store.subscribe((s, was) => {
		if (s.zoom !== was.zoom && s.gesture !== "zoom") zoom.keep(s.zoom);
		else if (was.gesture === "zoom" && s.gesture !== "zoom") zoom.keep(s.zoom);
		if (was.gesture === "divider" && s.gesture !== "divider") listShare.keep(s.listShare);
	});
	const root = createRoot(el);
	root.render(<TaskScreen store={store} place={place} host={{ doc, win: doc.defaultView ?? window, layerRoot: doc.body, app, sourcePath, haptics, zoomMost: zoom.most, markdown, desk, notice, fingers }} />);
	return {
		store,
		unmount: () => {
			keep();
			root.unmount();
		},
	};
}

/** What an answer's popup is drawn with: the host's parts a screen gets, but the place, the port and the fingers. */
export type AnswerHost = Pick<MountOptions, "app" | "haptics" | "markdown" | "notice" | "desk"> & { readonly zoomMost: number };

/**
 * The assistant's answer in the middle of `doc`'s window (F264): it belongs to the window, not to a screen, so it comes
 * even when the view was closed; it is taken off once it has faded out.
 */
export function showAnswer(doc: Document, host: AnswerHost, answer: Answer): void {
	const el = doc.createElement("div");
	doc.body.appendChild(el);
	const root = createRoot(el);
	const gone = () =>
		queueMicrotask(() => {
			root.unmount();
			el.remove();
		});
	const screenHost = { doc, win: doc.defaultView ?? window, layerRoot: doc.body, app: host.app, sourcePath: "", haptics: host.haptics, zoomMost: host.zoomMost, desk: host.desk, markdown: host.markdown, notice: host.notice, fingers: null };
	root.render(
		<HostContext.Provider value={screenHost}>
			<AnswerPopup answer={answer} onGone={gone} />
		</HostContext.Provider>,
	);
}
