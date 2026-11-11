import { getAllTags, type App, type EventRef, TFile } from "obsidian";
import type { ProjectNote } from "../../core/application/contracts";
import type { Projects } from "../../core/application/ports";
import { type NoteTags, projectNotesOf } from "../../core/application/projects";

/** The vault's notes with their tags, and when any of them changes. */
export interface NoteIndex {
	notes(): readonly NoteTags[];
	/** Every note's tags have been read (Obsidian's metadata cache resolved): `notes` is complete. */
	ready(): boolean;
	/** A note's tags, name or place changed, or a note came or went. Returns the unsubscribe. */
	onChange(listener: () => void): () => void;
}

/**
 * The notes with the project tag, read from the vault's notes and kept until one of them or the tag changes. Listeners
 * hear only a change of the list itself: an edit of a note's text that keeps its tags tells nobody. Until the index has
 * read every note (`ready`), a list is read afresh each time and never kept: an incomplete first answer must not stay,
 * and the listeners hear the complete one once the index is ready.
 */
export class VaultProjects implements Projects {
	private cached: readonly ProjectNote[] | null = null;
	private shown = "";
	/** The tag the list was read for: another change of the settings reads nothing. */
	private readFor = "";
	private readonly listeners = new Set<() => void>();
	private stop: (() => void) | null = null;

	constructor(
		private readonly index: NoteIndex,
		private readonly tag: () => string,
		/** The tag in the settings changed. Returns the unsubscribe. */
		private readonly onTagChange: (listener: () => void) => () => void,
	) {}

	ready(): boolean {
		return this.index.ready();
	}

	list(): readonly ProjectNote[] {
		if (this.cached) return this.cached;
		this.readFor = this.tag();
		const list = projectNotesOf(this.index.notes(), this.readFor);
		if (!this.index.ready()) return list;
		this.cached = list;
		this.shown = JSON.stringify(list);
		return list;
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		if (!this.stop) {
			const offNotes = this.index.onChange(() => this.recheck());
			const offTag = this.onTagChange(() => {
				if (this.tag() !== this.readFor) this.recheck();
			});
			this.stop = () => {
				offNotes();
				offTag();
			};
		}
		return () => {
			this.listeners.delete(listener);
			if (this.listeners.size > 0) return;
			this.stop?.();
			this.stop = null;
		};
	}

	private recheck(): void {
		if (!this.index.ready()) return;
		const before = this.cached ? this.shown : null;
		this.cached = null;
		this.list();
		if (before !== null && before === this.shown) return;
		for (const listener of [...this.listeners]) listener();
	}
}

/** How long the index waits after a change of the vault's notes before it tells: a rename fires several events at once. */
const SETTLE_MS = 300;

/** A note as the index keeps it: its name and tags; its link is worked out only when asked, for a project note. */
interface KeptNote {
	readonly file: TFile;
	readonly tags: readonly string[];
}

/**
 * The vault's markdown notes and their tags from Obsidian's metadata cache (properties and text), read once and then kept
 * note by note: an edited note is read again alone, and only a change of its tags, a new, renamed or deleted note tells
 * the listeners. A note's shortest link from the tasks file is worked out only for the notes asked for it.
 */
export class ObsidianNoteIndex implements NoteIndex {
	private kept: Map<string, KeptNote> | null = null;
	/** Obsidian has read every note's metadata once: before that, the notes are read afresh. */
	private resolved = false;

	constructor(
		private readonly app: App,
		private readonly tasksFile: () => string,
	) {}

	/**
	 * Obsidian has read every note's metadata: its first `resolved`, its internal `initialized` flag where it has one, or,
	 * not leaning on that flag, every markdown note already holding its cache (a plugin loaded or updated through BRAT into
	 * a vault Obsidian has indexed hears no `resolved` until a file changes). Once ready, it stays so.
	 */
	ready(): boolean {
		if (this.resolved) return true;
		const { metadataCache, vault } = this.app;
		const indexed = (metadataCache as { initialized?: boolean }).initialized === true || vault.getMarkdownFiles().every((file) => metadataCache.getFileCache(file) !== null);
		if (!indexed) return false;
		this.resolved = true;
		this.kept = null;
		return true;
	}

	notes(): readonly NoteTags[] {
		const { metadataCache } = this.app;
		const from = this.tasksFile();
		return [...this.all().values()].map(({ file, tags }) => ({
			name: file.basename,
			path: file.path,
			tags,
			get link() {
				return metadataCache.fileToLinktext(file, from, true);
			},
		}));
	}

	private all(): Map<string, KeptNote> {
		if (!this.kept) this.kept = new Map(this.app.vault.getMarkdownFiles().map((file) => [file.path, this.read(file)]));
		return this.kept;
	}

	private read(file: TFile): KeptNote {
		const cache = this.app.metadataCache.getFileCache(file);
		return { file, tags: cache ? (getAllTags(cache) ?? []) : [] };
	}

	/** A note read again: true when its tags changed, or it is new. */
	private reread(file: TFile): boolean {
		if (file.extension !== "md") return false;
		const notes = this.all();
		const before = notes.get(file.path);
		const now = this.read(file);
		notes.set(file.path, now);
		return !before || before.tags.join("\n") !== now.tags.join("\n");
	}

	onChange(listener: () => void): () => void {
		const { metadataCache, vault } = this.app;
		let timer = 0;
		const later = () => {
			window.clearTimeout(timer);
			timer = window.setTimeout(listener, SETTLE_MS);
		};
		const refs: { ref: EventRef; off: (ref: EventRef) => void }[] = [
			{ ref: metadataCache.on("changed", (file) => this.reread(file) && later()), off: (ref) => metadataCache.offref(ref) },
			{
				ref: metadataCache.on("resolved", () => {
					if (this.resolved) return;
					this.resolved = true;
					this.kept = null;
					later();
				}),
				off: (ref) => metadataCache.offref(ref),
			},
			{
				ref: vault.on("rename", (file, oldPath) => {
					this.kept?.delete(oldPath);
					if (file instanceof TFile) this.reread(file);
					later();
				}),
				off: (ref) => vault.offref(ref),
			},
			{
				ref: vault.on("delete", (file) => {
					if (this.kept?.delete(file.path)) later();
				}),
				off: (ref) => vault.offref(ref),
			},
		];
		return () => {
			window.clearTimeout(timer);
			refs.forEach(({ ref, off }) => off(ref));
		};
	}
}
