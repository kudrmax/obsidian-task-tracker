import { join } from "node:path";
import { LoadingGuard } from "./LoadingGuard";
import { type FilesInUse, ModuleFiles } from "./ModuleFiles";
import type { TrackpadSwitch } from "./TrackpadSwitch";

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

interface AttachStatus {
	readonly installed: boolean;
	readonly hook: string;
	readonly pid: number;
	readonly build?: string;
	readonly path?: string;
}

interface MainLoader {
	readonly CHANNEL: string;
	attach(webContentsId: number, addonPath: string): AttachStatus;
	detach(webContentsId: number): void;
	uptime(): number | null;
	files(): FilesInUse;
	firstTime(what: string): boolean;
	pid(): number;
}

interface Remote {
	require(path: string): unknown;
	getCurrentWebContents(): { readonly id: number };
	readonly app: { getPath(name: "userData"): string };
}

interface IpcRenderer {
	on(channel: string, listener: (event: unknown, signal: NativeSignal) => void): void;
	removeListener(channel: string, listener: (event: unknown, signal: NativeSignal) => void): void;
}

export interface Electron {
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
	readonly electron: () => Electron;
	readonly remoteFallback: () => Remote | undefined;
	readonly switch: TrackpadSwitch;
	readonly log: (message: string) => void;
	/** Said to the person once, when the module is set aside for a reason they can act on. */
	readonly notice: (message: string) => void;
}

const FALLBACK = "the columns read the trackpad by its scrolling";

export const CRASH_NOTICE = `Task Calendar: Obsidian quit while loading the trackpad module, so it is not loaded any more and ${FALLBACK}. Turn «Trackpad through macOS» off and on in the settings to try it again.`;
export const RESTART_NOTICE = `Task Calendar: restart Obsidian to use the new trackpad module; until then ${FALLBACK}.`;

/** Calls to the main process for the clocks' offset: the one that came back fastest is kept. */
const CLOCK_SAMPLES = 7;

/**
 * macOS's touch and lift of the fingers on the trackpad (Decision 126), heard through a native module in Obsidian's main
 * process: the module (native/trackpad, derived from electron-trackpad-utils) reads the phases
 * of the scroll events AppKit hands the window, and the loader sends them to this window by IPC. The moments come in
 * macOS's uptime; each listener gets them on its own window's clock (its wheel events' `timeStamp`), the offset measured
 * once by asking the main process its uptime. `load` answers null wherever this can't be had: not a Mac, no `remote`,
 * the module refused or set aside by the crash guard; the ribbon then reads the fingers from the deltas as before.
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
				host.log(`trackpad: no remote in this Obsidian, ${FALLBACK}`);
				return null;
			}
			const files = new ModuleFiles(join(remote.app.getPath("userData"), "task-calendar", "trackpad"), Buffer.from(module.binary, "base64"), Buffer.from(module.loader, "utf8"));
			const paths = files.write();
			const loader = remote.require(paths.loader) as MainLoader;
			const fingers = MacTrackpadFingers.attached(files, paths.addon, loader, ipc, remote, host, home);
			files.clean(loader.files());
			return fingers;
		} catch (error) {
			host.log(`trackpad: the native module is unavailable (${String(error)}), ${FALLBACK}`);
			return null;
		}
	}

	private static attached(files: ModuleFiles, addonPath: string, loader: MainLoader, ipc: IpcRenderer, remote: Remote, host: TrackpadHost, home: Window): MacTrackpadFingers | null {
		const guard = new LoadingGuard(files.dir, files.build, loader.pid());
		if (guard.crashedBefore()) {
			host.switch.skip(files.build);
			host.notice(CRASH_NOTICE);
		}
		if (host.switch.skipped === files.build) {
			host.log(`trackpad: build ${files.build} took Obsidian down while loading, ${FALLBACK}`);
			return null;
		}
		const webContentsId = remote.getCurrentWebContents().id;
		const status = guard.around(() => loader.attach(webContentsId, addonPath));
		const clock = status.installed ? offsetOf(loader, home) : null;
		if (!status.installed || clock === null) {
			loader.detach(webContentsId);
			host.log(`trackpad: the native module did not hook AppKit (${status.hook}), ${FALLBACK}`);
			if (status.hook === "refused" && loader.firstTime("restart")) host.notice(RESTART_NOTICE);
			return null;
		}
		host.log(`trackpad: native module ${status.build} in the main process (${status.hook}, pid ${status.pid}, ${status.path}), clocks read to ±${clock.error.toFixed(2)} ms`);
		return new MacTrackpadFingers(ipc, loader, webContentsId, clock.offset, home);
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
