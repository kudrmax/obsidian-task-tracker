import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** What the engine hears of the fingers (the engine's `FingerSignal`), on the clock of the window it listens in. */
export type FingerSignal =
	| { readonly kind: "down"; readonly t: number }
	| { readonly kind: "up"; readonly t: number; readonly lastMove: number | null }
	| { readonly kind: "momentumEnded"; readonly t: number; readonly last: number };

/** What the main process's loader sends: the moments in macOS's uptime, ms. */
type NativeSignal =
	| { readonly kind: "down" | "momentumBegan"; readonly at: number; readonly phase: number }
	| { readonly kind: "up"; readonly at: number; readonly phase: number; readonly lastMove: number | null }
	| { readonly kind: "momentumEnded"; readonly at: number; readonly phase: number; readonly last: number };

interface MainLoader {
	readonly CHANNEL: string;
	attach(webContentsId: number, addonPath: string): { readonly installed: boolean; readonly path: string; readonly pid: number };
	detach(webContentsId: number): void;
	uptime(): number | null;
}

interface Remote {
	require(path: string): unknown;
	getCurrentWebContents(): { readonly id: number };
}

interface IpcRenderer {
	on(channel: string, listener: (event: unknown, signal: NativeSignal) => void): void;
	removeListener(channel: string, listener: (event: unknown, signal: NativeSignal) => void): void;
}

interface Electron {
	readonly ipcRenderer?: IpcRenderer;
	readonly remote?: Remote;
}

export interface TrackpadModule {
	/** The universal trackpad.node, as the build embeds it (base64). */
	readonly binary: string;
	/** The main process's loader, mainLoader.cjs. */
	readonly loader: string;
}

export interface TrackpadHost {
	/** The plugin's folder on the disk: the module is written there once per build of it. */
	readonly dir: string;
	readonly electron: () => Electron;
	readonly remoteFallback: () => Remote | undefined;
	readonly log: (message: string) => void;
}

/** Calls to the main process for the clocks' offset: the one that came back fastest is kept. */
const CLOCK_SAMPLES = 7;

/**
 * macOS's touch and lift of the fingers on the trackpad (Decision 125), heard through a native module in Obsidian's main
 * process: the module (native/trackpad, derived from electron-trackpad-utils) reads the phases
 * of the scroll events AppKit hands the window, and the loader sends them to this window by IPC. The moments come in
 * macOS's uptime; each listener gets them on its own window's clock (its wheel events' `timeStamp`), the offset measured
 * once by asking the main process its uptime. `load` answers null wherever this can't be had: not a Mac, no `remote`,
 * the module refused; the ribbon then reads the fingers from the deltas as before.
 */
export class MacTrackpadFingers {
	private readonly listeners = new Set<(signal: NativeSignal) => void>();
	private readonly onSignal = (_event: unknown, signal: NativeSignal) => this.listeners.forEach((listener) => listener(signal));
	private disposed = false;

	private constructor(
		private readonly ipc: IpcRenderer,
		private readonly loader: MainLoader,
		private readonly webContentsId: number,
		/** macOS's uptime minus this window's `performance.now()`, ms. */
		private readonly offset: number,
		private readonly home: Window,
	) {
		ipc.on(loader.CHANNEL, this.onSignal);
	}

	static load(module: TrackpadModule, host: TrackpadHost, home: Window): MacTrackpadFingers | null {
		if (typeof process === "undefined" || process.platform !== "darwin") return null;
		try {
			const electron = host.electron();
			const remote = electron.remote ?? host.remoteFallback();
			const ipc = electron.ipcRenderer;
			if (!remote || !ipc) {
				host.log("trackpad: no remote in this Obsidian, the ribbon reads the fingers from the deltas");
				return null;
			}
			const addonPath = written(host.dir, "trackpad", ".node", Buffer.from(module.binary, "base64"));
			const loaderPath = written(host.dir, "trackpad-main", ".cjs", Buffer.from(module.loader, "utf8"));
			const loader = remote.require(loaderPath) as MainLoader;
			const webContentsId = remote.getCurrentWebContents().id;
			const status = loader.attach(webContentsId, addonPath);
			const clock = offsetOf(loader, home);
			if (!status.installed || clock === null) {
				loader.detach(webContentsId);
				host.log(`trackpad: the native module did not hook AppKit (installed ${status.installed}), the ribbon reads the fingers from the deltas`);
				return null;
			}
			host.log(`trackpad: native module in the main process (pid ${status.pid}, ${status.path}), clocks read to ±${clock.error.toFixed(2)} ms`);
			return new MacTrackpadFingers(ipc, loader, webContentsId, clock.offset, home);
		} catch (error) {
			host.log(`trackpad: the native module is unavailable (${String(error)}), the ribbon reads the fingers from the deltas`);
			return null;
		}
	}

	listen(win: Window, listener: (signal: FingerSignal) => void): () => void {
		const shift = this.offset + (win.performance.timeOrigin - this.home.performance.timeOrigin);
		const heard = (signal: NativeSignal) => {
			const t = signal.at - shift;
			if (signal.kind === "down") listener({ kind: "down", t });
			else if (signal.kind === "up") listener({ kind: "up", t, lastMove: signal.lastMove === null ? null : signal.lastMove - shift });
			else if (signal.kind === "momentumEnded") listener({ kind: "momentumEnded", t, last: signal.last });
		};
		this.listeners.add(heard);
		return () => this.listeners.delete(heard);
	}

	/** The plugin unloads: this window stops listening, and the main process forwards nothing once no window listens. */
	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.listeners.clear();
		this.ipc.removeListener(this.loader.CHANNEL, this.onSignal);
		try {
			this.loader.detach(this.webContentsId);
		} catch {
			return;
		}
	}
}

/**
 * The file in the plugin's folder, named by its content: written once, never over a module already loaded (macOS keeps a
 * loaded module's pages mapped, and a rewrite in place would crash the process), so a new build writes a new name.
 */
function written(dir: string, name: string, extension: string, content: Buffer): string {
	const path = join(dir, `${name}-${createHash("sha256").update(content).digest("hex").slice(0, 12)}${extension}`);
	if (existsSync(path) && readFileSync(path).equals(content)) return path;
	const temporary = `${path}.${process.pid}.tmp`;
	writeFileSync(temporary, content);
	renameSync(temporary, path);
	return path;
}

function offsetOf(loader: MainLoader, home: Window): { offset: number; error: number } | null {
	let best: { offset: number; error: number } | null = null;
	for (let i = 0; i < CLOCK_SAMPLES; i++) {
		const before = home.performance.now();
		const uptime = loader.uptime();
		const after = home.performance.now();
		if (uptime === null) return null;
		const error = (after - before) / 2;
		if (!best || error < best.error) best = { offset: uptime - (before + after) / 2, error };
	}
	return best;
}
