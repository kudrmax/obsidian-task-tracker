import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { type FingerSignal, MacTrackpadFingers } from "../../obsidian/infrastructure/trackpad/MacTrackpadFingers";

const ROOT = join(__dirname, "..", "..");
const NATIVE = join(ROOT, "native", "trackpad");
const LOADER = readFileSync(join(ROOT, "obsidian", "infrastructure", "trackpad", "mainLoader.cjs"), "utf8");

type Forward = (code: number, seconds: number, phase: number, a: number, b: number) => void;

/** The main process's loader run with a stand-in Electron and native module: what it sends where, as Obsidian's main process would. */
function mainProcess(installed = true) {
	const sent: { id: number; channel: string; msg: unknown }[] = [];
	const destroyed = new Set<number>();
	const addon = { installed, forward: null as Forward | null, stopped: 0, listen: (f: Forward) => (addon.forward = f), stop: () => addon.stopped++, uptime: () => 1000.5 };
	const sandbox: { module: { exports: Record<string, unknown> }; global: Record<symbol, unknown>; require: (id: string) => unknown; process: { pid: number } } = {
		module: { exports: {} },
		global: {},
		process: { pid: 42 },
		require: (id) => (id === "electron" ? { webContents: { fromId: (wc: number) => ({ isDestroyed: () => destroyed.has(wc), send: (channel: string, msg: unknown) => sent.push({ id: wc, channel, msg }) }) } } : addon),
	};
	runInNewContext(LOADER, sandbox);
	const loader = sandbox.module.exports as { CHANNEL: string; attach(id: number, path: string): { installed: boolean; pid: number }; detach(id: number): void; uptime(): number };
	return { loader, addon, sent, destroyed };
}

describe("the trackpad's native module (Decision 126)", () => {
	it("is the build of the source beside it: rebuild with `node scripts/build-trackpad.mjs` after changing addon.m", () => {
		const { sha256 } = JSON.parse(readFileSync(join(NATIVE, "trackpad.node.json"), "utf8")) as { sha256: string };
		expect(createHash("sha256").update(readFileSync(join(NATIVE, "addon.m"))).digest("hex")).toBe(sha256);
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
});

describe("the main process's loader", () => {
	it("sends macOS's signals to the windows that listen, in ms of uptime", () => {
		const { loader, addon, sent } = mainProcess();
		expect(loader.attach(7, "/plugin/trackpad.node")).toMatchObject({ installed: true, pid: 42 });
		addon.forward!(1, 10, 1, 0, 0);
		addon.forward!(2, 10.5, 8, 10.25, 0);
		addon.forward!(2, 11, 16, 0, 0);
		addon.forward!(4, 12, 8, 41, 43);
		expect(sent.map((s) => [s.id, s.channel, s.msg])).toEqual([
			[7, loader.CHANNEL, { kind: "down", at: 10000, phase: 1 }],
			[7, loader.CHANNEL, { kind: "up", at: 10500, phase: 8, lastMove: 10250 }],
			[7, loader.CHANNEL, { kind: "up", at: 11000, phase: 16, lastMove: null }],
			[7, loader.CHANNEL, { kind: "momentumEnded", at: 12000, phase: 8, last: 41 }],
		]);
		expect(loader.uptime()).toBe(1000500);
	});

	it("sends nothing to a window gone, and stops the module once no window listens", () => {
		const { loader, addon, sent, destroyed } = mainProcess();
		loader.attach(7, "/a.node");
		loader.attach(8, "/a.node");
		destroyed.add(8);
		addon.forward!(1, 1, 1, 0, 0);
		expect(sent.map((s) => s.id)).toEqual([7]);
		loader.detach(7);
		expect(addon.stopped).toBe(1);
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

function renderer({ installed = true, remote = true } = {}) {
	const main = mainProcess(installed);
	const ipc = new FakeIpc();
	const dir = mkdtempSync(join(tmpdir(), "trackpad-"));
	const required: string[] = [];
	const logs: string[] = [];
	const home = { performance: { now: () => 500, timeOrigin: 1_000_000 } } as unknown as Window;
	const fingers = MacTrackpadFingers.load(
		{ binary: Buffer.from("not a real module").toString("base64"), loader: LOADER },
		{
			dir,
			electron: () => ({ ipcRenderer: ipc, remote: remote ? { require: (path: string) => (required.push(path), main.loader), getCurrentWebContents: () => ({ id: 7 }) } : undefined }),
			remoteFallback: () => undefined,
			log: (m) => logs.push(m),
		},
		home,
	);
	return { fingers, main, ipc, dir, required, logs, home };
}

describe("MacTrackpadFingers", () => {
	it("writes the module beside the plugin under its content's name and loads it in the main process once", () => {
		const { fingers, dir, required, main, logs } = renderer();
		expect(fingers).not.toBeNull();
		const files = readdirSync(dir).sort();
		expect(files).toHaveLength(2);
		expect(files[0]).toMatch(/^trackpad-[0-9a-f]{12}\.node$/);
		expect(files[1]).toMatch(/^trackpad-main-[0-9a-f]{12}\.cjs$/);
		expect(required).toEqual([join(dir, files[1])]);
		expect(main.addon.forward).not.toBeNull();
		expect(logs[0]).toContain("native module in the main process (pid 42");
	});

	it("hands each window macOS's moments on its own clock", () => {
		const { fingers, ipc } = renderer();
		const popout = { performance: { timeOrigin: 1_000_300 } } as unknown as Window;
		const home: FingerSignal[] = [];
		const away: FingerSignal[] = [];
		fingers!.listen({ performance: { timeOrigin: 1_000_000 } } as unknown as Window, (s) => home.push(s));
		fingers!.listen(popout, (s) => away.push(s));
		ipc.send({ kind: "down", at: 1_000_600, phase: 1 });
		ipc.send({ kind: "up", at: 1_000_700, phase: 8, lastMove: 1_000_690 });
		ipc.send({ kind: "momentumBegan", at: 1_000_710, phase: 0 });
		ipc.send({ kind: "momentumEnded", at: 1_000_800, phase: 8, last: 12 });
		expect(home).toEqual([
			{ kind: "down", t: 600 },
			{ kind: "up", t: 700, lastMove: 690 },
			{ kind: "momentumEnded", t: 800, last: 12 },
		]);
		expect(away[0]).toEqual({ kind: "down", t: 300 });
	});

	it("stops listening on the plugin's unload: nothing reaches the screen, the main process lets the window go", () => {
		const { fingers, ipc, main } = renderer();
		const heard: FingerSignal[] = [];
		fingers!.listen({ performance: { timeOrigin: 1_000_000 } } as unknown as Window, (s) => heard.push(s));
		fingers!.dispose();
		ipc.send({ kind: "down", at: 1_000_600, phase: 1 });
		expect(heard).toEqual([]);
		expect(ipc.listeners.size).toBe(0);
		expect(main.addon.stopped).toBe(1);
	});

	it("is none without Electron's remote, or when the module could not hook AppKit: the ribbon keeps reading the deltas", () => {
		expect(renderer({ remote: false }).fingers).toBeNull();
		const refused = renderer({ installed: false });
		expect(refused.fingers).toBeNull();
		expect(refused.main.addon.stopped).toBe(1);
	});
});
