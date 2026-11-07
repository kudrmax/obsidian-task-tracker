import { type App, Component, MarkdownView, Scope, type WorkspaceLeaf } from "obsidian";
import type { ProjectRef } from "../../core/application/contracts";
import { CalendarScreen, type ViewDeps } from "./CalendarScreen";
import { el } from "./dom";
import { type NotePlace, type NotePlaces, NoteShownSettings, type ShownSettingsStore } from "./viewSettings";

const PLACES_KEY = "task-calendar:note-places";

/** The blocks' places kept in Obsidian's local storage of the vault, per note, on this device only. */
export class LocalNotePlaces implements NotePlaces {
	constructor(private readonly app: App) {}

	get(path: string): NotePlace {
		return this.all()[path] ?? {};
	}

	set(path: string, place: NotePlace): void {
		this.app.saveLocalStorage(PLACES_KEY, JSON.stringify({ ...this.all(), [path]: place }));
	}

	private all(): Record<string, NotePlace> {
		const saved: unknown = this.app.loadLocalStorage(PLACES_KEY);
		if (typeof saved !== "string") return {};
		try {
			const parsed: unknown = JSON.parse(saved);
			return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, NotePlace>) : {};
		} catch {
			return {};
		}
	}
}

/**
 * The plugin's screen at the end of a project note, filtered to the project: shown by itself in Reading view and in Live
 * Preview, where Obsidian puts its own backlinks in the document, and never written into the note. Cmd+Z, Cmd+Shift+Z
 * and Cmd+F are the block's only while the focus is in it, through a scope over Obsidian's keys.
 */
class ProjectBlock extends Component {
	readonly el: HTMLElement;
	private readonly screen: CalendarScreen;
	/** The block's keys, put over Obsidian's while the focus is in the block: the note's Cmd+F and Cmd+Z don't reach the note. */
	private readonly scope: Scope;
	private scoped = false;
	/** Put on the page and loaded: its screen is open. */
	shown = false;

	constructor(
		private readonly app: App,
		readonly path: string,
		private project: ProjectRef,
		deps: ViewDeps,
	) {
		super();
		this.el = el(null, "div", "tc-project-block");
		this.el.tabIndex = -1;
		const root = el(this.el, "div");
		this.scope = new Scope(app.scope);
		const screen = this.addChild(new CalendarScreen(app, root, deps, { view: false, project: () => this.project.link, keys: this.scope }));
		this.screen = screen;
		this.scope.register(["Mod"], "z", () => screen.undoKey("undo"));
		this.scope.register(["Mod", "Shift"], "z", () => screen.undoKey("redo"));
		this.scope.register(["Mod"], "f", () => screen.findKey());
	}

	/** The project's link follows the note: a rename gives the same note another name. */
	follow(project: ProjectRef): void {
		this.project = project;
	}

	override onload(): void {
		/** The note's editor puts the cursor at the end on a click below its text: the block's own presses stop at it. */
		for (const type of ["mousedown", "click", "dblclick"] as const) this.registerDomEvent(this.el, type, (e) => e.stopPropagation());
		this.registerDomEvent(this.el, "pointerdown", () => {
			if (!this.el.contains(document.activeElement)) this.el.focus({ preventScroll: true });
		});
		this.registerDomEvent(this.el, "focusin", () => this.holdKeys(true));
		this.registerDomEvent(this.el, "focusout", (e) => {
			if (!(e.relatedTarget instanceof Node && this.el.contains(e.relatedTarget))) this.holdKeys(false);
		});
		void this.screen.open();
	}

	override onunload(): void {
		this.holdKeys(false);
		this.screen.close();
		this.el.remove();
	}

	resize(): void {
		this.screen.resize();
	}

	private holdKeys(on: boolean): void {
		if (on === this.scoped) return;
		this.scoped = on;
		if (on) this.app.keymap.pushScope(this.scope);
		else this.app.keymap.popScope(this.scope);
	}
}

/** Where the blocks get what they show: the services, and the screen's settings each block takes its own place over. */
export interface ProjectBlocksDeps {
	readonly app: App;
	readonly deps: ViewDeps;
	readonly settings: Pick<ShownSettingsStore, "get" | "onChange">;
}

/**
 * A block at the end of every project note open: one per Markdown view, made when the view shows a project's note, moved
 * between Live Preview and Reading view as the view's mode changes, gone when the note is no project or the view closes.
 */
export class ProjectBlocks extends Component {
	private readonly blocks = new Map<MarkdownView, ProjectBlock>();
	private readonly places: NotePlaces;

	constructor(private readonly host: ProjectBlocksDeps) {
		super();
		this.places = new LocalNotePlaces(host.app);
	}

	override onload(): void {
		const { workspace } = this.host.app;
		const sync = () => this.sync();
		this.registerEvent(workspace.on("layout-change", sync));
		this.registerEvent(workspace.on("file-open", sync));
		this.registerEvent(workspace.on("active-leaf-change", sync));
		this.registerEvent(workspace.on("resize", () => this.blocks.forEach((block) => block.resize())));
		/** A note may have become a project or stopped being one; a block that stays where it stands is left alone. */
		this.register(this.host.deps.tasks.onChange(sync));
		workspace.onLayoutReady(sync);
	}

	override onunload(): void {
		for (const block of this.blocks.values()) this.removeChild(block);
		this.blocks.clear();
	}

	/** Every Markdown view gets the block its note asks for, where its mode shows the end of the note. */
	private sync(): void {
		const views = new Set<MarkdownView>();
		this.host.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			if (leaf.view instanceof MarkdownView) views.add(leaf.view);
		});
		for (const [view, block] of this.blocks) if (!views.has(view)) this.drop(view, block);
		for (const view of views) this.fit(view);
	}

	private fit(view: MarkdownView): void {
		const path = view.file?.path ?? null;
		const project = path === null ? null : this.projectOf(path);
		let block = this.blocks.get(view) ?? null;
		if (block && (!project || block.path !== path)) {
			this.drop(view, block);
			block = null;
		}
		if (!project || path === null) return;
		if (!block) {
			block = this.make(path, project);
			this.blocks.set(view, block);
		} else block.follow(project);
		this.place(view, block);
	}

	private projectOf(path: string): ProjectRef | null {
		return this.host.deps.tasks.projectNotes().find((project) => project.note === path) ?? null;
	}

	private make(path: string, project: ProjectRef): ProjectBlock {
		const settings = new NoteShownSettings(this.host.settings, this.places, () => path);
		return new ProjectBlock(this.host.app, path, project, { ...this.host.deps, settings });
	}

	/**
	 * The block stands where Obsidian puts its backlinks in the document: in Live Preview right after the editor's content,
	 * in Reading view first in the note's footer. A block not yet on the page loads once it is.
	 */
	private place(view: MarkdownView, block: ProjectBlock): void {
		const container = view.containerEl;
		const reading = view.getMode() === "preview";
		const footer = container.querySelector(".markdown-reading-view .markdown-preview-sizer > .mod-footer");
		const content = container.querySelector(".markdown-source-view .cm-sizer > .cm-contentContainer");
		const before = reading ? (footer?.firstChild ?? null) : (content?.nextSibling ?? null);
		const parent = reading ? footer : content?.parentElement;
		if (!parent) return;
		const moved = block.el.parentElement !== parent || (block.el.nextSibling !== before && block.el !== before);
		if (moved) parent.insertBefore(block.el, before);
		if (!block.shown) {
			block.shown = true;
			this.addChild(block);
		} else if (moved) block.resize();
	}

	private drop(view: MarkdownView, block: ProjectBlock): void {
		this.blocks.delete(view);
		this.removeChild(block);
	}
}
