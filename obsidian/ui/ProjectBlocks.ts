import { type App, Component, MarkdownView, Scope, type TAbstractFile, type WorkspaceLeaf } from "obsidian";
import { CalendarScreen, type ViewDeps } from "./CalendarScreen";
import { BlockHeight } from "./BlockHeight";
import { el } from "./dom";
import { ViewWatch } from "./ViewWatch";

/**
 * The view fixed to a project at the end of the project's note (boards D5, T6): shown by itself in Reading view and in
 * Live Preview, where Obsidian puts its own backlinks in the document, and never written into the note. Cmd+Z,
 * Cmd+Shift+Z and Cmd+F are the block's only while the focus is in it, through a scope over Obsidian's keys.
 */
class ProjectBlock extends Component {
	readonly el: HTMLElement;
	private readonly screen: CalendarScreen;
	/** The block's keys, put over Obsidian's while the focus is in the block: the note's Cmd+F and Cmd+Z don't reach the note. */
	private readonly scope: Scope;
	private scoped = false;
	private readonly height: BlockHeight;
	/** Put on the page and loaded: its screen is open. */
	shown = false;

	constructor(
		private readonly app: App,
		public path: string,
		deps: ViewDeps,
	) {
		super();
		this.el = el(null, "div", "tc-project-block");
		this.el.tabIndex = -1;
		const root = el(this.el, "div");
		this.scope = new Scope(app.scope);
		const screen = this.addChild(new CalendarScreen(app, root, deps, { view: false, keys: this.scope, note: () => this.path }));
		this.screen = screen;
		this.height = new BlockHeight(this.el, root, () => screen.scroller());
		this.scope.register(["Mod"], "z", () => screen.undoKey("undo"));
		this.scope.register(["Mod", "Shift"], "z", () => screen.undoKey("redo"));
		this.scope.register(["Mod"], "f", () => screen.findKey());
	}

	override onload(): void {
		/** The note's editor puts the cursor at the end on a click below its text: the block's own presses stop at it. */
		for (const type of ["mousedown", "click", "dblclick"] as const) this.registerDomEvent(this.el, type, (e) => e.stopPropagation());
		this.registerDomEvent(this.el, "pointerdown", () => {
			if (!this.el.contains(this.el.ownerDocument.activeElement)) this.el.focus({ preventScroll: true });
		});
		this.registerDomEvent(this.el, "focusin", () => this.holdKeys(true));
		this.registerDomEvent(this.el, "focusout", (e) => {
			if (!(e.relatedTarget instanceof Node && this.el.contains(e.relatedTarget))) this.holdKeys(false);
		});
		void this.screen.open();
		this.height.start();
	}

	override onunload(): void {
		this.height.stop();
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

/** The room Live Preview keeps past the note's end, which the block rises over: the editor sets it as the window's height changes. */
const BLOCK_LIFT = "--tc-block-lift";

/**
 * A block at the end of every open note a project is attached to (`TaskService.projectNoteView`): one per Markdown view,
 * made when the view shows such a note, moved between Live Preview and Reading view as the view's mode changes, gone when
 * the note is no project's or the view closes.
 */
export class ProjectBlocks extends Component {
	private readonly blocks = new Map<MarkdownView, ProjectBlock>();
	/** Each block's view watched for its own changes: a mode switched any way, a page drawn again. */
	private readonly watches = new Map<MarkdownView, ViewWatch>();
	/** The last ask per view: an answer overtaken by a later one is dropped. */
	private readonly asks = new Map<MarkdownView, number>();

	constructor(
		private readonly app: App,
		private readonly deps: ViewDeps,
	) {
		super();
	}

	override onload(): void {
		const { workspace, vault } = this.app;
		const sync = () => this.sync();
		this.registerEvent(workspace.on("layout-change", sync));
		this.registerEvent(workspace.on("file-open", sync));
		this.registerEvent(workspace.on("active-leaf-change", sync));
		this.registerEvent(workspace.on("resize", () => this.blocks.forEach((block) => block.resize())));
		this.registerEvent(vault.on("rename", (file: TAbstractFile, from: string) => this.renamed(from, file.path)));
		/** A note may have become a project's or stopped being one; a block that stays where it stands is left alone. */
		this.register(this.deps.tasks.onChange(sync));
		workspace.onLayoutReady(sync);
	}

	override onunload(): void {
		for (const [view, block] of [...this.blocks]) this.drop(view, block);
	}

	/** A note renamed or moved: its block follows it at once, and is kept or dropped once the core has the new path. */
	private renamed(from: string, to: string): void {
		for (const block of this.blocks.values()) if (block.path === from) block.path = to;
		this.sync();
	}

	/** Every Markdown view gets the block its note asks for, where its mode shows the end of the note. */
	private sync(): void {
		const views = new Set<MarkdownView>();
		this.app.workspace.iterateAllLeaves((leaf: WorkspaceLeaf) => {
			if (leaf.view instanceof MarkdownView) views.add(leaf.view);
		});
		for (const [view, block] of this.blocks) if (!views.has(view)) this.drop(view, block);
		for (const view of views) void this.fit(view);
	}

	private async fit(view: MarkdownView): Promise<void> {
		const ask = (this.asks.get(view) ?? 0) + 1;
		this.asks.set(view, ask);
		const path = view.file?.path ?? null;
		const shown = path !== null && (await this.deps.tasks.projectNoteView(path, !view.containerEl.ownerDocument.body.classList.contains("is-mobile"))) !== null;
		if (this.asks.get(view) !== ask) return;
		let block = this.blocks.get(view) ?? null;
		if (block && (!shown || block.path !== path)) {
			this.drop(view, block);
			block = null;
		}
		if (!shown || path === null) return;
		if (!block) {
			block = new ProjectBlock(this.app, path, this.deps);
			this.blocks.set(view, block);
			this.watch(view, block);
		}
		this.place(view, block);
	}

	private watch(view: MarkdownView, block: ProjectBlock): void {
		const watch = new ViewWatch(view.containerEl, () => block.el, () => {
			if (this.blocks.get(view) === block) this.place(view, block);
		});
		this.watches.set(view, watch);
		watch.start();
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
		const lift = reading ? "" : (content?.querySelector<HTMLElement>(":scope > .cm-content")?.style.paddingBottom ?? "");
		if (block.el.style.getPropertyValue(BLOCK_LIFT) !== lift) block.el.style.setProperty(BLOCK_LIFT, lift);
		if (!block.shown) {
			block.shown = true;
			this.addChild(block);
		} else if (moved) block.resize();
	}

	private drop(view: MarkdownView, block: ProjectBlock): void {
		this.watches.get(view)?.stop();
		this.watches.delete(view);
		this.blocks.delete(view);
		this.removeChild(block);
	}
}
