/** What the settings object is: its defaults over what was saved, and which of its keys belong to the device. */
export interface SettingsSchema<T extends object> {
	from(saved: unknown): T;
	readonly device: readonly (keyof T & string)[];
}

export const DEVICE_STATE_KEY = "task-calendar:device";

/** What the plugin offers to keep the settings: the synced file and the device's own storage. */
export interface SettingsPersistence {
	loadData(): Promise<unknown>;
	saveData(data: unknown): Promise<void>;
	loadLocalStorage(key: string): unknown;
	saveLocalStorage(key: string, data: unknown): void;
}

/**
 * The settings: the synced file (data.json) for what is the vault's, and the device's own storage for the divider's
 * place, the column shown and the zoom. The device's part never touches the file. A shared patch counts in get() at
 * once and is written over the file's freshest copy, one write after another, so a token Sync just brought is never
 * lost. A read of the file that changes nothing (our own write coming back, the same file from Sync) tells nobody.
 */
export class PluginSettings<T extends object> {
	private file: T;
	private readonly pending: Partial<T>[] = [];
	private device: Partial<T> = {};
	private current: T;
	private queue: Promise<void> = Promise.resolve();
	private readonly listeners = new Set<() => void>();

	constructor(
		private readonly host: SettingsPersistence,
		private readonly path: string,
		private readonly schema: SettingsSchema<T>,
	) {
		this.file = schema.from(null);
		this.current = schema.from(null);
	}

	/** The vault path of data.json: a `raw` event for it means the file may have changed. */
	owns(path: string): boolean {
		return path === this.path;
	}

	/** The first read, at load: always tells the listeners. */
	async load(): Promise<void> {
		await this.enqueue(async () => {
			this.file = this.schema.from(await this.host.loadData());
			this.device = this.savedDevice();
			this.recompute();
			this.emit();
		});
	}

	/** The file read afresh (Sync, coming back to the front): tells the listeners only when get() changed. */
	async reload(): Promise<void> {
		await this.enqueue(async () => {
			const before = JSON.stringify(this.current);
			this.file = this.schema.from(await this.host.loadData());
			this.device = this.savedDevice();
			this.recompute();
			if (JSON.stringify(this.current) !== before) this.emit();
		});
	}

	get(): T {
		return this.current;
	}

	async update(patch: Partial<T>): Promise<void> {
		const { device, shared } = this.partition(patch);
		if (Object.keys(device).length) {
			this.device = { ...this.device, ...device };
			this.host.saveLocalStorage(DEVICE_STATE_KEY, this.device);
		}
		if (!Object.keys(shared).length) {
			this.recompute();
			this.emit();
			return;
		}
		this.pending.push(shared);
		this.recompute();
		await this.enqueue(() => this.persist(shared));
	}

	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private async persist(shared: Partial<T>): Promise<void> {
		let fresh: T | null = null;
		try {
			fresh = this.schema.from(await this.host.loadData());
			const next = this.schema.from({ ...fresh, ...shared });
			if (JSON.stringify(this.fileOf(next)) !== JSON.stringify(this.fileOf(fresh))) await this.host.saveData(this.fileOf(next));
			this.file = next;
		} catch (e) {
			if (fresh) this.file = fresh;
			throw e;
		} finally {
			this.pending.splice(this.pending.indexOf(shared), 1);
			this.recompute();
			this.emit();
		}
	}

	/** Runs `step` after every step before it; a step that failed rejects its own caller and leaves the queue going. */
	private enqueue(step: () => Promise<void>): Promise<void> {
		const run = this.queue.then(step);
		this.queue = run.catch(() => undefined);
		return run;
	}

	private recompute(): void {
		const patched = Object.assign({}, this.file, ...this.pending) as T;
		this.current = { ...this.schema.from(patched), ...this.device };
	}

	private savedDevice(): Partial<T> {
		const saved = this.host.loadLocalStorage(DEVICE_STATE_KEY) as Partial<T> | null;
		return saved ?? {};
	}

	/** A patch split into the part that goes to the device and the part that goes to the synced file. */
	private partition(patch: Partial<T>): { device: Partial<T>; shared: Partial<T> } {
		const device: Record<string, unknown> = {};
		const shared: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(patch)) (this.isDevice(key) ? device : shared)[key] = value;
		return { device: device as Partial<T>, shared: shared as Partial<T> };
	}

	/** The settings without the device's part: what the synced file holds. */
	private fileOf(settings: T): Partial<T> {
		return Object.fromEntries(Object.entries(settings).filter(([key]) => !this.isDevice(key))) as Partial<T>;
	}

	private isDevice(key: string): boolean {
		return (this.schema.device as readonly string[]).includes(key);
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}
}
