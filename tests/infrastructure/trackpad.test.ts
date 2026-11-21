import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { CRASH_NOTICE, type FingerSignal, MacTrackpadFingers, RESTART_NOTICE } from "../../obsidian/infrastructure/trackpad/MacTrackpadFingers";
import { TrackpadSwitch } from "../../obsidian/infrastructure/trackpad/TrackpadSwitch";

const ROOT = join(__dirname, "..", "..");
const NATIVE = join(ROOT, "native", "trackpad");
const LOADER_PATH = join(ROOT, "obsidian", "infrastructure", "trackpad", "mainLoader.cjs");
const LOADER = readFileSync(LOADER_PATH, "utf8");

type Forward = (code: number, seconds: number, phase: number, a: number, b: number) => void;

/** A native build as the loader sees it: hooked or refused, and what it was told. */
function nativeBuild(build: string, hook: "fresh" | "tookOver" | "refused" = "tookOver") {
	const addon = { hook, build, taken: 0, take: () => (addon.taken++, addon.hook), forward: null as Forward | null, stopped: 0, listen: (f: Forward) => (addon.forward = f), stop: () => (addon.stopped++, (addon.forward = null)), uptime: () => 1000.5 };
	return addon;
}
type NativeBuild = ReturnType<typeof nativeBuild>;

/**
 * Obsidian's main process: one `global` for its whole life, the windows (webContents) it has, and the native builds a
 * loader may `require`. Each loader file the renderer hands it runs as a module of its own over that one `global`.
 */
class MainProcess {
	readonly global: Record<symbol, unknown> = {};
	readonly sent: { id: number; channel: string; msg: unknown }[] = [];
	readonly destroyed = new Set<number>();
	readonly onDestroyed = new Map<number, () => void>();
	readonly builds = new Map<string, NativeBuild>();
	readonly required: string[] = [];
	pid = 42;

	constructor(readonly startedAt = Date.now()) {}

	/** The loader at `path` loaded as `require` would: once per path. */
	private readonly loaders = new Map<string, Loader>();

	loader(path: string, text = LOADER): Loader {
		const known = this.loaders.get(path);
		if (known) return known;
		const main = this;
		const electron = {
			webContents: {
				fromId: (id: number) => ({
					isDestroyed: () => main.destroyed.has(id),
					send: (channel: string, msg: unknown) => main.sent.push({ id, channel, msg }),
					once: (event: string, listener: () => void) => event === "destroyed" && main.onDestroyed.set(id, listener),
				}),
			},
		};
		const sandbox = {
			module: { exports: {} as Loader },
			global: this.global,
			__filename: path,
			Date: { now: () => this.startedAt + 1000 },
			process: { pid: this.pid, uptime: () => 1 },
			require: (id: string) => {
				if (id === "electron") return electron;
				main.required.push(id);
				const addon = main.builds.get(id);
				if (!addon) throw new Error(`no build at ${id}`);
				return addon;
			},
		};
		runInNewContext(text, sandbox);
		this.loaders.set(path, sandbox.module.exports);
		return sandbox.module.exports;
	}

	/** A window closed: Electron destroys its webContents. */
	close(id: number): void {
		this.destroyed.add(id);
		this.onDestroyed.get(id)?.();
	}
}

interface Loader {
	CHANNEL: string;
	attach(id: number, path: string): { installed: boolean; hook: string; build?: string; pid: number };
	detach(id: number): void;
	uptime(): number | null;
	files(): { inUse: string[]; startedAt: number };
	firstTime(what: string): boolean;
}

describe("the trackpad's native module (Decision 126)", () => {
	it("is the build of the source beside it: rebuild with `node scripts/build-trackpad.mjs` after changing addon.m", () => {
		const { sha256 } = JSON.parse(readFileSync(join(NATIVE, "trackpad.node.json"), "utf8")) as { sha256: string };
		expect(createHash("sha256").update(readFileSync(join(NATIVE, "addon.m"))).digest("hex")).toBe(sha256);
		expect(readFileSync(join(NATIVE, "trackpad.node")).includes(Buffer.from(sha256.slice(0, 12)))).toBe(true);
	});

	it("is one file for both Macs, Apple's chips and Intel's", () => {
		const binary = readFileSync(join(NATIVE, "trackpad.node"));
		expect(binary.readUInt32BE(0)).toBe(0xcafebabe);
		const archs = Array.from({ length: binary.readUInt32BE(4) }, (_, i) => binary.readUInt32BE(8 + i * 20));
		expect(archs.sort()).toEqual([0x01000007, 0x0100000c]);
	});

	it("keeps electron-trackpad-utils' MIT notice beside the code derived from it", () => {
		const license = readFileSync(join(NATIVE, "LICENSE"), "utf8");
		expect(license).toContain("electron-trackpad-utils");
		expect(license).toContain("Copyright (c) 2023 David Cann");
	});

	it.runIf(process.platform === "darwin")("shares one hook a process: a build loaded later takes it over, and the one before takes it back", () => {
		const dir = mkdtempSync(join(tmpdir(), "trackpad-native-"));
		const [first, second] = ["a", "b"].map((name) => {
			copyFileSync(join(NATIVE, "trackpad.node"), join(dir, `${name}.node`));
			return createRequire(__filename)(join(dir, `${name}.node`)) as { take(): string; build: string };
		});
		const { sha256 } = JSON.parse(readFileSync(join(NATIVE, "trackpad.node.json"), "utf8")) as { sha256: string };
		expect(["fresh", "tookOver"]).toContain(first.take());
		expect(second.take()).toBe("tookOver");
		expect(first.take()).toBe("tookOver");
		expect(second.build).toBe(sha256.slice(0, 12));
	});
});

describe("the main process's loader", () => {
	it("sends macOS's signals to the windows that listen, in ms of uptime", () => {
		const main = new MainProcess();
		main.builds.set("/a.node", nativeBuild("aaa", "fresh"));
		const loader = main.loader("/l1.cjs");
		expect(loader.attach(7, "/a.node")).toMatchObject({ installed: true, hook: "fresh", build: "aaa", pid: 42 });
		const forward = main.builds.get("/a.node")!.forward!;
		forward(1, 10, 1, 0, 0);
		forward(2, 10.5, 8, 10.25, 0);
		forward(2, 11, 16, 0, 0);
		forward(4, 12, 8, 41, 43);
		expect(main.sent.map((s) => [s.id, s.channel, s.msg])).toEqual([
			[7, loader.CHANNEL, { kind: "down", at: 10000, phase: 1 }],
			[7, loader.CHANNEL, { kind: "up", at: 10500, phase: 8, lastMove: 10250 }],
			[7, loader.CHANNEL, { kind: "up", at: 11000, phase: 16, lastMove: null }],
			[7, loader.CHANNEL, { kind: "momentumEnded", at: 12000, phase: 8, last: 41 }],
		]);
		expect(loader.uptime()).toBe(1000500);
	});

	it("lets a window go when Electron closes it, and stops the module once no window listens (principle 7)", () => {
		const main = new MainProcess();
		const addon = nativeBuild("aaa", "fresh");
		main.builds.set("/a.node", addon);
		const loader = main.loader("/l1.cjs");
		loader.attach(7, "/a.node");
		loader.attach(8, "/a.node");
		main.close(8);
		addon.forward!(1, 1, 1, 0, 0);
		expect(main.sent.map((s) => s.id)).toEqual([7]);
		expect(addon.stopped).toBe(0);
		main.close(7);
		expect(addon.stopped).toBe(1);
	});

	it("a new build after an update takes over the running hook: the old one stops, every window hears the new one", () => {
		const main = new MainProcess();
		const old = nativeBuild("aaa", "fresh");
		const next = nativeBuild("bbb", "tookOver");
		main.builds.set("/a.node", old);
		main.builds.set("/b.node", next);
		main.loader("/l1.cjs").attach(8, "/a.node");
		main.loader("/l1.cjs").attach(7, "/a.node");
		main.loader("/l1.cjs").detach(7);
		expect(main.loader("/l2.cjs").attach(7, "/b.node")).toMatchObject({ installed: true, hook: "tookOver", build: "bbb" });
		expect(old.stopped).toBe(1);
		next.forward!(1, 1, 1, 0, 0);
		expect(main.sent.map((s) => s.id).sort()).toEqual([7, 8]);
		expect(main.loader("/l2.cjs").files().inUse.sort()).toEqual(["/a.node", "/b.node", "/l1.cjs", "/l2.cjs"]);
	});

	it("back to a build loaded before (a revert after an update): it takes the hook again, the one after it stops", () => {
		const main = new MainProcess();
		const first = nativeBuild("aaa", "fresh");
		const second = nativeBuild("bbb", "tookOver");
		main.builds.set("/a.node", first);
		main.builds.set("/b.node", second);
		const loader = main.loader("/l1.cjs");
		loader.attach(7, "/a.node");
		loader.attach(7, "/b.node");
		first.hook = "tookOver";
		expect(loader.attach(7, "/a.node")).toMatchObject({ installed: true, hook: "tookOver", build: "aaa" });
		expect(first.taken).toBe(2);
		expect(second.forward).toBeNull();
		expect(first.forward).not.toBeNull();
	});

	it("the same build loaded again is not loaded a second time", () => {
		const main = new MainProcess();
		main.builds.set("/a.node", nativeBuild("aaa", "fresh"));
		main.loader("/l1.cjs").attach(7, "/a.node");
		main.loader("/l1.cjs").detach(7);
		expect(main.loader("/l1.cjs").attach(7, "/a.node")).toMatchObject({ installed: true, hook: "same" });
		expect(main.required).toEqual(["/a.node"]);
	});

	it("a build that could not take the hook leaves the running one to the windows it serves", () => {
		const main = new MainProcess();
		const old = nativeBuild("aaa", "fresh");
		main.builds.set("/a.node", old);
		main.builds.set("/b.node", nativeBuild("bbb", "refused"));
		main.loader("/l1.cjs").attach(8, "/a.node");
		expect(main.loader("/l2.cjs").attach(7, "/b.node")).toMatchObject({ installed: false, hook: "refused" });
		old.forward!(1, 1, 1, 0, 0);
		expect(main.sent.map((s) => s.id)).toEqual([8]);
		expect(main.loader("/l2.cjs").firstTime("restart")).toBe(true);
		expect(main.loader("/l1.cjs").firstTime("restart")).toBe(false);
	});
});

class FakeIpc {
	readonly listeners = new Map<string, (event: unknown, signal: never) => void>();
	on(channel: string, listener: (event: unknown, signal: never) => void) {
		this.listeners.set(channel, listener);
	}
	removeListener(channel: string) {
		this.listeners.delete(channel);
	}
	send(signal: unknown) {
		for (const listener of this.listeners.values()) listener(null, signal as never);
	}
}

class Storage {
	readonly kept = new Map<string, unknown>();
	loadLocalStorage(key: string) {
		return this.kept.get(key) ?? null;
	}
	saveLocalStorage(key: string, data: unknown) {
		this.kept.set(key, data);
	}
}

const HOME = { performance: { now: () => 500, timeOrigin: 1_000_000 } } as unknown as Window;

/** Obsidian's userData, its main process and the plugin's window; `load` is the plugin loading with `binary` built in. */
class Obsidian {
	readonly userData = mkdtempSync(join(tmpdir(), "obsidian-user-"));
	readonly storage = new Storage();
	readonly toggle = new TrackpadSwitch(this.storage);
	readonly logs: string[] = [];
	readonly notices: string[] = [];
	ipc = new FakeIpc();
	main = new MainProcess();

	get dir() {
		return join(this.userData, "task-calendar", "trackpad");
	}

	/** The native build the main process gets when it loads the file of `binary`. */
	builds(binary: string, addon: NativeBuild) {
		this.main.builds.set(join(this.dir, `trackpad-${createHash("sha256").update(binary).digest("hex").slice(0, 12)}.node`), addon);
	}

	load(binary: string, { remote = true } = {}) {
		const main = this.main;
		return MacTrackpadFingers.load(
			{ binary: Buffer.from(binary).toString("base64"), loader: LOADER },
			{
				electron: () => ({
					ipcRenderer: this.ipc,
					remote: remote ? { require: (path: string) => main.loader(path, readFileSync(path, "utf8")), getCurrentWebContents: () => ({ id: 7 }), app: { getPath: () => this.userData } } : undefined,
				}),
				remoteFallback: () => undefined,
				switch: this.toggle,
				log: (m) => this.logs.push(m),
				notice: (m) => this.notices.push(m),
			},
			HOME,
		);
	}

	/** Obsidian quit and opened again: a new main process, a new page. */
	restart(after = 60_000) {
		this.main = new MainProcess(this.main.startedAt + after);
		this.main.pid += 1;
		this.ipc = new FakeIpc();
	}

	files() {
		return readdirSync(this.dir).sort();
	}
}

function heard(fingers: MacTrackpadFingers) {
	const signals: FingerSignal[] = [];
	fingers.listen({ performance: { timeOrigin: 1_000_000 } } as unknown as Window, (s) => signals.push(s));
	return signals;
}

describe("MacTrackpadFingers", () => {
	it("writes the module into Obsidian's own folder, outside every vault, under its content's name", () => {
		const obsidian = new Obsidian();
		obsidian.builds("A", nativeBuild("aaa", "fresh"));
		expect(obsidian.load("A")).not.toBeNull();
		const files = obsidian.files();
		expect(files).toHaveLength(2);
		expect(files[0]).toMatch(/^trackpad-[0-9a-f]{12}\.node$/);
		expect(files[1]).toMatch(/^trackpad-main-[0-9a-f]{12}\.cjs$/);
		expect(obsidian.logs[0]).toContain("native module aaa in the main process (fresh, pid 42");
	});

	it("hands each window macOS's moments on its own clock", () => {
		const obsidian = new Obsidian();
		obsidian.builds("A", nativeBuild("aaa", "fresh"));
		const fingers = obsidian.load("A")!;
		const popout = { performance: { timeOrigin: 1_000_300 } } as unknown as Window;
		const home = heard(fingers);
		const away: FingerSignal[] = [];
		fingers.listen(popout, (s) => away.push(s));
		obsidian.ipc.send({ kind: "down", at: 1_000_600, phase: 1 });
		obsidian.ipc.send({ kind: "up", at: 1_000_700, phase: 8, lastMove: 1_000_690 });
		obsidian.ipc.send({ kind: "momentumBegan", at: 1_000_710, phase: 0 });
		obsidian.ipc.send({ kind: "momentumEnded", at: 1_000_800, phase: 8, last: 12 });
		expect(home).toEqual([
			{ kind: "down", t: 600 },
			{ kind: "up", t: 700, lastMove: 690 },
			{ kind: "momentumEnded", t: 800, last: 12 },
		]);
		expect(away[0]).toEqual({ kind: "down", t: 300 });
	});

	it("unloaded mid-gesture: the touch is heard, the lift after the unload reaches nothing, the main process lets the window go", () => {
		const obsidian = new Obsidian();
		const addon = nativeBuild("aaa", "fresh");
		obsidian.builds("A", addon);
		const fingers = obsidian.load("A")!;
		const signals = heard(fingers);
		addon.forward!(1, 1000.6, 1, 0, 0);
		obsidian.ipc.send(obsidian.main.sent[obsidian.main.sent.length - 1]!.msg);
		fingers.dispose();
		fingers.dispose();
		expect(addon.forward).toBeNull();
		obsidian.ipc.send({ kind: "up", at: 1_000_700, phase: 8, lastMove: 1_000_690 });
		expect(signals).toEqual([{ kind: "down", t: 600 }]);
		expect(obsidian.ipc.listeners.size).toBe(0);
		expect(addon.stopped).toBe(1);
		const again = obsidian.load("A")!;
		expect(heard(again)).toEqual([]);
		expect(addon.forward).not.toBeNull();
	});

	it("plugin reloaded with a new module hash in a running Obsidian: the new build takes over, the old file stays till the next start", () => {
		const obsidian = new Obsidian();
		const old = nativeBuild("aaa", "fresh");
		const next = nativeBuild("bbb", "tookOver");
		obsidian.builds("A", old);
		obsidian.builds("B", next);
		obsidian.load("A")!.dispose();
		const fingers = obsidian.load("B")!;
		expect(fingers).not.toBeNull();
		expect(old.forward).toBeNull();
		expect(obsidian.logs[obsidian.logs.length - 1]).toContain("native module bbb in the main process (tookOver");
		next.forward!(1, 1000.6, 1, 0, 0);
		expect(obsidian.main.sent[obsidian.main.sent.length - 1]).toMatchObject({ id: 7, msg: { kind: "down" } });
		expect(obsidian.files()).toHaveLength(3);
		fingers.dispose();
		obsidian.restart();
		obsidian.builds("B", nativeBuild("bbb", "fresh"));
		obsidian.load("B");
		expect(obsidian.files()).toHaveLength(2);
		expect(obsidian.files().every((f) => !f.endsWith(".node") || obsidian.main.required.includes(join(obsidian.dir, f)))).toBe(true);
	});

	it("a new build that can't take over runs the fallback and says so once", () => {
		const obsidian = new Obsidian();
		obsidian.builds("A", nativeBuild("aaa", "fresh"));
		obsidian.builds("B", nativeBuild("bbb", "refused"));
		obsidian.load("A")!.dispose();
		expect(obsidian.load("B")).toBeNull();
		expect(obsidian.load("B")).toBeNull();
		expect(obsidian.notices).toEqual([RESTART_NOTICE]);
	});

	it("leaves a build written since the main process started: another window may be about to load it", () => {
		const obsidian = new Obsidian();
		obsidian.builds("A", nativeBuild("aaa", "fresh"));
		obsidian.load("A");
		writeFileSync(join(obsidian.dir, "trackpad-0123456789ab.node"), "another window's build");
		writeFileSync(join(obsidian.dir, "trackpad-ba9876543210.node"), "a build of last week");
		utimesSync(join(obsidian.dir, "trackpad-ba9876543210.node"), new Date(2020, 0, 1), new Date(2020, 0, 1));
		obsidian.load("A");
		expect(obsidian.files()).toContain("trackpad-0123456789ab.node");
		expect(obsidian.files()).not.toContain("trackpad-ba9876543210.node");
	});

	describe("the crash guard", () => {
		it("takes its mark away once the module loaded", () => {
			const obsidian = new Obsidian();
			obsidian.builds("A", nativeBuild("aaa", "fresh"));
			obsidian.load("A");
			expect(existsSync(join(obsidian.dir, "loading.json"))).toBe(false);
		});

		it("skips a build whose loading took Obsidian down, says so once, and tries it again when the switch is turned on", () => {
			const obsidian = new Obsidian();
			obsidian.builds("A", nativeBuild("aaa", "fresh"));
			obsidian.load("A")!.dispose();
			writeFileSync(join(obsidian.dir, "loading.json"), JSON.stringify({ build: hashOf("A"), pid: 42 }));
			obsidian.restart();
			obsidian.builds("A", nativeBuild("aaa", "fresh"));
			expect(obsidian.load("A")).toBeNull();
			expect(obsidian.load("A")).toBeNull();
			expect(obsidian.main.required).toEqual([]);
			expect(obsidian.notices).toEqual([CRASH_NOTICE]);
			expect(existsSync(join(obsidian.dir, "loading.json"))).toBe(false);
			obsidian.toggle.set(false);
			obsidian.toggle.set(true);
			expect(obsidian.load("A")).not.toBeNull();
		});

		it("lets a new build try: the mark named another one", () => {
			const obsidian = new Obsidian();
			obsidian.builds("B", nativeBuild("bbb", "fresh"));
			obsidian.load("B")!.dispose();
			writeFileSync(join(obsidian.dir, "loading.json"), JSON.stringify({ build: hashOf("A"), pid: 41 }));
			obsidian.restart();
			obsidian.builds("B", nativeBuild("bbb", "fresh"));
			expect(obsidian.load("B")).not.toBeNull();
			expect(obsidian.notices).toEqual([]);
		});

		it("takes a mark of this very process for another window loading, not a crash", () => {
			const obsidian = new Obsidian();
			obsidian.builds("A", nativeBuild("aaa", "fresh"));
			obsidian.load("A")!.dispose();
			writeFileSync(join(obsidian.dir, "loading.json"), JSON.stringify({ build: hashOf("A"), pid: 42 }));
			expect(obsidian.load("A")).not.toBeNull();
		});
	});

	it("is none without Electron's remote, or when the module could not hook AppKit: the ribbon keeps reading the deltas", () => {
		const bare = new Obsidian();
		expect(bare.load("A", { remote: false })).toBeNull();
		const refused = new Obsidian();
		refused.builds("A", nativeBuild("aaa", "refused"));
		expect(refused.load("A")).toBeNull();
	});
});

describe("«Trackpad through macOS»", () => {
	it("is on by default, kept on this device, and off is off", () => {
		const storage = new Storage();
		expect(new TrackpadSwitch(storage).on).toBe(true);
		new TrackpadSwitch(storage).set(false);
		expect(new TrackpadSwitch(storage).on).toBe(false);
	});
});

function hashOf(binary: string): string {
	return createHash("sha256").update(binary).digest("hex").slice(0, 12);
}

/** The plugin's entry built as esbuild builds main.js, run where Node's modules can't be had: what it imports, and when. */
async function entry(platform: { isDesktopApp: boolean; isMacOS: boolean }, kept: unknown = null) {
	const result = await build({
		entryPoints: [join(ROOT, "obsidian", "infrastructure", "trackpad", "index.ts")],
		bundle: true,
		write: false,
		format: "cjs",
		platform: "node",
		external: ["obsidian", "electron", "node:*"],
		loader: { ".node": "base64" },
		plugins: [
			{
				name: "raw",
				setup: (b) => {
					b.onResolve({ filter: /\?raw$/ }, () => ({ path: LOADER_PATH, namespace: "raw" }));
					b.onLoad({ filter: /.*/, namespace: "raw" }, () => ({ contents: LOADER, loader: "text" }));
				},
			},
		],
	});
	const asked: string[] = [];
	const sandbox = {
		module: { exports: {} as { trackpadFingers: (app: unknown, plugin: unknown) => Promise<unknown> } },
		require: (id: string) => {
			asked.push(id);
			if (id === "obsidian") return { Platform: platform, Notice: class {} };
			throw new Error(`${id} is not in this Obsidian`);
		},
	};
	runInNewContext(result.outputFiles[0].text, sandbox);
	const app = { loadLocalStorage: () => kept, saveLocalStorage: () => undefined };
	const fingers = await sandbox.module.exports.trackpadFingers(app, {}).catch((error: Error) => error.message);
	return { fingers, asked };
}

describe("the plugin's entry, trackpadFingers", () => {
	it("on the phone, on Windows and Linux, imports nothing of Node and writes nothing", async () => {
		for (const platform of [
			{ isDesktopApp: false, isMacOS: true },
			{ isDesktopApp: true, isMacOS: false },
		]) {
			expect(await entry(platform)).toEqual({ fingers: null, asked: ["obsidian"] });
		}
	});

	it("with the switch off, loads nothing on the Mac either", async () => {
		expect(await entry({ isDesktopApp: true, isMacOS: true }, { on: false })).toEqual({ fingers: null, asked: ["obsidian"] });
	});

	it("on the Mac's desktop app, Node's modules are asked for only once the entry is called", async () => {
		const { fingers, asked } = await entry({ isDesktopApp: true, isMacOS: true });
		expect(asked[0]).toBe("obsidian");
		expect(asked.slice(1)).toContain("node:path");
		expect(fingers).toContain("is not in this Obsidian");
	});
});
