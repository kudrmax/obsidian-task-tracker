import { type App, Component, MarkdownView, type TAbstractFile, type WorkspaceLeaf } from "obsidian";
import { type FunnelView, projectNodeOf, type TaskService } from "../../core/application/contracts";
import type { ScreenContext } from "../ui/engine/port";
import { ScreenBlock } from "./ScreenBlock";
import type { ScreenHost } from "./ScreenHost";
import { ViewWatch } from "./ViewWatch";

/** The room Live Preview keeps past the note's end, which the block rises over: the editor sets it as the window's height changes. */
const BLOCK_LIFT = "--tc-block-lift";
/** The block's own place at a note's end (boards D5, T6). */
const PROJECT_BLOCK = "tc-project-block";

/** The project a note's view shows, as the screen's context; null where the note is no project's. */
function contextOf(view: FunnelView | null): ScreenContext | null {
	const filter = view?.filter;
	return filter && projectNodeOf(filter.title) === filter.node ? { project: filter.title } : null;
}

/** A project note's block: `TaskScreen` in the note's project, and the note's path it was made for. */
class ProjectBlock {
	readonly block: ScreenBlock;
	/** Put on the page and loaded. */
	shown = false;

	constructor(
		readonly path: string,
		readonly project: string | null,
		host: ScreenHost,
		context: ScreenContext,
	) {
		const el = document.createElement("div");
		el.addClass(PROJECT_BLOCK);
		this.block = new ScreenBlock(el, host, path, context);
	}
}

/**
 * A block at the end of every open note a project is attached to (`TaskService.projectNoteView`): one per Markdown view,
 * made when the view shows such a note, moved between Live Preview and Reading view as the view's mode changes, gone when
 * the note is no project's or the view closes. It shows the note's project's tasks (the screen's context).
 */
export class NoteBlocks extends Component {
	private readonly blocks = new Map<MarkdownView, ProjectBlock>();
	private readonly watches = new Map<MarkdownView, ViewWatch>();
	/** The last ask per view: an answer overtaken by a later one is dropped. */
	private readonly asks = new Map<MarkdownView, number>();

	constructor(
		private readonly app: App,
		private readonly tasks: Pick<TaskService, "projectNoteView" | "onChange">,
		private readonly host: ScreenHost,
	) {
		super();
	}

	override onload(): void {
		const { workspace, vault } = this.app;
		const sync = () => this.sync();
		this.registerEvent(workspace.on("layout-change", sync));
		this.registerEvent(workspace.on("file-open", sync));
		this.registerEvent(workspace.on("active-leaf-change", sync));
		this.registerEvent(vault.on("rename", (_file: TAbstractFile) => sync()));
		/** A note may have become a project's or stopped being one; a block that stays where it stands is left alone. */
		this.register(this.tasks.onChange(sync));
		workspace.onLayoutReady(sync);
	}

	override onunload(): void {
		for (const [view, block] of [...this.blocks]) this.drop(view, block);
	}

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
		const context = path === null ? null : contextOf(await this.tasks.projectNoteView(path, !view.containerEl.ownerDocument.body.classList.contains("is-mobile")));
		if (this.asks.get(view) !== ask) return;
		let block = this.blocks.get(view) ?? null;
		if (block && (!context || block.path !== path || block.project !== context.project)) {
			this.drop(view, block);
			block = null;
		}
		if (!context || path === null) return;
		if (!block) {
			block = new ProjectBlock(path, context.project, this.host, context);
			this.blocks.set(view, block);
			this.watch(view, block);
		}
		this.place(view, block);
	}

	private watch(view: MarkdownView, block: ProjectBlock): void {
		const watch = new ViewWatch(view.containerEl, () => block.block.el, () => {
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
		const el = block.block.el;
		const container = view.containerEl;
		const reading = view.getMode() === "preview";
		const footer = container.querySelector(".markdown-reading-view .markdown-preview-sizer > .mod-footer");
		const content = container.querySelector(".markdown-source-view .cm-sizer > .cm-contentContainer");
		const before = reading ? (footer?.firstChild ?? null) : (content?.nextSibling ?? null);
		const parent = reading ? footer : content?.parentElement;
		if (!parent) return;
		if (el.parentElement !== parent || (el.nextSibling !== before && el !== before)) parent.insertBefore(el, before);
		const lift = reading ? "" : (content?.querySelector<HTMLElement>(":scope > .cm-content")?.style.paddingBottom ?? "");
		if (el.style.getPropertyValue(BLOCK_LIFT) !== lift) el.style.setProperty(BLOCK_LIFT, lift);
		if (block.shown) return;
		block.shown = true;
		this.addChild(block.block);
	}

	private drop(view: MarkdownView, block: ProjectBlock): void {
		this.watches.get(view)?.stop();
		this.watches.delete(view);
		this.blocks.delete(view);
		this.removeChild(block.block);
		block.block.el.remove();
	}
}
