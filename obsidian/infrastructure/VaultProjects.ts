import { getAllTags, type App, type EventRef, type TFile } from "obsidian";
import type { ProjectNote } from "../../core/application/contracts";
import type { Projects } from "../../core/application/ports";
import { type NoteTags, projectNotesOf } from "../../core/application/projects";

/** The vault's notes with their tags, and when any of them changes. */
export interface NoteIndex {
	notes(): readonly NoteTags[];
	/** A note's tags, name or place changed, or a note came or went. Returns the unsubscribe. */
	onChange(listener: () => void): () => void;
}

/**
 * The notes with the project tag, read from the vault's notes and kept until one of them or the tag changes. Listeners
 * hear only a change of the list itself: an edit of a note's text that keeps its tags tells nobody.
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

	list(): readonly ProjectNote[] {
		if (!this.cached) {
			this.readFor = this.tag();
			this.cached = projectNotesOf(this.index.notes(), this.readFor);
			this.shown = JSON.stringify(this.cached);
		}
		return this.cached;
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
		const before = this.cached ? this.shown : null;
		this.cached = null;
		this.list();
		if (before !== null && before === this.shown) return;
		for (const listener of [...this.listeners]) listener();
	}
}

/** How long the index waits after a change of the vault's notes before it reads them again: typing in a note fires on every pause. */
const SETTLE_MS = 300;

/** The vault's markdown notes, their tags from Obsidian's metadata cache (properties and text), and their shortest links from the tasks file. */
export class ObsidianNoteIndex implements NoteIndex {
	constructor(
		private readonly app: App,
		private readonly tasksFile: () => string,
	) {}

	notes(): readonly NoteTags[] {
		const { metadataCache, vault } = this.app;
		const from = this.tasksFile();
		return vault.getMarkdownFiles().map((file: TFile) => {
			const cache = metadataCache.getFileCache(file);
			return { name: file.basename, path: file.path, link: metadataCache.fileToLinktext(file, from, true), tags: cache ? (getAllTags(cache) ?? []) : [] };
		});
	}

	onChange(listener: () => void): () => void {
		const { metadataCache, vault } = this.app;
		let timer = 0;
		const later = () => {
			window.clearTimeout(timer);
			timer = window.setTimeout(listener, SETTLE_MS);
		};
		const refs: { ref: EventRef; off: (ref: EventRef) => void }[] = [
			{ ref: metadataCache.on("changed", later), off: (ref) => metadataCache.offref(ref) },
			{ ref: metadataCache.on("resolved", later), off: (ref) => metadataCache.offref(ref) },
			{ ref: vault.on("rename", later), off: (ref) => vault.offref(ref) },
			{ ref: vault.on("delete", later), off: (ref) => vault.offref(ref) },
		];
		return () => {
			window.clearTimeout(timer);
			refs.forEach(({ ref, off }) => off(ref));
		};
	}
}
