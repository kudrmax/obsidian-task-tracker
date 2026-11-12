// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import type { NoteTags } from "../../core/application/projects";
import { type NoteIndex, ObsidianNoteIndex, VaultProjects } from "../../obsidian/infrastructure/VaultProjects";
import { PROJECTS_SCREEN_KEY, LocalProjectsScreenStore } from "../../obsidian/infrastructure/LocalProjectsScreenStore";

class FakeIndex implements NoteIndex {
	list: NoteTags[] = [];
	resolved = true;

	ready(): boolean {
		return this.resolved;
	}
	private readonly listeners = new Set<() => void>();
	reads = 0;

	notes(): readonly NoteTags[] {
		this.reads++;
		return this.list;
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	change(): void {
		for (const listener of this.listeners) listener();
	}

	get listening(): number {
		return this.listeners.size;
	}
}

const note = (name: string, tags: string[]): NoteTags => ({ name, path: `${name}.md`, link: name, tags });

function setup() {
	const index = new FakeIndex();
	let tag = "#project";
	const tagListeners = new Set<() => void>();
	const projects = new VaultProjects(index, () => tag, (listener) => {
		tagListeners.add(listener);
		return () => tagListeners.delete(listener);
	});
	return {
		index,
		projects,
		setTag: (next: string) => {
			tag = next;
			tagListeners.forEach((l) => l());
		},
	};
}

describe("VaultProjects", () => {
	it("is ready once the index has read every note, keeps no list read before, and tells its listeners then", () => {
		const { index, projects } = setup();
		index.resolved = false;
		index.list = [note("А", ["#project"])];
		const heard = vi.fn();
		projects.onChange(heard);
		expect(projects.ready()).toBe(false);
		expect(projects.list().map((p) => p.name)).toEqual(["А"]);
		index.list = [note("А", ["#project"]), note("Б", ["#project"])];
		expect(projects.list().map((p) => p.name)).toEqual(["А", "Б"]);
		index.resolved = true;
		index.change();
		expect(projects.ready()).toBe(true);
		expect(heard).toHaveBeenCalledTimes(1);
		const reads = index.reads;
		projects.list();
		projects.list();
		expect(index.reads).toBe(reads);
	});

	it("lists the notes with exactly the project tag, by name", () => {
		const { index, projects } = setup();
		index.list = [note("Б", ["#project"]), note("А", ["#Project"]), note("В", ["#project/sub"]), note("Г", [])];
		expect(projects.list().map((p) => p.name)).toEqual(["А", "Б"]);
	});

	it("reads the vault once until it changes", () => {
		const { index, projects } = setup();
		projects.list();
		projects.list();
		expect(index.reads).toBe(1);
	});

	it("tells its listeners only when the list changes", () => {
		const { index, projects } = setup();
		index.list = [note("А", ["#project"])];
		projects.list();
		let heard = 0;
		const off = projects.onChange(() => heard++);
		index.change();
		expect(heard).toBe(0);
		index.list = [note("А", ["#project"]), note("Б", ["#project"])];
		index.change();
		expect(heard).toBe(1);
		off();
		expect(index.listening).toBe(0);
	});

	it("follows another tag in the settings", () => {
		const { index, projects, setTag } = setup();
		index.list = [note("А", ["#project"]), note("Б", ["#goal"])];
		let heard = 0;
		projects.onChange(() => heard++);
		expect(projects.list().map((p) => p.name)).toEqual(["А"]);
		setTag("#goal");
		expect(heard).toBe(1);
		expect(projects.list().map((p) => p.name)).toEqual(["Б"]);
	});
});

describe("LocalProjectsScreenStore", () => {
	it("keeps the Projects screen in the device's storage and reads it back", () => {
		const saved = new Map<string, unknown>();
		const storage = { loadLocalStorage: (key: string) => saved.get(key) ?? null, saveLocalStorage: (key: string, data: unknown) => void saved.set(key, data) };
		const store = new LocalProjectsScreenStore(storage);
		expect(store.get()).toEqual({});
		store.set({ selected: "project:Дружба", view: "rows", folded: ["project:Спорт"], doneOpen: true });
		expect(new LocalProjectsScreenStore(storage).get()).toEqual({ selected: "project:Дружба", view: "rows", folded: ["project:Спорт"], doneOpen: true });
		expect(typeof saved.get(PROJECTS_SCREEN_KEY)).toBe("string");
	});

	it("starts afresh from a spoiled entry", () => {
		const store = new LocalProjectsScreenStore({ loadLocalStorage: () => "{", saveLocalStorage: () => undefined });
		expect(store.get()).toEqual({});
	});
});

describe("ObsidianNoteIndex", () => {
	type Handler = (...args: unknown[]) => void;
	function fakeApp() {
		const file = (path: string, basename: string): TFile => Object.assign(Object.create(TFile.prototype) as TFile, { path, basename, extension: "md" });
		const files = [file("A.md", "A"), file("B.md", "B")];
		const caches = new Map<string, { tags?: { tag: string }[] }>([["A.md", { tags: [{ tag: "#project" }] }], ["B.md", {}]]);
		const handlers = new Map<string, Handler>();
		let links = 0;
		const on = (name: string, fn: Handler) => (handlers.set(name, fn), name);
		const app = {
			vault: { getMarkdownFiles: () => files, on, offref: () => undefined },
			metadataCache: { getFileCache: (f: TFile) => caches.get(f.path) ?? null, fileToLinktext: (f: TFile) => (links++, f.basename), on, offref: () => undefined },
		};
		return { app: app as never, files, caches, fire: (name: string, ...args: unknown[]) => handlers.get(name)?.(...args), links: () => links };
	}

	it("is ready once Obsidian has read the vault's notes: at once when it had, else at its first resolved", () => {
		const loaded = fakeApp();
		(loaded.app as { metadataCache: { initialized?: boolean } }).metadataCache.initialized = true;
		expect(new ObsidianNoteIndex(loaded.app, () => "TODOs Tasks.md").ready()).toBe(true);
		const starting = fakeApp();
		starting.caches.delete("B.md");
		const index = new ObsidianNoteIndex(starting.app, () => "TODOs Tasks.md");
		const heard = vi.fn();
		index.onChange(heard);
		expect(index.ready()).toBe(false);
		vi.useFakeTimers();
		starting.fire("resolved");
		vi.runAllTimers();
		vi.useRealTimers();
		expect(index.ready()).toBe(true);
		expect(heard).toHaveBeenCalledTimes(1);
	});

	it("without Obsidian's internal flag, is ready at once when every note already has its metadata: a plugin loaded or updated into an indexed vault", () => {
		const indexed = fakeApp();
		expect((indexed.app as { metadataCache: { initialized?: boolean } }).metadataCache.initialized).toBeUndefined();
		expect(new ObsidianNoteIndex(indexed.app, () => "TODOs Tasks.md").ready()).toBe(true);
		const reading = fakeApp();
		reading.caches.delete("B.md");
		const index = new ObsidianNoteIndex(reading.app, () => "TODOs Tasks.md");
		expect(index.ready()).toBe(false);
		reading.caches.set("B.md", {});
		expect(index.ready()).toBe(true);
	});

	it("works out a note's link only when asked for it", () => {
		const { app, links } = fakeApp();
		const notes = new ObsidianNoteIndex(app, () => "TODOs Tasks.md").notes();
		expect(notes.map((n) => n.tags)).toEqual([["#project"], []]);
		expect(links()).toBe(0);
		expect(notes[0].link).toBe("A");
		expect(links()).toBe(1);
	});

	it("tells of an edited note only when its tags changed", () => {
		vi.useFakeTimers();
		const { app, files, caches, fire } = fakeApp();
		const index = new ObsidianNoteIndex(app, () => "");
		index.notes();
		let heard = 0;
		index.onChange(() => heard++);
		fire("changed", files[1]);
		vi.advanceTimersByTime(1000);
		expect(heard).toBe(0);
		caches.set("B.md", { tags: [{ tag: "#project" }] });
		fire("changed", files[1]);
		vi.advanceTimersByTime(1000);
		expect(heard).toBe(1);
		expect(index.notes().map((n) => n.tags)).toEqual([["#project"], ["#project"]]);
		vi.useRealTimers();
	});
});
