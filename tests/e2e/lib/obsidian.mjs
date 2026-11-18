import { execFileSync, spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Cdp, sleep, targets } from "./cdp.mjs";
import { fileText, mockFile } from "../../../obsidian/stand/mockData.ts";

const PROJECT_NOTE = "Заметка о доме";

/**
 * The test Obsidian the checks run in: its own profile and scratch vault, its own debugging port, its window kept off the
 * screen and never brought forward (`open -n -g`). Never `~/Obsidian`, never another instance: a port held by an
 * Obsidian of another profile stops the run.
 */

const VAULT_ID = "tce2e";
const ROOT = new URL("../../../", import.meta.url).pathname;

/**
 * What the checks run on (E2E_TARGET): the stand (the engine over its MockPort, docs/superpowers/specs/2026-11-18-ui-engine.md)
 * or the plugin (over a tasks file in the vault). Each names its plugin, its view, its build and how a check reaches its
 * services, its device settings and the tasks file's text; the screen's root is the same `.task-calendar` in both.
 */
export const TARGETS = {
	stand: {
		pluginId: "task-calendar-stand",
		viewType: "task-calendar-stand",
		openCommand: "task-calendar-stand:open",
		ribbonLabel: "Task Calendar Stand",
		build: join(ROOT, "build/stand"),
		buildScript: "build:stand",
		root: ".task-calendar",
		/** A scenario's setup: the ribbon of every open screen at a stop. */
		setStop: (stop) => `(() => { window.__tcStand.setStop(${JSON.stringify(stop)}); return 1; })()`,
		inMemory: true,
	},
	plugin: {
		pluginId: "task-calendar",
		viewType: "task-calendar",
		openCommand: "task-calendar:open",
		ribbonLabel: "Task Calendar",
		build: ROOT,
		buildScript: "build",
		root: ".task-calendar",
		setStop: (stop) => `app.plugins.plugins["task-calendar"].services.tasks.setFunnelPlace(${JSON.stringify(stop)}).then(() => 1)`,
		inMemory: false,
	},
};
/** Where the window stands: off every screen, so it never covers the person's work nor takes their input. */
const OFF_SCREEN = { x: -5000, y: 2000 };
export const DESKTOP = { width: 1280, height: 820 };
export const PHONE = { width: 390, height: 844 };

export function e2eConfig() {
	const dir = process.env.E2E_DIR ?? join(tmpdir(), "task-calendar-e2e");
	const target = TARGETS[process.env.E2E_TARGET ?? "stand"];
	if (!target) throw new Error(`E2E_TARGET is stand or plugin, not ${process.env.E2E_TARGET}`);
	return { dir, port: Number(process.env.E2E_PORT ?? 9447), vault: join(dir, "vault"), user: join(dir, "obsidian-user"), out: process.env.E2E_OUT ?? join(dir, "out"), target };
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

	get target() {
		return this.config.target;
	}

	get tasksPath() {
		return join(this.config.vault, "TODOs Tasks.md");
	}

	/** The project note: on the stand it holds the stand's block, the plugin puts its own at the note's end. */
	get notePath() {
		return `${PROJECT_NOTE}.md`;
	}

	/** The scratch vault and the profile that knows it; only the target's plugin is on (the other is off in this vault). */
	prepare() {
		const { vault, user, out, target } = this.config;
		for (const dir of [join(vault, ".obsidian", "plugins", target.pluginId), user, out]) mkdirSync(dir, { recursive: true });
		const obsidian = join(vault, ".obsidian");
		writeFileSync(join(obsidian, "community-plugins.json"), JSON.stringify([target.pluginId]));
		if (!existsSync(join(obsidian, "app.json"))) writeFileSync(join(obsidian, "app.json"), "{}");
		writeFileSync(join(user, "obsidian.json"), JSON.stringify({ vaults: { [VAULT_ID]: { path: vault, ts: 1, open: true } } }));
		writeFileSync(join(user, `${VAULT_ID}.json`), JSON.stringify({ ...OFF_SCREEN, ...DESKTOP, isMaximized: false, devTools: false, zoom: 0 }));
		writeFileSync(join(vault, this.notePath), target.inMemory ? "Дом.\n\n```task-calendar-stand\n```\n" : "Дом.\n");
	}

	/** Fresh made-up tasks around now: the stand's in memory, or the plugin's tasks file in the vault. */
	async newTasks() {
		if (this.target.inMemory) await this.cdp.eval(`(() => { window.__tcStand.reset(); return 1; })()`);
		else {
			const now = new Date();
			writeFileSync(this.tasksPath, fileText(mockFile(now), now));
		}
	}

	/** The tasks file's text as it stands: the user's truth the checks read. */
	async fileText() {
		if (this.target.inMemory) return this.cdp.eval(`window.__tcStand.fileText()`);
		return readFileSync(this.tasksPath, "utf8");
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
		const { pluginId } = this.target;
		const other = Object.values(TARGETS).find((t) => t.pluginId !== pluginId).pluginId;
		await this.cdp.eval(`(async () => { if (app.plugins.enabledPlugins.has("${other}")) await app.plugins.disablePluginAndSave("${other}"); if (!app.plugins.enabledPlugins.has("${pluginId}")) await app.plugins.enablePluginAndSave("${pluginId}"); return 1 })()`);
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

	/** The target's build (or `from`), copied in and loaded again. */
	async deploy(from = this.target.build) {
		const { pluginId, viewType } = this.target;
		const into = join(this.config.vault, ".obsidian", "plugins", pluginId);
		for (const file of ["main.js", "manifest.json", "styles.css"]) copyFileSync(join(from, file), join(into, file));
		const loaded = await this.cdp.eval(`(async () => { app.workspace.getLeavesOfType("${viewType}").forEach((l) => l.detach()); await app.plugins.disablePlugin("${pluginId}"); await app.plugins.loadManifests(); await app.plugins.enablePlugin("${pluginId}"); return !!app.plugins.plugins["${pluginId}"] })()`);
		if (!loaded) throw new Error("the plugin did not load: see the test Obsidian's console");
	}

	/** The first line of the build that runs: the mark a check names the build by. */
	buildMark() {
		return this.cdp.eval(`(async () => (await app.vault.adapter.read(app.vault.configDir + "/plugins/${this.target.pluginId}/main.js")).split("\\n")[0])()`);
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
		/** The vault's setting, as Settings › Appearance writes it: a vault that follows the system ignores `changeTheme` alone. */
		const ok = await this.cdp.eval(`(() => { app.vault.setConfig("theme", "${kind === "light" ? "moonstone" : "obsidian"}"); app.updateTheme(); return document.body.classList.contains("theme-${kind}") })()`);
		if (!ok) throw new Error(`the ${kind} theme did not apply`);
		await sleep(400);
	}

	/** The plugin's view open in a tab of its own, alone in the main area. */
	async openView() {
		await this.cdp.eval(`(async () => {
			const keep = app.workspace.getMostRecentLeaf(app.workspace.rootSplit) ?? app.workspace.getLeaf(true);
			const others = [];
			app.workspace.iterateRootLeaves((leaf) => { if (leaf !== keep) others.push(leaf); });
			for (const leaf of others) leaf.detach();
			await keep.setViewState({ type: "empty" });
			await keep.setViewState({ type: "${this.target.viewType}", active: true });
			app.workspace.setActiveLeaf(keep, { focus: false });
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
