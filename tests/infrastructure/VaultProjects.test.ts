// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { TFile } from "obsidian";
import type { NoteTags } from "../../core/application/projects";
import { type NoteIndex, ObsidianNoteIndex, VaultProjects } from "../../obsidian/infrastructure/VaultProjects";
import { GROUPING_KEY, LocalGroupingStore } from "../../obsidian/infrastructure/LocalGroupingStore";

class FakeIndex implements NoteIndex {
	list: NoteTags[] = [];
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

describe("LocalGroupingStore", () => {
	it("keeps the grouping in the device's storage and reads it back", () => {
		const saved = new Map<string, unknown>();
		const storage = { loadLocalStorage: (key: string) => saved.get(key) ?? null, saveLocalStorage: (key: string, data: unknown) => void saved.set(key, data) };
		const store = new LocalGroupingStore(storage);
		expect(store.get()).toEqual({});
		store.set({ on: { soon: true }, folded: { backlog: ["окружение"] } });
		expect(new LocalGroupingStore(storage).get()).toEqual({ on: { soon: true }, folded: { backlog: ["окружение"] } });
		expect(typeof saved.get(GROUPING_KEY)).toBe("string");
	});

	it("starts afresh from a spoiled entry", () => {
		const store = new LocalGroupingStore({ loadLocalStorage: () => "{", saveLocalStorage: () => undefined });
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
