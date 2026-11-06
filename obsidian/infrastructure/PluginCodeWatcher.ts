/** What the watcher needs of the plugin's folder and of Obsidian. */
export interface PluginCodeHost {
	/** The file's size and time of change, or null when there is none. */
	stat(path: string): Promise<{ readonly size: number; readonly mtime: number } | null>;
	/** Obsidian loads the plugin again from its folder: the running code is unloaded first. */
	reload(): Promise<void>;
	setTimeout(run: () => void, ms: number): number;
	clearTimeout(id: number): void;
}

/** Sync writes a release's files one by one; the plugin waits for them all before it loads again. */
export const SETTLE_MS = 3000;

/**
 * Keeps the running plugin the one in its folder. Sync brings a new release onto the phone, but Obsidian there goes on
 * running the code it loaded until it is restarted, and old code that doesn't know a newer marker spoils the lines it
 * writes. The code on disk is told by `main.js`'s size and time of change, read when the plugin loads.
 */
export class PluginCodeWatcher {
	private loaded: string | null = null;
	private timer: number | null = null;
	private checking: Promise<void> | null = null;

	constructor(
		private readonly host: PluginCodeHost,
		private readonly pluginDir: string,
	) {}

	private get code(): string {
		return `${this.pluginDir}/main.js`;
	}

	/** The code this plugin runs: read once, as it loads. */
	async start(): Promise<void> {
		this.loaded = await this.stamp();
	}

	/** A file of the plugin's folder changed: whether its code did is checked once Sync is done writing. */
	changed(path: string): void {
		if (!path.startsWith(`${this.pluginDir}/`) || path.endsWith("/data.json")) return;
		this.cancel();
		this.timer = this.host.setTimeout(() => {
			this.timer = null;
			void this.check();
		}, SETTLE_MS);
	}

	/** Loads the plugin again when the code in its folder is not the code it runs; checks asked meanwhile wait for this one. */
	check(): Promise<void> {
		this.checking ??= this.compare().finally(() => (this.checking = null));
		return this.checking;
	}

	private async compare(): Promise<void> {
		if (this.loaded === null) return;
		const now = await this.stamp();
		if (now === null || now === this.loaded) return;
		this.loaded = null;
		this.cancel();
		await this.host.reload();
	}

	stop(): void {
		this.cancel();
		this.loaded = null;
	}

	private cancel(): void {
		if (this.timer !== null) this.host.clearTimeout(this.timer);
		this.timer = null;
	}

	private async stamp(): Promise<string | null> {
		const stat = await this.host.stat(this.code);
		return stat === null ? null : `${stat.size}:${stat.mtime}`;
	}
}
