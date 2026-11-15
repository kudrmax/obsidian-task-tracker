import type { App, EventRef, TAbstractFile } from "obsidian";
import type { HostSession } from "../../../../runtime/Runtime";
import { Chrome } from "../../drivers/chrome";
import { Motion } from "../../drivers/motion";
import { type BlockDeps, BlockHost } from "./BlockHost";

/** The parts of Obsidian's Markdown view a block is placed among: typed here, as Obsidian has them (1.13). */
export interface NoteView {
	readonly file: { readonly path: string } | null;
	getMode(): "source" | "preview";
	readonly containerEl: HTMLElement;
	/** Live Preview's editor: its content's node sits in the editor's sizer, after which Obsidian puts its backlinks. */
	readonly editor?: { readonly cm?: { readonly contentDOM: HTMLElement } };
	/** Reading view: its footer, first in which Obsidian puts its backlinks. */
	readonly previewMode?: { readonly renderer?: { readonly footer?: { readonly el?: HTMLElement } } };
}

/** What the blocks reach of Obsidian: the open notes' views and the workspace's and vault's events. */
export interface NotePlaces {
	views(): readonly NoteView[];
	on(name: "layout-change" | "file-open" | "active-leaf-change" | "resize", callback: () => void): EventRef;
	onRename(callback: (file: TAbstractFile, from: string) => void): EventRef;
	offref(ref: EventRef): void;
}

/** What each block's host is made with, but its session: every block gets one of its own (P8). */
export type NoteBlockDeps = Omit<BlockDeps, "session"> & { readonly openSession: () => HostSession };

/** The room Live Preview keeps past the note's end, which the block rises over: the editor sets it as the window's height changes. */
const BLOCK_LIFT = "--tc-block-lift";

interface Placed {
	readonly host: BlockHost;
	path: string;
	stopWatch: () => void;
	/** Live Preview's content node whose growth the block stops while it stands after it. */
	content: HTMLElement | null;
}

/**
 * A block at the end of every open note a project is attached to (D3): one per Markdown view, made when the view shows
 * such a note (`tasks.projectNoteView` answers a view), moved between Live Preview and Reading view as the view's mode
 * changes, gone when the note is no project's or the view closes. Never written into the note.
 */
export class NoteBlocks {
	private readonly blocks = new Map<NoteView, Placed>();
	private readonly refs: EventRef[] = [];
	private readonly session: HostSession;
	private stopRuntime: (() => void) | null = null;
	private disposed = false;

	constructor(
		private readonly places: NotePlaces,
		private readonly deps: NoteBlockDeps,
	) {
		this.session = deps.openSession();
	}

	/** Watches the workspace and the replica; the blocks are fitted at once. */
	start(): void {
		const sync = () => this.sync();
		for (const name of ["layout-change", "file-open", "active-leaf-change"] as const) this.refs.push(this.places.on(name, sync));
		this.refs.push(this.places.onRename((_file, from) => this.renamed(from)));
		/** A note may have become a project's or stopped being one; a block that stays where it stands is left alone. */
		this.stopRuntime = this.session.subscribe(sync);
		sync();
	}

	private renamed(from: string): void {
		for (const placed of this.blocks.values()) if (placed.path === from) placed.path = "";
		this.sync();
	}

	/** Whether the note at `path` is a project's: its block shows the project's view. */
	private shows(path: string): boolean {
		const answer = this.session.views([{ key: "note", method: "tasks.projectNoteView", args: [path, Chrome.wide()] }]).get("note");
		return answer?.ok === true && answer.result !== null;
	}

	/** Every Markdown view gets the block its note asks for, where its mode shows the end of the note. */
	sync(): void {
		if (this.disposed) return;
		const views = new Set(this.places.views());
		for (const [view, placed] of [...this.blocks]) if (!views.has(view)) this.drop(view, placed);
		for (const view of views) {
			const path = view.file?.path ?? null;
			let placed = this.blocks.get(view) ?? null;
			const shown = path !== null && this.shows(path);
			if (placed && (!shown || placed.path !== path)) {
				this.drop(view, placed);
				placed = null;
			}
			if (!shown || path === null) continue;
			if (!placed) placed = this.make(view, path);
			this.place(view, placed);
		}
	}

	private make(view: NoteView, path: string): Placed {
		const host = new BlockHost({ ...this.deps, session: this.deps.openSession() }, path, view.containerEl);
		const placed: Placed = { host, path, stopWatch: () => undefined, content: null };
		this.blocks.set(view, placed);
		placed.stopWatch = host.measure.watchPage(view.containerEl, () => host.node, () => {
			if (this.blocks.get(view) === placed) this.place(view, placed);
		});
		return placed;
	}

	/**
	 * The block stands where Obsidian puts its backlinks in the document: in Live Preview right after the editor's
	 * content, in Reading view first in the note's footer. A block not yet on the page is drawn once it is.
	 */
	private place(view: NoteView, placed: Placed): void {
		const reading = view.getMode() === "preview";
		const footer = view.previewMode?.renderer?.footer?.el ?? null;
		const content = view.editor?.cm?.contentDOM.parentElement ?? null;
		const parent = reading ? footer : (content?.parentElement ?? null);
		const before = reading ? (footer?.firstChild ?? null) : (content?.nextSibling ?? null);
		if (!parent) return;
		const node = placed.host.node;
		const first = !node.isConnected;
		placed.host.mountNode.place(parent, before);
		const next = reading ? null : content;
		if (placed.content !== next) {
			if (placed.content) Motion.put(placed.content, "flex-grow", "");
			if (next) Motion.put(next, "flex-grow", "0");
			placed.content = next;
		}
		const cm = view.editor?.cm?.contentDOM ?? null;
		Motion.put(node, BLOCK_LIFT, reading || !cm ? "" : Motion.inline(cm, "padding-bottom"));
		if (first) placed.host.mount();
	}

	private drop(view: NoteView, placed: Placed): void {
		placed.stopWatch();
		if (placed.content) Motion.put(placed.content, "flex-grow", "");
		placed.host.dispose();
		this.blocks.delete(view);
	}

	dispose(): void {
		this.disposed = true;
		for (const [view, placed] of [...this.blocks]) this.drop(view, placed);
		this.refs.splice(0).forEach((ref) => this.places.offref(ref));
		this.stopRuntime?.();
		this.session.teardown();
	}
}

/** Obsidian's workspace and vault as the blocks reach them. */
export function obsidianPlaces(app: App, isNoteView: (view: unknown) => view is NoteView): NotePlaces {
	return {
		views: () => {
			const views: NoteView[] = [];
			app.workspace.iterateAllLeaves((leaf) => {
				if (isNoteView(leaf.view)) views.push(leaf.view);
			});
			return views;
		},
		on: (name, callback) => app.workspace.on(name as "layout-change", callback),
		onRename: (callback) => app.vault.on("rename", callback),
		offref: (ref) => {
			app.workspace.offref(ref);
			app.vault.offref(ref);
		},
	};
}
