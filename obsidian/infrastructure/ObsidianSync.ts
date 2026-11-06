import type { SyncControl, SyncSnapshot, SyncStatus } from "./SyncWait";

/**
 * Obsidian Sync's core plugin as Obsidian 1.x builds it (read from the app's bundle): not a public API, so every field is
 * checked before use. Without `getStatus`, `requestSync`, `on` and `offref` Sync is off; `syncing` and `ready` only refine.
 */
interface SyncInstance {
	getStatus(): string;
	requestSync(): unknown;
	on(name: "status-change", callback: () => void): unknown;
	offref(ref: unknown): void;
	readonly syncing?: unknown;
	readonly ready?: unknown;
}

const OFF: SyncSnapshot = { status: "off", running: false, ready: false };
const PASSED: ReadonlySet<string> = new Set<SyncStatus>(["paused", "error", "syncing", "synced"]);

export class ObsidianSync implements SyncControl {
	/** `app` is Obsidian's App; Sync hangs off its undocumented `internalPlugins`. */
	constructor(private readonly app: unknown) {}

	snapshot(): SyncSnapshot {
		const sync = this.instance();
		if (!sync) return OFF;
		const raw = safely(() => sync.getStatus(), "");
		if (!PASSED.has(raw)) return OFF;
		return {
			status: raw as SyncStatus,
			running: typeof sync.syncing === "boolean" ? sync.syncing : raw === "syncing",
			ready: typeof sync.ready === "boolean" ? sync.ready : true,
		};
	}

	request(): void {
		const sync = this.instance();
		if (!sync) return;
		safely(() => void Promise.resolve(sync.requestSync()).catch(() => undefined), undefined);
	}

	onChange(listener: () => void): () => void {
		const sync = this.instance();
		if (!sync) return () => undefined;
		const ref = safely(() => sync.on("status-change", listener), null);
		return () => safely(() => sync.offref(ref), undefined);
	}

	private instance(): SyncInstance | null {
		const plugins = field(this.app, "internalPlugins");
		const getPluginById = field(plugins, "getPluginById");
		if (typeof getPluginById !== "function") return null;
		const plugin: unknown = safely(() => getPluginById.call(plugins, "sync"), null);
		if (field(plugin, "enabled") !== true) return null;
		const instance = field(plugin, "instance");
		return isSyncInstance(instance) ? instance : null;
	}
}

function field(target: unknown, name: string): unknown {
	return typeof target === "object" && target !== null ? (target as Record<string, unknown>)[name] : undefined;
}

function isSyncInstance(value: unknown): value is SyncInstance {
	return ["getStatus", "requestSync", "on", "offref"].every((name) => typeof field(value, name) === "function");
}

function safely<T>(read: () => T, fallback: T): T {
	try {
		return read();
	} catch {
		return fallback;
	}
}
