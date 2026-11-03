import type { SettingsStore } from "../application/ports";
import { type DeviceState, partition, type SharedSettings, settingsFrom, sharedOf, type TaskCalendarSettings } from "../settings";

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
export class PluginSettings implements SettingsStore {
	private file: TaskCalendarSettings = settingsFrom(null);
	private readonly pending: Partial<SharedSettings>[] = [];
	private device: Partial<DeviceState> = {};
	private current: TaskCalendarSettings = settingsFrom(null);
	private queue: Promise<void> = Promise.resolve();
	private readonly listeners = new Set<() => void>();

	constructor(
		private readonly host: SettingsPersistence,
		private readonly path: string,
	) {}

	/** The vault path of data.json: a `raw` event for it means the file may have changed. */
	owns(path: string): boolean {
		return path === this.path;
	}

	/** The first read, at load: always tells the listeners. */
	async load(): Promise<void> {
		await this.enqueue(async () => {
			this.file = settingsFrom(await this.host.loadData());
			this.device = this.savedDevice();
			this.recompute();
			this.emit();
		});
	}

	/** The file read afresh (Sync, coming back to the front): tells the listeners only when get() changed. */
	async reload(): Promise<void> {
		await this.enqueue(async () => {
			const before = JSON.stringify(this.current);
			this.file = settingsFrom(await this.host.loadData());
			this.device = this.savedDevice();
			this.recompute();
			if (JSON.stringify(this.current) !== before) this.emit();
		});
	}

	get(): TaskCalendarSettings {
		return this.current;
	}

	async update(patch: Partial<TaskCalendarSettings>): Promise<void> {
		const { device, shared } = partition(patch);
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

	private async persist(shared: Partial<SharedSettings>): Promise<void> {
		let fresh: TaskCalendarSettings | null = null;
		try {
			fresh = settingsFrom(await this.host.loadData());
			const next = settingsFrom({ ...fresh, ...shared });
			if (JSON.stringify(sharedOf(next)) !== JSON.stringify(sharedOf(fresh))) await this.host.saveData(sharedOf(next));
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
		const patched = Object.assign({}, this.file, ...this.pending) as TaskCalendarSettings;
		this.current = { ...settingsFrom(patched), ...this.device };
	}

	private savedDevice(): Partial<DeviceState> {
		const saved = this.host.loadLocalStorage(DEVICE_STATE_KEY) as Partial<DeviceState> | null;
		return saved ?? {};
	}

	private emit(): void {
		for (const listener of this.listeners) listener();
	}
}
