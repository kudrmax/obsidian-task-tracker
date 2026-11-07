import type { NotePlace, NotePlaces } from "./viewSettings";

const PLACES_KEY = "task-calendar:note-places";

/** Obsidian's local storage of the vault: kept on this device only, never synced. */
export interface DeviceStorage {
	loadLocalStorage(key: string): unknown;
	saveLocalStorage(key: string, data: unknown): void;
}

/** Whether `path` is the note, or lies in the folder, at `at`. */
function under(path: string, at: string): boolean {
	return path === at || path.startsWith(`${at}/`);
}

/**
 * The blocks' places kept per note on this device. A note renamed or moved (alone or with its folder) takes its place
 * along; a deleted one leaves none behind.
 */
export class LocalNotePlaces implements NotePlaces {
	constructor(private readonly storage: DeviceStorage) {}

	get(path: string): NotePlace {
		return this.all()[path] ?? {};
	}

	set(path: string, place: NotePlace): void {
		this.save({ ...this.all(), [path]: place });
	}

	move(from: string, to: string): void {
		const all = this.all();
		const moved = Object.entries(all).filter(([path]) => under(path, from));
		if (moved.length === 0) return;
		for (const [path] of moved) delete all[path];
		for (const [path, place] of moved) all[to + path.slice(from.length)] = place;
		this.save(all);
	}

	forget(at: string): void {
		const all = this.all();
		const gone = Object.keys(all).filter((path) => under(path, at));
		if (gone.length === 0) return;
		for (const path of gone) delete all[path];
		this.save(all);
	}

	private save(all: Record<string, NotePlace>): void {
		this.storage.saveLocalStorage(PLACES_KEY, JSON.stringify(all));
	}

	private all(): Record<string, NotePlace> {
		const saved: unknown = this.storage.loadLocalStorage(PLACES_KEY);
		if (typeof saved !== "string") return {};
		try {
			const parsed: unknown = JSON.parse(saved);
			return parsed !== null && typeof parsed === "object" ? { ...(parsed as Record<string, NotePlace>) } : {};
		} catch {
			return {};
		}
	}
}
