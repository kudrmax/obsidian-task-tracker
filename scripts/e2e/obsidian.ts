import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Cdp, targets } from "./cdp";
import type { Fixture } from "./fixture";
import type { Paths } from "./paths";

/**
 * The harness's own test Obsidian (CLAUDE.md, «Trying a build»): its own profile and scratch vault, a free debugging
 * port, launched in the background and driven only over CDP. It never brings a window forward or sends OS keys, checks
 * the vault it drives is its own before anything, and quits only itself.
 */

const PLUGIN = "task-calendar";
const FIRST_PORT = 9345;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Chromium switches that keep a window behind others drawing and timing as if it were in front. */
const BACKGROUND_SWITCHES = ["--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"];

export type Theme = "dark" | "light";
export type Platform = "desktop" | "phone";

export const SIZES: Readonly<Record<Platform, { width: number; height: number }>> = { desktop: { width: 1280, height: 800 }, phone: { width: 390, height: 844 } };

function listening(port: number): boolean {
	const out = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], { encoding: "utf8" });
	return out.stdout.trim() !== "";
}

/** Processes whose command line names this profile: the full path holds the work folder, so no other session's matches. */
function ownProcesses(profile: string): { pid: number; port: number | null }[] {
	const ps = execFileSync("ps", ["axww", "-o", "pid=,command="], { encoding: "utf8" });
	return ps
		.split("\n")
		.filter((line) => line.includes(`--user-data-dir=${profile}`) && line.includes("--remote-debugging-port="))
		.map((line) => ({ pid: Number(line.trim().split(/\s+/)[0]), port: Number(/--remote-debugging-port=(\d+)/.exec(line)?.[1] ?? NaN) || null }));
}

/** The process listening on `port` is this profile's: waits for it to listen, answers false if another holds the port. */
async function portIsOwn(port: number, p: Paths): Promise<boolean> {
	for (let i = 0; i < 100; i++) {
		const out = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fp"], { encoding: "utf8" }).stdout;
		const pids = [...out.matchAll(/^p(\d+)$/gm)].map((m) => Number(m[1]));
		if (pids.length > 0) return pids.some((pid) => ownProcesses(p.profile).some((o) => o.pid === pid));
		if (ownProcesses(p.profile).length > 0 && i > 60) return false;
		await sleep(300);
	}
	return false;
}

/** Ends this profile's own processes (the instance just launched without a port of its own): named by the full profile path, never another's. */
async function endOwn(p: Paths): Promise<void> {
	for (const own of ownProcesses(p.profile)) {
		try {
			process.kill(own.pid, "SIGTERM");
		} catch {
			/* gone already */
		}
	}
	await TestObsidian.gone(p);
}

function freePort(): number {
	for (let port = FIRST_PORT; port < FIRST_PORT + 200; port++) {
		const taken = execFileSync("ps", ["axww", "-o", "command="], { encoding: "utf8" }).includes(`--remote-debugging-port=${port}`);
		if (!taken && !listening(port)) return port;
	}
	throw new Error("no free debugging port from 9345");
}

function write(path: string, text: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
}

/**
 * The scratch vault, written over in place from the fixture each run (never moved to the Bin: it holds a copy of Max's
 * tasks): the tasks file, the settings, the plugin's e2e build, the calendars, the notes. Each platform and theme then
 * starts clean through `reset`.
 */
export function prepareVault(p: Paths, fx: Fixture): void {
	mkdirSync(p.vault, { recursive: true });
	write(join(p.vault, fx.tasksFile), fx.tasks);
	for (const [path, text] of Object.entries(fx.notes)) write(join(p.vault, path), text);
	for (const [path, text] of Object.entries(fx.calendarFiles)) write(join(p.vault, path), text);
	const config = join(p.vault, ".obsidian");
	write(join(config, "community-plugins.json"), JSON.stringify([PLUGIN]));
	write(join(config, "app.json"), JSON.stringify({ promptDelete: false, alwaysUpdateLinks: true }));
	write(join(config, "appearance.json"), JSON.stringify({ theme: "obsidian" }));
	const plugin = join(config, "plugins", PLUGIN);
	mkdirSync(plugin, { recursive: true });
	copyFileSync(join(p.build, "main.js"), join(plugin, "main.js"));
	copyFileSync(join(p.root, "manifest.json"), join(plugin, "manifest.json"));
	copyFileSync(join(p.root, "styles.css"), join(plugin, "styles.css"));
	write(join(plugin, "data.json"), JSON.stringify(fx.settings, null, "\t"));
	write(join(plugin, "e2e.json"), JSON.stringify(fx.e2e));
	write(join(p.profile, "obsidian.json"), JSON.stringify({ vaults: { tce2evault0000001: { path: p.vault, ts: Date.now(), open: true } } }));
}

export class TestObsidian {
	private constructor(
		readonly cdp: Cdp,
		readonly port: number,
		private readonly p: Paths,
	) {}

	/**
	 * Launches the harness's own Obsidian in the background (a stale one of its own from a broken run is quit first). If
	 * another session took the port in the moment between the check and the launch, the instance just launched (it has no
	 * debugging port then) is ended and the launch tried on the next port; nothing is driven before the port is its own.
	 */
	static async launch(p: Paths): Promise<TestObsidian> {
		for (const stale of ownProcesses(p.profile)) {
			if (stale.port) await TestObsidian.quitAt(stale.port, p).catch(() => endOwn(p));
			else await endOwn(p);
		}
		mkdirSync(p.profile, { recursive: true });
		for (let attempt = 0; attempt < 3; attempt++) {
			const port = freePort();
			execFileSync("open", ["-n", "-g", "-a", "Obsidian", "--args", `--user-data-dir=${p.profile}`, `--remote-debugging-port=${port}`, ...BACKGROUND_SWITCHES]);
			if (!(await portIsOwn(port, p))) {
				await endOwn(p);
				continue;
			}
			const cdp = await TestObsidian.page(port, 60_000);
			const obsidian = new TestObsidian(cdp, port, p);
			await obsidian.settle();
			return obsidian;
		}
		throw new Error("could not launch a test Obsidian on a port of its own in three tries");
	}

	/** The harness's own instance already running (`npm run e2e -- open`), for a look by hand. */
	static async attach(p: Paths): Promise<TestObsidian> {
		const own = ownProcesses(p.profile).find((o) => o.port !== null);
		if (!own?.port) throw new Error("no test Obsidian of the harness is running: npm run e2e -- open");
		const obsidian = new TestObsidian(await TestObsidian.page(own.port, 10_000), own.port, p);
		await obsidian.assertOwnVault();
		return obsidian;
	}

	private static async page(port: number, timeoutMs: number): Promise<Cdp> {
		const until = Date.now() + timeoutMs;
		for (;;) {
			try {
				const page = (await targets(port)).find((t) => t.type === "page" && t.url.startsWith("app://obsidian.md/index.html"));
				if (page) return await Cdp.connect(page.webSocketDebuggerUrl);
			} catch {
				/* not up yet */
			}
			if (Date.now() > until) throw new Error(`the test Obsidian on port ${port} did not come up`);
			await sleep(300);
		}
	}

	/** The vault this window holds is the harness's own: compared by its full path, which names the work folder. */
	async assertOwnVault(): Promise<void> {
		const base = await this.cdp.eval<string>("return window.app?.vault?.adapter?.basePath ?? null");
		if (base !== this.p.vault) throw new Error(`the window on port ${this.port} holds ${base}, not ${this.p.vault}: stopping before touching it`);
	}

	/** Waits for the layout and the plugin, keeps the window timing and drawing behind others, and checks the vault. */
	async settle(): Promise<void> {
		const until = Date.now() + 60_000;
		for (;;) {
			const ready = await this.cdp.eval<boolean>("return !!(window.app && app.workspace && app.workspace.layoutReady)").catch(() => false);
			if (ready) break;
			if (Date.now() > until) throw new Error("Obsidian's layout never got ready");
			await sleep(300);
		}
		await this.assertOwnVault();
		await this.cdp.eval(`require("@electron/remote").getCurrentWebContents().setBackgroundThrottling(false); return true`);
		await this.cdp.call("Page.enable");
		await this.cdp.call("Emulation.setFocusEmulationEnabled", { enabled: true });
		const enabled = await this.cdp.eval<boolean>(`
			if (!app.plugins.isEnabled()) await app.plugins.setEnable(true);
			if (!app.plugins.enabledPlugins.has("${PLUGIN}")) await app.plugins.enablePluginAndSave("${PLUGIN}");
			for (let i = 0; i < 100 && !app.plugins.plugins["${PLUGIN}"]?.e2e; i++) await new Promise((r) => setTimeout(r, 100));
			return !!app.plugins.plugins["${PLUGIN}"]?.e2e;
		`);
		if (!enabled) throw new Error("the e2e build of the plugin did not load");
		await this.closeModals();
	}

	/** Obsidian's own dialogs (a first start's) closed by a click through CDP's input, as a person would, never a click made in the page. */
	private async closeModals(): Promise<void> {
		const buttons = await this.cdp.eval<{ x: number; y: number }[]>(
			`return [...document.querySelectorAll(".modal-container .modal-close-button")].map((b) => b.getBoundingClientRect()).filter((r) => r.width > 0).map((r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 }))`,
		);
		for (const at of buttons) {
			await this.cdp.call("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "left", buttons: 1, clickCount: 1 });
			await this.cdp.call("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button: "left", buttons: 0, clickCount: 1 });
			await sleep(200);
		}
	}

	/** Reloads the page (after `emulateMobile`, a theme…) and settles again. */
	async reloaded(trigger: string): Promise<void> {
		const loaded = new Promise<void>((resolve) => {
			const off = this.cdp.on("Page.loadEventFired", () => {
				off();
				resolve();
			});
		});
		await this.cdp.eval(`${trigger}; return true`).catch(() => undefined);
		await Promise.race([loaded, sleep(20_000)]);
		await this.settle();
	}

	/** The window's size and the phone's emulation; the page reloads only when the emulation changes. */
	async platform(platform: Platform): Promise<void> {
		const { width, height } = SIZES[platform];
		await this.cdp.eval(`require("@electron/remote").getCurrentWindow().setContentSize(${width}, ${height}); return true`);
		const phone = await this.cdp.eval<boolean>("return app.isMobile");
		if (phone !== (platform === "phone")) await this.reloaded(`app.emulateMobile(${platform === "phone"})`);
		await sleep(500);
	}

	async theme(theme: Theme): Promise<void> {
		const name = theme === "dark" ? "obsidian" : "moonstone";
		await this.cdp.eval(`if (app.getTheme?.() !== "${name}") app.changeTheme("${name}"); return true`);
		await sleep(1500);
	}

	/**
	 * A clean start for one platform and theme: the fixture's tasks file again, no device storage of the plugin, the
	 * screen closed, the sidebars folded; the page reloads into the platform, then takes the theme and the window's size.
	 */
	async reset(platform: Platform, theme: Theme, tasks: { readonly path: string; readonly text: string }): Promise<void> {
		await this.assertOwnVault();
		await this.cdp.eval(`
			app.workspace.detachLeavesOfType("${PLUGIN}");
			await app.vault.adapter.write(${JSON.stringify(tasks.path)}, ${JSON.stringify(tasks.text)});
			for (const key of Object.keys(localStorage)) if (!key.startsWith("enable-plugin-")) localStorage.removeItem(key);
			return true;
		`);
		const { width, height } = SIZES[platform];
		await this.cdp.eval(`require("@electron/remote").getCurrentWindow().setContentSize(${width}, ${height}); return true`);
		await this.reloaded(`app.emulateMobile(${platform === "phone"})`);
		await this.cdp.eval(`app.workspace.leftSplit?.collapse(); app.workspace.rightSplit?.collapse(); return true`);
		await this.theme(theme);
		await sleep(500);
	}

	/** Quits this instance (its vault checked first) and waits until its processes are gone. */
	async quit(): Promise<void> {
		await this.assertOwnVault();
		await this.cdp.eval(`setTimeout(() => require("@electron/remote").app.quit(), 50); return true`).catch(() => undefined);
		this.cdp.close();
		await TestObsidian.gone(this.p);
	}

	private static async quitAt(port: number, p: Paths): Promise<void> {
		const cdp = await TestObsidian.page(port, 10_000);
		const base = await cdp.eval<string>("return window.app?.vault?.adapter?.basePath ?? null");
		if (base !== p.vault) {
			cdp.close();
			throw new Error(`a process with this profile on port ${port} holds ${base}: not quitting it`);
		}
		await cdp.eval(`setTimeout(() => require("@electron/remote").app.quit(), 50); return true`).catch(() => undefined);
		cdp.close();
		await TestObsidian.gone(p);
	}

	static async gone(p: Paths): Promise<void> {
		for (let i = 0; i < 60; i++) {
			if (ownProcesses(p.profile).length === 0) return;
			await sleep(500);
		}
		throw new Error("the test Obsidian did not quit");
	}
}
