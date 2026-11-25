import type { App } from "obsidian";
import { detectHaptics, type HapticsHost } from "../../../obsidian/host/haptics";
import { ScreenMounts } from "../../../obsidian/host/ScreenMounts";
import { keptDevice } from "../../../obsidian/memoryCore";
import { standApi } from "../../../obsidian/stand/standApi";
import { type StandSource, standSource } from "../../../obsidian/stand/standSource";
import { STAND_STEPS, type StandStep, WHOLE_SCREEN } from "../../../obsidian/stand/steps";
import { KEYS, takesKeys } from "../../../obsidian/ui/engine/keys";
import type { MountedScreen } from "../../../obsidian/ui/engine/mount";
import { showScreenPaint } from "../../../obsidian/ui/paint/screenPaint";

/**
 * The end-to-end checks' page: the stand (obsidian/stand) off Obsidian. The engine over `CorePort` and the core over the
 * made-up tasks file in memory, mounted by the host's `ScreenMounts` as the plugin and the stand mount it, in a leaf's content element, Obsidian's body classes for the theme and the platform (`?theme=dark|light&platform=desktop|phone`), the
 * screen's key table on the window as the stand's view scope has it, and `window.__tcStand` as the stand plugin gives it,
 * with `step(id)` for the stand's step commands and `openNote()` for the note's block.
 */

/** The device's storage for the screen's keys, as Obsidian's local storage keeps them; a page whose storage is blocked keeps nothing. */
const DEVICE_KEY = "task-calendar-stand:device";
const load = (key: string): unknown => {
	try {
		const text = window.localStorage.getItem(key);
		return text === null ? null : JSON.parse(text);
	} catch {
		return null;
	}
};
const save = (key: string, value: unknown): void => {
	try {
		window.localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* kept for this page only */
	}
};

/** The page has no Obsidian to draw markdown: a paragraph of its text, in the class Obsidian's drawing has. */
const plainMarkdown = (text: string, el: HTMLElement): (() => void) => {
	const p = el.ownerDocument.createElement("p");
	p.textContent = text;
	el.classList.add("markdown-rendered");
	el.appendChild(p);
	return () => p.remove();
};

/** The note the stand's block sits in, as Obsidian's reading view lays it out. */
const NOTE_PATH = "Заметка о доме.md";

class StandPage {
	private leafScreen: MountedScreen | null = null;
	/** A note's block open beside the leaf, ahead of it in the page (`openNoteBeside`). */
	private beside: HTMLElement | null = null;
	/** The notices shown, in order, as Obsidian's `Notice` would show them. */
	private readonly notices: string[] = [];
	private readonly mounts: ScreenMounts;

	constructor(
		private readonly leaf: HTMLElement,
		private readonly source: StandSource,
	) {
		this.mounts = new ScreenMounts({ port: source.port, device: source.device, app: {} as App, haptics: detectHaptics(window as unknown as HapticsHost), markdown: plainMarkdown, notice: (text) => void this.notices.push(text), desk: !document.body.classList.contains("is-mobile"), fingers: null });
	}

	showLeaf(step: StandStep): void {
		this.clear();
		const content = this.leaf.ownerDocument.createElement("div");
		content.className = "view-content tc-view";
		this.leaf.appendChild(content);
		this.leafScreen = this.mount(content, "leaf", "");
		this.leafScreen.store.getState().setStop(step.stop);
	}

	showStep(id: string): void {
		const step = STAND_STEPS.find((s) => s.id === id);
		if (!step) throw new Error(`no stand step ${id}`);
		this.source.reset(step.file?.());
		this.showLeaf(step);
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
		block.className = "tc-note-block";
		preview.append(text, block);
		view.appendChild(preview);
		this.leaf.appendChild(view);
		this.mount(block, "note", NOTE_PATH);
	}

	/** A note's block open beside the leaf's screen and ahead of it in the page, as a note and the view stand side by side in Obsidian: the same tasks on two screens. */
	openNoteBeside(): void {
		const doc = this.leaf.ownerDocument;
		const block = doc.createElement("div");
		block.className = "tc-note-block";
		/** Out of the way of the leaf's screen: it is there to share the tasks' ids, not to be pressed. */
		block.style.cssText = "position: absolute; left: 0; top: 0; width: 320px; visibility: hidden;";
		doc.body.insertBefore(block, this.leaf);
		this.beside = block;
		this.mount(block, "note", NOTE_PATH);
	}

	/** A key of the screen's table, as the stand's view scope runs it (`Mod` is ⌘ or Ctrl): only while the screen takes keys. */
	onKey = (event: KeyboardEvent): void => {
		if (event.defaultPrevented) return;
		const held = [...(event.metaKey || event.ctrlKey ? ["Mod"] : []), ...(event.shiftKey ? ["Shift"] : []), ...(event.altKey ? ["Alt"] : [])];
		const key = KEYS.find((k) => k.key.toLowerCase() === event.key.toLowerCase() && k.modifiers.length === held.length && k.modifiers.every((m) => held.includes(m)));
		const screen = this.leafScreen?.store.getState();
		if (!key || !screen || !takesKeys(screen)) return;
		key.run(screen);
		event.preventDefault();
	};

	api() {
		return {
			...standApi(this.source, () => this.mounts.open),
			step: (id: string) => this.showStep(id),
			notices: () => [...this.notices],
			openNote: () => this.openNote(),
			openNoteBeside: () => this.openNoteBeside(),
		};
	}

	private mount(el: HTMLElement, place: "leaf" | "note", sourcePath: string): MountedScreen {
		return this.mounts.mount(el, place, sourcePath, place === "note" ? { project: null, note: sourcePath } : undefined);
	}

	private clear(): void {
		this.mounts.dispose();
		this.leafScreen = null;
		this.leaf.replaceChildren();
		this.beside?.remove();
		this.beside = null;
	}
}

const params = new URLSearchParams(location.search);
const phone = params.get("platform") === "phone";
document.body.classList.add(params.get("theme") === "light" ? "theme-light" : "theme-dark", ...(phone ? ["is-mobile", "is-phone", "is-floating-nav", "auto-full-screen"] : ["is-desktop"]));
const leaf = document.createElement("div");
leaf.className = "workspace-leaf-content";
document.body.appendChild(leaf);
void standSource(keptDevice(() => load(DEVICE_KEY), (value) => save(DEVICE_KEY, value)), (error) => console.error("write failed", error)).then((source) => {
	showScreenPaint(source.paint.get());
	const stand = new StandPage(leaf, source);
	window.addEventListener("keydown", stand.onKey);
	(window as unknown as { __tcStand: ReturnType<StandPage["api"]> }).__tcStand = stand.api();
	stand.showLeaf(WHOLE_SCREEN);
});
