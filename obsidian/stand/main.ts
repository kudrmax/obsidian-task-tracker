import { ItemView, MarkdownRenderChild, Platform, Plugin, Scope, type TFile, type WorkspaceLeaf } from "obsidian";
import { KEYS, takesKeys } from "../ui/engine/keys";
import type { Place } from "../ui/engine/layout/Layout";
import { type MountedScreen, mountScreen } from "../ui/engine/mount";
import type { Stop } from "../ui/engine/store";
import { detectHaptics, type HapticsHost } from "../ui/haptics";
import { clearPriorityColors, showPriorityColors } from "../ui/priorityColors";
import { addWindowDocument } from "../ui/windowDocuments";
import { calendarFile, type ListKey, longListsFile, type MockFile, oneColumnFile, sectionsFile, subtasksFile, twoColumnsFile } from "./mockData";
import { keptZoom, MockPort, WRITE_DELAYS, type WriteDelay, ZOOM_KEY } from "./MockPort";

/** The stand's own view type and code block language: never the plugin's. */
export const STAND_VIEW = "task-calendar-stand";
const BLOCK_LANGUAGE = "task-calendar-stand";
/** The note that holds the stand's block. */
const BLOCK_NOTE = "Заметка о доме.md";

const haptics = () => detectHaptics(window as unknown as HapticsHost);

/** The engine's screen in a leaf of its own, as the plugin's view will show it; the key table on its scope. */
class StandView extends ItemView {
	screen: MountedScreen | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly stand: TaskCalendarStand,
	) {
		super(leaf);
		this.scope = new Scope(this.app.scope);
		for (const key of KEYS) this.scope.register([...key.modifiers], key.key, () => this.runKey(key.id));
	}

	override getViewType(): string {
		return STAND_VIEW;
	}

	override getDisplayText(): string {
		return "Task Calendar Stand";
	}

	override getIcon(): string {
		return "flask-conical";
	}

	/** A key of the table on this screen; false keeps the key from the page once taken. */
	runKey(id: string): boolean {
		const screen = this.screen?.store.getState();
		const key = KEYS.find((k) => k.id === id);
		/** The step of the ribbon as a gallery has no keys yet: only the fingers move it. */
		if (!screen || !key || !takesKeys(screen) || this.stand.leafPlace === "follow") return true;
		key.run(screen);
		return false;
	}

	override async onOpen(): Promise<void> {
		this.remount();
	}

	override async onClose(): Promise<void> {
		this.unmount();
	}

	/** The screen drawn again for the stand's step now: the view's own screen, Obsidian's lifecycle left alone. */
	remount(): void {
		this.unmount();
		this.contentEl.empty();
		this.contentEl.addClass("tc-view");
		this.screen = mountScreen(this.contentEl, { port: this.stand.port, place: this.stand.leafPlace, app: this.app, sourcePath: "", haptics: haptics(), zoom: this.stand.zoom() });
		this.stand.screens.add(this.screen);
	}

	private unmount(): void {
		if (this.screen) this.stand.screens.delete(this.screen);
		this.screen?.unmount();
		this.screen = null;
	}
}

/** The engine's same screen in a note's block. */
class StandBlock extends MarkdownRenderChild {
	private screen: MountedScreen | null = null;

	constructor(
		el: HTMLElement,
		private readonly stand: TaskCalendarStand,
		private readonly path: string,
	) {
		super(el);
	}

	override onload(): void {
		this.containerEl.addClass("tc-stand-block");
		this.screen = mountScreen(this.containerEl, { port: this.stand.port, place: "note", app: this.stand.app, sourcePath: this.path, haptics: haptics(), zoom: this.stand.zoom() });
		this.stand.screens.add(this.screen);
	}

	override onunload(): void {
		if (this.screen) this.stand.screens.delete(this.screen);
		this.screen?.unmount();
		this.screen = null;
	}
}

/** What the checks and a person debugging reach on `window.__tcStand`: the made-up tasks' file and the stand's switches; never the screen's own state. */
export interface StandApi {
	fileText(): string;
	reset(): void;
	setDelay(delay: WriteDelay): void;
	addFromOutside(list: ListKey, title: string): void;
	moveFromOutside(title: string, list: ListKey, before: string | null): void;
	/** Puts every open screen's ribbon at `stop`, as a scenario's setup. */
	setStop(stop: Stop): void;
	/** For a person debugging on the stand (the checks never read it): each open screen's stop, gesture slot, carried task and layer. */
	debug(): readonly object[];
}

/**
 * The stand (docs/superpowers/specs/2026-11-18-ui-engine.md, «The stand»): the engine over `MockPort`, for a test Obsidian
 * and a vault of its own on the phone. It opens the screen in a leaf, a pop-out window and a note's block.
 */
export default class TaskCalendarStand extends Plugin {
	readonly port = new MockPort();
	readonly screens = new Set<MountedScreen>();
	/** What a leaf shows: the whole screen, or a step alone (one column, then two) with plain tasks. */
	leafPlace: Place = "leaf";

	/** The calendar's zoom, kept on this device by Obsidian's local storage. */
	zoom() {
		return keptZoom(
			() => this.app.loadLocalStorage(ZOOM_KEY),
			(value) => this.app.saveLocalStorage(ZOOM_KEY, value),
		);
	}

	/** Shows `place` in every open leaf, with its tasks: the first step's dozen, or the whole made-up file. */
	private async showStep(place: Place, file: MockFile | undefined = place === "column" ? oneColumnFile() : place === "twoColumns" ? twoColumnsFile() : undefined): Promise<void> {
		this.leafPlace = place;
		this.port.reset(file);
		for (const leaf of this.app.workspace.getLeavesOfType(STAND_VIEW)) if (leaf.view instanceof StandView) leaf.view.remount();
	}

	override async onload(): Promise<void> {
		const port = this.port;
		const api: StandApi = {
			fileText: () => port.fileText(),
			reset: () => port.reset(),
			setDelay: (delay) => (port.delay = delay),
			addFromOutside: (list, title) => port.addFromOutside(list, title),
			moveFromOutside: (title, list, before) => port.moveFromOutside(title, list, before),
			setStop: (stop) => this.screens.forEach((screen) => screen.store.getState().setStop(stop)),
			debug: () => [...this.screens].map((screen) => {
				const { stop, gesture, lifted, layer, entry, pending, dayOffset } = screen.store.getState();
				return { stop, gesture, lifted, layer: layer?.kind ?? null, entry, pending, dayOffset };
			}),
		};
		(window as unknown as { __tcStand?: StandApi }).__tcStand = api;
		this.register(() => delete (window as unknown as { __tcStand?: StandApi }).__tcStand);
		showPriorityColors([]);
		this.register(clearPriorityColors);
		this.followWindows();

		this.registerView(STAND_VIEW, (leaf) => new StandView(leaf, this));
		this.registerMarkdownCodeBlockProcessor(BLOCK_LANGUAGE, (_source, el, ctx) => ctx.addChild(new StandBlock(el, this, ctx.sourcePath)));
		for (const key of KEYS) this.addCommand({ id: key.id, name: key.name, checkCallback: (checking) => this.onActiveView(checking, (view) => view.runKey(key.id)) });
		this.addRibbonIcon("flask-conical", "Task Calendar Stand", () => void this.open());
		this.addCommand({ id: "open", name: "Open the screen", callback: () => void this.open() });
		if (!Platform.isMobile) this.addCommand({ id: "open-window", name: "Open the screen in a new window", callback: () => void this.open(true) });
		this.addCommand({ id: "open-note", name: "Open the note with the screen's block", callback: () => void this.openNote() });
		this.addCommand({ id: "new-tasks", name: "New made-up tasks", callback: () => port.reset() });
		this.addCommand({ id: "step-one-column", name: "Step 1: one column and drag", callback: () => void this.showStep("column") });
		this.addCommand({ id: "step-two-columns", name: "Step 2: two columns and drag between them", callback: () => void this.showStep("twoColumns") });
		this.addCommand({ id: "step-subtasks", name: "Step 3: subtasks", callback: () => void this.showStep("twoColumns", subtasksFile()) });
		this.addCommand({ id: "step-sections", name: "Step 4: sections", callback: () => void this.showStep("twoColumns", sectionsFile()) });
		this.addCommand({ id: "step-long-lists", name: "Step 5: long lists", callback: () => void this.showStep("twoColumns", longListsFile()) });
		this.addCommand({ id: "step-calendar", name: "Step 6: onto and off the calendar", callback: () => void this.showStep("calendar", calendarFile(new Date())) });
		this.addCommand({ id: "step-swipe", name: "Step 7: swipe the columns", callback: () => void this.showStep("follow") });
		this.addCommand({ id: "step-menu", name: "Step 8: the task menu", callback: () => void this.showStep("calendar", calendarFile(new Date())) });
		this.addCommand({ id: "whole-screen", name: "The whole screen", callback: () => void this.showStep("leaf") });
		for (const delay of WRITE_DELAYS) this.addCommand({ id: `delay-${delay}`, name: `Write delay ${delay} ms`, callback: () => (port.delay = delay) });
	}

	private onActiveView(checking: boolean, run: (view: StandView) => void): boolean {
		const view = this.app.workspace.getActiveViewOfType(StandView);
		if (!view) return false;
		if (!checking) run(view);
		return true;
	}

	/** A pop-out window gets the same paint as the main one. */
	private followWindows(): void {
		const closings = new Map<Document, () => void>();
		this.registerEvent(
			this.app.workspace.on("window-open", (win) => {
				if (win.doc !== document && !closings.has(win.doc)) closings.set(win.doc, addWindowDocument(win.doc));
			}),
		);
		this.registerEvent(
			this.app.workspace.on("window-close", (win) => {
				closings.get(win.doc)?.();
				closings.delete(win.doc);
			}),
		);
		this.register(() => closings.forEach((close) => close()));
	}

	async open(popout = false): Promise<WorkspaceLeaf> {
		const workspace = this.app.workspace;
		const leaf = popout ? workspace.openPopoutLeaf() : (workspace.getLeavesOfType(STAND_VIEW)[0] ?? workspace.getLeaf(true));
		await leaf.setViewState({ type: STAND_VIEW, active: true });
		await workspace.revealLeaf(leaf);
		return leaf;
	}

	/** The note holding the stand's block; made when missing. */
	async openNote(): Promise<void> {
		const vault = this.app.vault;
		const file = (vault.getAbstractFileByPath(BLOCK_NOTE) as TFile | null) ?? (await vault.create(BLOCK_NOTE, `Дом.\n\n\`\`\`${BLOCK_LANGUAGE}\n\`\`\`\n`));
		await this.app.workspace.getLeaf(false).openFile(file);
	}
}
