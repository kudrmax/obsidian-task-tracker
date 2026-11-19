import type { App } from "obsidian";
import { keptZoom, MockPort, type WriteDelay, ZOOM_KEY } from "../../../obsidian/stand/MockPort";
import { calendarFile, type ListKey, longListsFile, type MockFile, oneColumnFile, sectionsFile, subtasksFile, twoColumnsFile } from "../../../obsidian/stand/mockData";
import { KEYS, takesKeys } from "../../../obsidian/ui/engine/keys";
import type { Place } from "../../../obsidian/ui/engine/layout/Layout";
import { type MountedScreen, mountScreen } from "../../../obsidian/ui/engine/mount";
import type { Stop } from "../../../obsidian/ui/engine/store";
import { detectHaptics, type HapticsHost } from "../../../obsidian/ui/haptics";
import { showPriorityColors } from "../../../obsidian/ui/priorityColors";

/**
 * The end-to-end checks' page: the stand (obsidian/stand) off Obsidian. The engine over `MockPort` in a leaf's content
 * element, Obsidian's body classes for the theme and the platform (`?theme=dark|light&platform=desktop|phone`), the
 * screen's key table on the window as the stand's view scope has it, and `window.__tcStand` as the stand plugin gives it,
 * with `step(id)` for the stand's step commands and `openNote()` for the note's block.
 */

const STEPS: Readonly<Record<string, { place: Place; file?: () => MockFile }>> = {
	"step-one-column": { place: "column", file: oneColumnFile },
	"step-two-columns": { place: "twoColumns", file: twoColumnsFile },
	"step-subtasks": { place: "twoColumns", file: subtasksFile },
	"step-sections": { place: "twoColumns", file: sectionsFile },
	"step-long-lists": { place: "twoColumns", file: longListsFile },
	"step-calendar": { place: "calendar", file: () => calendarFile(new Date()) },
	"step-swipe": { place: "snap" },
	"whole-screen": { place: "leaf" },
};

/** The device's storage for the calendar's zoom, as Obsidian's local storage keeps it; a page whose storage is blocked keeps nothing. */
const load = (): unknown => {
	try {
		const text = window.localStorage.getItem(ZOOM_KEY);
		return text === null ? null : JSON.parse(text);
	} catch {
		return null;
	}
};
const save = (value: unknown): void => {
	try {
		window.localStorage.setItem(ZOOM_KEY, JSON.stringify(value));
	} catch {
		/* kept for this page only */
	}
};

/** The note the stand's block sits in, as Obsidian's reading view lays it out. */
const NOTE_PATH = "Заметка о доме.md";

class StandPage {
	readonly port = new MockPort();
	private readonly screens = new Set<MountedScreen>();
	private leafScreen: MountedScreen | null = null;
	private leafPlace: Place = "leaf";
	private readonly app = {} as App;
	private readonly haptics = detectHaptics(window as unknown as HapticsHost);

	constructor(private readonly leaf: HTMLElement) {}

	showLeaf(place: Place): void {
		this.clear();
		this.leafPlace = place;
		const content = this.leaf.ownerDocument.createElement("div");
		content.className = "view-content tc-view";
		this.leaf.appendChild(content);
		this.leafScreen = this.mount(content, place, "");
	}

	showStep(id: string): void {
		const step = STEPS[id];
		if (!step) throw new Error(`no stand step ${id}`);
		this.port.reset(step.file?.());
		this.showLeaf(step.place);
	}

	openNote(): void {
		this.clear();
		const doc = this.leaf.ownerDocument;
		const view = doc.createElement("div");
		view.className = "view-content markdown-reading-view";
		const preview = doc.createElement("div");
		preview.className = "markdown-preview-view";
		const text = doc.createElement("p");
		text.textContent = "Дом.";
		const block = doc.createElement("div");
		block.className = "tc-stand-block";
		preview.append(text, block);
		view.appendChild(preview);
		this.leaf.appendChild(view);
		this.mount(block, "note", NOTE_PATH);
	}

	/** A key of the screen's table, as the stand's view scope runs it: only while the screen takes keys. */
	onKey = (event: KeyboardEvent): void => {
		if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
		const key = KEYS.find((k) => k.key === event.key && k.modifiers.length === 0);
		const screen = this.leafScreen?.store.getState();
		/** The step of the ribbon as a gallery has no keys yet, as on the stand. */
		if (!key || !screen || !takesKeys(screen) || this.leafPlace === "snap") return;
		key.run(screen);
		event.preventDefault();
	};

	api() {
		const port = this.port;
		return {
			fileText: () => port.fileText(),
			reset: () => port.reset(),
			setDelay: (delay: WriteDelay) => (port.delay = delay),
			addFromOutside: (list: ListKey, title: string) => port.addFromOutside(list, title),
			moveFromOutside: (title: string, list: ListKey, before: string | null) => port.moveFromOutside(title, list, before),
			setStop: (stop: Stop) => this.screens.forEach((screen) => screen.store.getState().setStop(stop)),
			debug: () =>
				[...this.screens].map((screen) => {
					const { stop, gesture, lifted, layer, entry, pending, dayOffset } = screen.store.getState();
					return { stop, gesture, lifted, layer: layer?.kind ?? null, entry, pending, dayOffset };
				}),
			step: (id: string) => this.showStep(id),
			openNote: () => this.openNote(),
		};
	}

	private mount(el: HTMLElement, place: Place, sourcePath: string): MountedScreen {
		const screen = mountScreen(el, { port: this.port, place, app: this.app, sourcePath, haptics: this.haptics, zoom: keptZoom(load, save) });
		this.screens.add(screen);
		return screen;
	}

	private clear(): void {
		for (const screen of this.screens) screen.unmount();
		this.screens.clear();
		this.leafScreen = null;
		this.leaf.replaceChildren();
	}
}

const params = new URLSearchParams(location.search);
const phone = params.get("platform") === "phone";
document.body.classList.add(params.get("theme") === "light" ? "theme-light" : "theme-dark", ...(phone ? ["is-mobile", "is-phone", "is-floating-nav", "auto-full-screen"] : ["is-desktop"]));
showPriorityColors([]);
const leaf = document.createElement("div");
leaf.className = "workspace-leaf-content";
document.body.appendChild(leaf);
const stand = new StandPage(leaf);
window.addEventListener("keydown", stand.onKey);
(window as unknown as { __tcStand: ReturnType<StandPage["api"]> }).__tcStand = stand.api();
stand.showLeaf("leaf");
