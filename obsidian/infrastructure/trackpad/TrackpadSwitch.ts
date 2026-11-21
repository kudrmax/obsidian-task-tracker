/** Obsidian's storage of this device (`App.loadLocalStorage`): never synced, never the vault's. */
export interface DeviceStorage {
	loadLocalStorage(key: string): unknown;
	saveLocalStorage(key: string, data: unknown): void;
}

const KEY = "task-calendar:trackpad";

interface Kept {
	readonly on: boolean;
	readonly skipped: string | null;
}

/**
 * «Trackpad through macOS», a setting of this Mac alone: on by default; off, the ribbon reads the trackpad by its
 * scrolling (`WheelFollow`). It also keeps the build the crash guard set aside, until a new build comes or the switch is
 * turned on again. Read when the plugin loads.
 */
export class TrackpadSwitch {
	constructor(private readonly storage: DeviceStorage) {}

	get on(): boolean {
		return this.kept().on;
	}

	/** The build whose loading never finished in an Obsidian that then quit: skipped from then on. */
	get skipped(): string | null {
		return this.kept().skipped;
	}

	set(on: boolean): void {
		this.save({ on, skipped: on ? null : this.kept().skipped });
	}

	skip(build: string): void {
		this.save({ ...this.kept(), skipped: build });
	}

	private kept(): Kept {
		const saved = this.storage.loadLocalStorage(KEY) as Partial<Kept> | null;
		return { on: saved?.on !== false, skipped: typeof saved?.skipped === "string" ? saved.skipped : null };
	}

	private save(kept: Kept): void {
		this.storage.saveLocalStorage(KEY, kept);
	}
}
