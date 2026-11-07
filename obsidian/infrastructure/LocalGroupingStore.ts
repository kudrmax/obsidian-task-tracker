import type { GroupingState } from "../../core/application/contracts";
import type { GroupingStore } from "../../core/application/ports";

/** Where the device keeps what it is asked to: Obsidian's local storage of the vault, never synced. */
export interface LocalStorage {
	loadLocalStorage(key: string): unknown;
	saveLocalStorage(key: string, data: unknown): void;
}

export const GROUPING_KEY = "task-calendar:grouping";

/** How this device groups its lists by project, kept in Obsidian's local storage: per device, never in data.json. */
export class LocalGroupingStore implements GroupingStore {
	private state: GroupingState;

	constructor(private readonly storage: LocalStorage) {
		this.state = readState(storage.loadLocalStorage(GROUPING_KEY));
	}

	get(): GroupingState {
		return this.state;
	}

	set(state: GroupingState): void {
		this.state = state;
		this.storage.saveLocalStorage(GROUPING_KEY, JSON.stringify(state));
	}
}

function readState(saved: unknown): GroupingState {
	if (typeof saved !== "string") return {};
	try {
		const parsed: unknown = JSON.parse(saved);
		return parsed !== null && typeof parsed === "object" ? (parsed as GroupingState) : {};
	} catch {
		return {};
	}
}
