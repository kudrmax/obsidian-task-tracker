import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cdp, sleep, targets } from "./cdp.mjs";

/**
 * The test Obsidian the checks run in: its own profile and scratch vault, its own debugging port, its window kept off the
 * screen and never brought forward (`open -n -g`). Never `~/Obsidian`, never another instance: a port held by an
 * Obsidian of another profile stops the run.
 */

const VAULT_ID = "tce2e";
const PLUGIN_ID = "task-calendar";
const ROOT = new URL("../../../", import.meta.url).pathname;
/** Where the window stands: off every screen, so it never covers the person's work nor takes their input. */
const OFF_SCREEN = { x: -5000, y: 2000 };
export const DESKTOP = { width: 1280, height: 820 };
export const PHONE = { width: 390, height: 844 };

export function e2eConfig() {
	const dir = process.env.E2E_DIR ?? join(tmpdir(), "task-calendar-e2e");
	return { dir, port: Number(process.env.E2E_PORT ?? 9447), vault: join(dir, "vault"), user: join(dir, "obsidian-user"), out: process.env.E2E_OUT ?? join(dir, "out") };
}

/** The profile directory of the process listening on `port`, or null when none listens. */
function profileOnPort(port) {
	let out = "";
	try {
		out = execFileSync("ps", ["-axo", "args"], { encoding: "utf8" });
	} catch {
		return null;
	}
	const line = out.split("\n").find((l) => l.includes(`--remote-debugging-port=${port}`) && l.includes("--user-data-dir="));
	return line ? /--user-data-dir=(\S+)/.exec(line)?.[1] ?? null : null;
}

export class TestObsidian {
	constructor(config = e2eConfig()) {
		this.config = config;
		/** @type {Cdp | null} */
		this.cdp = null;
	}

	get tasksPath() {
		return join(this.config.vault, "TODOs Tasks.md");
	}

	/** The scratch vault and the profile that knows it, made once. */
	prepare() {
		const { vault, user, out } = this.config;
		for (const dir of [join(vault, ".obsidian", "plugins", PLUGIN_ID), user, out]) mkdirSync(dir, { recursive: true });
		const obsidian = join(vault, ".obsidian");
		writeFileSync(join(obsidian, "community-plugins.json"), JSON.stringify([PLUGIN_ID]));
		if (!existsSync(join(obsidian, "app.json"))) writeFileSync(join(obsidian, "app.json"), "{}");
		writeFileSync(join(user, "obsidian.json"), JSON.stringify({ vaults: { [VAULT_ID]: { path: vault, ts: 1, open: true } } }));
		writeFileSync(join(user, `${VAULT_ID}.json`), JSON.stringify({ ...OFF_SCREEN, ...DESKTOP, isMaximized: false, devTools: false, zoom: 0 }));
		if (!existsSync(join(vault, "Заметка о доме.md"))) writeFileSync(join(vault, "Заметка о доме.md"), "Дом.\n");
	}

	/** Starts the instance unless it already runs on its port; then connects and makes sure the plugin is on. */
	async start() {
		const { port, user } = this.config;
		const owner = profileOnPort(port);
		if (owner && owner !== user) throw new Error(`port ${port} belongs to another Obsidian (${owner}); set E2E_PORT to a free one`);
		this.prepare();
		if (!owner) {
			spawn("open", ["-n", "-g", "-a", "Obsidian", "--args", `--user-data-dir=${user}`, `--remote-debugging-port=${port}`], { stdio: "ignore", detached: true }).unref();
			await sleep(2000);
		}
		await this.connect();
		const trusted = await this.cdp.eval(`localStorage.getItem("enable-plugin-" + app.appId) === "true"`);
		if (!trusted) {
			await this.cdp.eval(`localStorage.setItem("enable-plugin-" + app.appId, "true"); setTimeout(() => location.reload(), 50); 1`);
			await sleep(1500);
			await this.connect();
		}
		await this.cdp.eval(`(async () => { if (!app.plugins.enabledPlugins.has("${PLUGIN_ID}")) await app.plugins.enablePluginAndSave("${PLUGIN_ID}"); return 1 })()`);
		return this;
	}

	/** Connects to the main window once its workspace is ready, and keeps it off the screen and unthrottled. */
	async connect() {
		this.cdp?.close();
		this.cdp = await Cdp.connect(this.config.port);
		for (let i = 0; i < 100; i++) {
			const ready = await this.cdp.eval(`typeof app !== "undefined" && !!app.workspace && app.workspace.layoutReady === true`).catch(() => false);
			if (ready) break;
			await sleep(200);
		}
		await this.cdp.eval(`(() => { const r = require("@electron/remote"); const w = r.getCurrentWindow(); w.setPosition(${OFF_SCREEN.x}, ${OFF_SCREEN.y}, false); r.getCurrentWebContents().setBackgroundThrottling(false); return 1 })()`);
		await this.cdp.send("Runtime.enable");
		return this.cdp;
	}

	/** The repository's build, copied in and loaded again. */
	async deploy(from = ROOT) {
		const into = join(this.config.vault, ".obsidian", "plugins", PLUGIN_ID);
		for (const file of ["main.js", "manifest.json", "styles.css"]) copyFileSync(join(from, file), join(into, file));
		const loaded = await this.cdp.eval(`(async () => { app.workspace.getLeavesOfType("task-calendar").forEach((l) => l.detach()); await app.plugins.disablePlugin("${PLUGIN_ID}"); await app.plugins.loadManifests(); await app.plugins.enablePlugin("${PLUGIN_ID}"); return !!app.plugins.plugins["${PLUGIN_ID}"] })()`);
		if (!loaded) throw new Error("the plugin did not load: see the test Obsidian's console");
	}

	/** The first line of the build that runs: the mark a check names the build by. */
	buildMark() {
		return this.cdp.eval(`(async () => (await app.vault.adapter.read(app.vault.configDir + "/plugins/${PLUGIN_ID}/main.js")).split("\\n")[0])()`);
	}

	/** The desktop window or Obsidian's phone view (390×844, `app.emulateMobile`), which reloads the window. */
	async platform(kind) {
		const phone = kind === "phone";
		const size = phone ? PHONE : DESKTOP;
		const isPhone = await this.cdp.eval(`app.isMobile`);
		await this.cdp.eval(`(() => { const w = require("@electron/remote").getCurrentWindow(); w.setContentSize(${size.width}, ${size.height}); w.setPosition(${OFF_SCREEN.x}, ${OFF_SCREEN.y}, false); return 1 })()`);
		if (isPhone !== phone) {
			await this.cdp.eval(`setTimeout(() => app.emulateMobile(${phone}), 30); 1`);
			await sleep(3000);
			await this.connect();
		}
		await this.cdp.eval(`(() => { app.workspace.leftSplit?.collapse(); app.workspace.rightSplit?.collapse(); return 1 })()`);
	}

	/** Obsidian's dark or light theme, as the person switches it. */
	async theme(kind) {
		await this.cdp.eval(`(() => { app.changeTheme("${kind === "light" ? "moonstone" : "obsidian"}"); return 1 })()`);
		await sleep(400);
	}

	/** The plugin's view open in a tab of its own, alone in the main area. */
	async openView() {
		await this.cdp.eval(`(async () => {
			for (const leaf of app.workspace.getLeavesOfType("markdown")) leaf.detach();
			for (const leaf of app.workspace.getLeavesOfType("task-calendar")) leaf.detach();
			await app.commands.executeCommandById("task-calendar:open");
			return 1;
		})()`);
		await sleep(800);
	}

	/** Quits this instance only. */
	async quit() {
		await this.cdp?.eval(`setTimeout(() => require("@electron/remote").app.quit(), 50); 1`).catch(() => undefined);
		this.cdp?.close();
		this.cdp = null;
	}
}

export async function running(config = e2eConfig()) {
	return (await targets(config.port)).length > 0;
}
