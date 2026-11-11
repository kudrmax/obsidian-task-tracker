import type { ProjectsScreenState } from "../../core/application/contracts";
import type { ProjectsScreenStore } from "../../core/application/ports";

/** Where the device keeps what it is asked to: Obsidian's local storage of the vault, never synced. */
export interface LocalStorage {
	loadLocalStorage(key: string): unknown;
	saveLocalStorage(key: string, data: unknown): void;
}

export const PROJECTS_SCREEN_KEY = "task-calendar:projects-screen";

/** The Projects screen as this device left it (the node chosen, the segment, the folded branches), in Obsidian's local storage: never in data.json. */
export class LocalProjectsScreenStore implements ProjectsScreenStore {
	private state: ProjectsScreenState;

	constructor(private readonly storage: LocalStorage) {
		this.state = readState(storage.loadLocalStorage(PROJECTS_SCREEN_KEY));
	}

	get(): ProjectsScreenState {
		return this.state;
	}

	set(state: ProjectsScreenState): void {
		this.state = state;
		this.storage.saveLocalStorage(PROJECTS_SCREEN_KEY, JSON.stringify(state));
	}
}

function readState(saved: unknown): ProjectsScreenState {
	if (typeof saved !== "string") return {};
	try {
		const parsed: unknown = JSON.parse(saved);
		return parsed !== null && typeof parsed === "object" ? (parsed as ProjectsScreenState) : {};
	} catch {
		return {};
	}
}
