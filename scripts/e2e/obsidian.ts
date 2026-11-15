import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
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

function freePort(): number {
	for (let port = FIRST_PORT; port < FIRST_PORT + 200; port++) {
		const taken = execFileSync("ps", ["axww", "-o", "command="], { encoding: "utf8" }).includes(`--remote-debugging-port=${port}`);
		if (!taken && !listening(port)) return port;
	}
	throw new Error("no free debugging port from 9345");
}

/** A file removed: to the bin, never deleted (CLAUDE.md, «Files»). */
function toTrash(path: string): void {
	if (existsSync(path)) execFileSync("trash", [path]);
}

function write(path: string, text: string): void {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
}

/** The scratch vault, made anew from the fixture: the tasks file, the settings, the plugin's e2e build, the calendars, the notes. */
export function prepareVault(p: Paths, fx: Fixture): void {
	toTrash(p.vault);
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

	/** Launches the harness's own Obsidian in the background (a stale one of its own from a broken run is quit first). */
	static async launch(p: Paths): Promise<TestObsidian> {
		for (const stale of ownProcesses(p.profile)) if (stale.port) await TestObsidian.quitAt(stale.port, p);
		const port = freePort();
		mkdirSync(p.profile, { recursive: true });
		execFileSync("open", ["-n", "-g", "-a", "Obsidian", "--args", `--user-data-dir=${p.profile}`, `--remote-debugging-port=${port}`, ...BACKGROUND_SWITCHES]);
		const cdp = await TestObsidian.page(port, 60_000);
		const obsidian = new TestObsidian(cdp, port, p);
		await obsidian.settle();
		return obsidian;
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
			document.querySelectorAll(".modal-container .modal-close-button").forEach((b) => b.click());
			return !!app.plugins.plugins["${PLUGIN}"]?.e2e;
		`);
		if (!enabled) throw new Error("the e2e build of the plugin did not load");
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

	private static async gone(p: Paths): Promise<void> {
		for (let i = 0; i < 60; i++) {
			if (ownProcesses(p.profile).length === 0) return;
			await sleep(500);
		}
		throw new Error("the test Obsidian did not quit");
	}
}
