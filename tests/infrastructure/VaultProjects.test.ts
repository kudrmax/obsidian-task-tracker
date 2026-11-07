import { describe, expect, it } from "vitest";
import type { NoteTags } from "../../core/application/projects";
import { type NoteIndex, VaultProjects } from "../../obsidian/infrastructure/VaultProjects";
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
