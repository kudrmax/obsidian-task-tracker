import { type App, Component, Notice, FileSystemAdapter, ItemView, MarkdownRenderChild, MarkdownRenderer, Platform, Plugin, Scope, type TFile, type WorkspaceLeaf } from "obsidian";
import type { MacTrackpadFingers } from "../infrastructure/trackpad/MacTrackpadFingers";
import { KEYS, takesKeys } from "../ui/engine/keys";
import type { Place } from "../ui/engine/layout/Layout";
import { type MountedScreen, mountScreen } from "../ui/engine/mount";
import type { Stop } from "../ui/engine/store";
import { failureText } from "../ui/failureText";
import { detectHaptics, type HapticsHost } from "../ui/haptics";
import { clearPriorityColors, showPriorityColors } from "../ui/priorityColors";
import { addWindowDocument } from "../ui/windowDocuments";
import { type ListKey, MOCK_PROJECTS } from "./mockData";
import { keptListShare, keptZoom, LIST_SHARE_KEY, WRITE_DELAYS, type WriteDelay, ZOOM_KEY } from "./MockPort";
import { coreSource, mockSource, type StandPortKind, type StandSource } from "./standSource";
import { STAND_STEPS, type StandStep, WHOLE_SCREEN } from "./steps";

/** The stand's own view type and code block language: never the plugin's. */
export const STAND_VIEW = "task-calendar-stand";
const BLOCK_LANGUAGE = "task-calendar-stand";
/** The note that holds the stand's block. */
const BLOCK_NOTE = "Заметка о доме.md";

const haptics = () => detectHaptics(window as unknown as HapticsHost);

/** Markdown drawn by Obsidian's own renderer, its component kept until the drawing is taken away. */
const markdownOf =
	(app: App) =>
	(text: string, el: HTMLElement, sourcePath: string): (() => void) => {
		const component = new Component();
		component.load();
		void MarkdownRenderer.render(app, text, el, sourcePath, component);
		return () => {
			component.unload();
			el.empty();
		};
	};

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
		if (!screen || !key || !takesKeys(screen)) return true;
		key.run(screen);
		return false;
	}

	override async onOpen(): Promise<void> {
		this.remount();
	}

	override async onClose(): Promise<void> {
		this.unmount();
	}

	/** The screen drawn again for the stand's step now, the ribbon standing where the step shows: the view's own screen, Obsidian's lifecycle left alone. */
	remount(): void {
		this.unmount();
		this.contentEl.empty();
		this.contentEl.addClass("tc-view");
		this.screen = this.stand.mount(this.contentEl, "leaf", "");
		this.screen.store.getState().setStop(this.stand.step.stop);
	}

	private unmount(): void {
		this.stand.unmount(this.screen);
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
		this.screen = this.stand.mount(this.containerEl, "note", this.path);
	}

	override onunload(): void {
		this.stand.unmount(this.screen);
		this.screen = null;
	}
}

/** What the checks and a person debugging reach on `window.__tcStand`: the made-up tasks' file and the stand's switches; never the screen's own state. */
export interface StandApi {
	/** Which port the screen runs on: the stand's made-up rules, or the core's. */
	readonly port: StandPortKind;
	fileText(): string;
	reset(): void;
	setDelay(delay: WriteDelay): void;
	addFromOutside(list: ListKey, title: string): void;
	moveFromOutside(title: string, list: ListKey, before: string | null): void;
	/** Puts every open screen's ribbon at `stop`, as a scenario's setup. */
	setStop(stop: Stop): void;
	/** Chooses a made-up project on every open screen (null: none): a change of context, as the projects panel will make it. */
	setProject(project: string | null): void;
	/** For a person debugging on the stand (the checks never read it): each open screen's stop, gesture slot, carried task and layer. */
	debug(): readonly object[];
}

/**
 * The stand (docs/superpowers/specs/2026-11-18-ui-engine.md, «The stand»): the engine over `MockPort`, for a test Obsidian
 * and a vault of its own on the phone. It opens the screen in a leaf, a pop-out window and a note's block.
 */
export default class TaskCalendarStand extends Plugin {
	/** The tasks behind the screen: the stand's `MockPort`, or the core's rules over the made-up file in memory (`CorePort`). */
	source: StandSource = mockSource();
	readonly screens = new Set<MountedScreen>();
	/** The step a leaf shows: the whole screen, or the tasks of a step and the ribbon standing where they are. */
	step: StandStep = WHOLE_SCREEN;
	/** macOS's touch and lift on the trackpad (Decision 126); null on the phone, on Windows and Linux, and wherever the native module can't load. */
	fingers: MacTrackpadFingers | null = null;

	/** The calendar's zoom, kept on this device by Obsidian's local storage. */
	zoom() {
		return keptZoom(
			() => this.app.loadLocalStorage(ZOOM_KEY),
			(value) => this.app.saveLocalStorage(ZOOM_KEY, value),
		);
	}

	/** The day list's share beside the calendar, kept on this device by Obsidian's local storage. */
	listShare() {
		return keptListShare(
			() => this.app.loadLocalStorage(LIST_SHARE_KEY),
			(value) => this.app.saveLocalStorage(LIST_SHARE_KEY, value),
		);
	}

	/** The engine's screen mounted at `place` in `el`, over the stand's port, counted among the open screens. */
	mount(el: HTMLElement, place: Place, sourcePath: string): MountedScreen {
		const screen = mountScreen(el, { port: this.source.port, place, app: this.app, sourcePath, haptics: haptics(), zoom: this.zoom(), listShare: this.listShare(), markdown: markdownOf(this.app), desk: !Platform.isMobile, notice: (text) => new Notice(text), fingers: this.fingers });
		this.screens.add(screen);
		return screen;
	}

	/** A screen the stand mounted, taken off and no longer counted. */
	unmount(screen: MountedScreen | null): void {
		if (!screen) return;
		this.screens.delete(screen);
		screen.unmount();
	}

	/** Shows `step` in every open leaf, with its tasks. */
	private showStep(step: StandStep): void {
		this.step = step;
		this.source.reset(step.file?.());
		this.remountLeaves();
	}

	/** The screen run on `kind`'s port from now on, every open leaf drawn again over it; a note's block takes it when drawn next. */
	private async useSource(kind: StandPortKind): Promise<void> {
		if (this.source.kind === kind) return;
		this.source.dispose();
		this.source = kind === "core" ? await coreSource((error) => new Notice(failureText(error))) : mockSource();
		this.remountLeaves();
	}

	private remountLeaves(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(STAND_VIEW)) if (leaf.view instanceof StandView) leaf.view.remount();
	}

	override async onload(): Promise<void> {
		const stand = this;
		const api: StandApi = {
			get port() {
				return stand.source.kind;
			},
			fileText: () => this.source.fileText(),
			reset: () => this.source.reset(),
			setDelay: (delay) => this.source.setDelay(delay),
			addFromOutside: (list, title) => this.source.addFromOutside(list, title),
			moveFromOutside: (title, list, before) => this.source.moveFromOutside(title, list, before),
			setStop: (stop) => this.screens.forEach((screen) => screen.store.getState().setStop(stop)),
			setProject: (project) => this.screens.forEach((screen) => screen.store.getState().setContext({ project })),
			debug: () => [...this.screens].map((screen) => {
				const { stop, gesture, lifted, layer, entry, pending, dayOffset, menuLifted, selected } = screen.store.getState();
				return { stop, gesture, lifted, layer: layer?.kind ?? null, entry, pending, dayOffset, menuLifted, selected };
			}),
		};
		(window as unknown as { __tcStand?: StandApi }).__tcStand = api;
		this.register(() => delete (window as unknown as { __tcStand?: StandApi }).__tcStand);
		this.fingers = await this.hearFingers();
		this.register(() => {
			this.fingers?.dispose();
			this.fingers = null;
		});
		showPriorityColors([]);
		this.register(clearPriorityColors);
		this.register(() => this.source.dispose());
		this.followWindows();

		this.registerView(STAND_VIEW, (leaf) => new StandView(leaf, this));
		this.registerMarkdownCodeBlockProcessor(BLOCK_LANGUAGE, (_source, el, ctx) => ctx.addChild(new StandBlock(el, this, ctx.sourcePath)));
		for (const key of KEYS) this.addCommand({ id: key.id, name: key.name, checkCallback: (checking) => this.onActiveView(checking, (view) => view.runKey(key.id)) });
		this.addRibbonIcon("flask-conical", "Task Calendar Stand", () => void this.open());
		this.addCommand({ id: "open", name: "Open the screen", callback: () => void this.open() });
		if (!Platform.isMobile) this.addCommand({ id: "open-window", name: "Open the screen in a new window", callback: () => void this.open(true) });
		this.addCommand({ id: "open-note", name: "Open the note with the screen's block", callback: () => void this.openNote() });
		this.addCommand({ id: "new-tasks", name: "New made-up tasks", callback: () => this.source.reset() });
		this.addCommand({ id: "port-core", name: "Run on the core's rules (CorePort)", callback: () => void this.useSource("core") });
		this.addCommand({ id: "port-mock", name: "Run on the stand's made-up rules (MockPort)", callback: () => void this.useSource("mock") });
		for (const step of STAND_STEPS) this.addCommand({ id: step.id, name: step.name, callback: () => this.showStep(step) });
		for (const project of MOCK_PROJECTS.filter((p) => !p.folder)) this.addCommand({ id: `project-${project.name}`, name: `Choose the project «${project.name}»`, callback: () => api.setProject(project.name) });
		this.addCommand({ id: "project-none", name: "Choose no project", callback: () => api.setProject(null) });
		for (const delay of WRITE_DELAYS) this.addCommand({ id: `delay-${delay}`, name: `Write delay ${delay} ms`, callback: () => this.source.setDelay(delay) });
	}

	/** Loaded only on the Mac's desktop app: the module reads Node's files, which the phone's Obsidian refuses at the plugin's load. */
	private async hearFingers(): Promise<MacTrackpadFingers | null> {
		const adapter = this.app.vault.adapter;
		if (!Platform.isDesktopApp || !Platform.isMacOS || !(adapter instanceof FileSystemAdapter) || !this.manifest.dir) return null;
		const host = window as unknown as { require?: (id: string) => unknown };
		const [{ MacTrackpadFingers }, { TRACKPAD_MODULE }] = await Promise.all([import("../infrastructure/trackpad/MacTrackpadFingers"), import("../infrastructure/trackpad/module")]);
		return MacTrackpadFingers.load(
			TRACKPAD_MODULE,
			{
				dir: adapter.getFullPath(this.manifest.dir),
				electron: () => host.require?.("electron") as never,
				remoteFallback: () => {
					try {
						return host.require?.("@electron/remote") as never;
					} catch {
						return undefined;
					}
				},
				log: (message) => console.info(`[task-calendar-stand] ${message}`),
			},
			window,
		);
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
