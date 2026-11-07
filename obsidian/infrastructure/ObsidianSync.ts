import type { SyncControl, SyncSnapshot, SyncStatus } from "./SyncWait";

/**
 * Obsidian Sync's core plugin as Obsidian 1.x builds it (read from the app's bundle): not a public API, so every field is
 * checked before use. Without `getStatus`, `requestSync`, `on` and `offref` Sync is off; the rest only refine.
 */
interface SyncInstance {
	getStatus(): string;
	requestSync(): unknown;
	on(name: "status-change", callback: () => void): unknown;
	offref(ref: unknown): void;
	readonly syncing?: unknown;
	readonly ready?: unknown;
	/** The connection to the server: null until the first connect and after a failed one. */
	readonly server?: unknown;
}

const OFF: SyncSnapshot = { status: "off", running: false, ready: false, connected: false, heardAt: null };
/** `uninitialized`: Sync hasn't loaded its data yet; `disconnected`: no remote vault. */
const STATUSES: ReadonlyMap<string, SyncStatus> = new Map([
	["uninitialized", "loading"],
	["paused", "paused"],
	["error", "error"],
	["syncing", "syncing"],
	["synced", "synced"],
]);

export class ObsidianSync implements SyncControl {
	/** `app` is Obsidian's App; Sync hangs off its undocumented `internalPlugins`. */
	constructor(private readonly app: unknown) {}

	snapshot(): SyncSnapshot {
		const sync = this.instance();
		if (!sync) return OFF;
		const raw = safely(() => sync.getStatus(), "");
		const status = STATUSES.get(raw);
		if (!status) return OFF;
		return {
			status,
			running: typeof sync.syncing === "boolean" ? sync.syncing : raw === "syncing",
			ready: typeof sync.ready === "boolean" ? sync.ready : true,
			...connection(sync),
		};
	}

	request(): void {
		const sync = this.instance();
		if (!sync) return;
		safely(() => void Promise.resolve(sync.requestSync()).catch(() => undefined), undefined);
	}

	probe(): void {
		const server = this.instance()?.server;
		if (!isOpen(server)) return;
		const send = field(server, "send");
		if (typeof send === "function") safely(() => send.call(server, { op: "ping" }), undefined);
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

/** The socket and the last word from the server; a reshaped server reads as connected and heard, as before it was read. */
function connection(sync: SyncInstance): Pick<SyncSnapshot, "connected" | "heardAt"> {
	if (!("server" in sync)) return { connected: true, heardAt: null };
	const server = sync.server;
	if (server === null || server === undefined) return { connected: false, heardAt: 0 };
	const lastMessageTs = field(server, "lastMessageTs");
	return {
		connected: typeof field(server, "isConnected") === "function" ? isOpen(server) : true,
		heardAt: typeof lastMessageTs === "number" ? lastMessageTs : null,
	};
}

function isOpen(server: unknown): boolean {
	const isConnected = field(server, "isConnected");
	return typeof isConnected === "function" && safely(() => Boolean(isConnected.call(server)), false);
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
