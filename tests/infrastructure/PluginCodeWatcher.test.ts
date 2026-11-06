import { describe, expect, it, vi } from "vitest";
import { type PluginCodeHost, PluginCodeWatcher, SETTLE_MS } from "../../src/infrastructure/PluginCodeWatcher";

const DIR = ".obsidian/plugins/task-calendar";

function host(code: { size: number; mtime: number } | null) {
	const files = { code };
	const timers = new Map<number, () => void>();
	let next = 0;
	const h: PluginCodeHost & { files: typeof files; fire(): Promise<void> } = {
		files,
		stat: vi.fn(async (path: string) => (path === `${DIR}/main.js` ? files.code : null)),
		reload: vi.fn(async () => {}),
		setTimeout: vi.fn((run: () => void, ms: number) => {
			expect(ms).toBe(SETTLE_MS);
			timers.set(++next, run);
			return next;
		}),
		clearTimeout: vi.fn((id: number) => void timers.delete(id)),
		async fire() {
			const runs = [...timers.values()];
			timers.clear();
			runs.forEach((run) => run());
			await new Promise((r) => setTimeout(r, 0));
		},
	};
	return h;
}

describe("the plugin's code on disk", () => {
	it("loads the plugin again once Sync has brought a new main.js and stopped writing", async () => {
		const h = host({ size: 100, mtime: 1 });
		const watcher = new PluginCodeWatcher(h, DIR);
		await watcher.start();
		h.files.code = { size: 120, mtime: 2 };
		watcher.changed(`${DIR}/manifest.json`);
		watcher.changed(`${DIR}/main.js`);
		expect(h.reload).not.toHaveBeenCalled();
		await h.fire();
		expect(h.reload).toHaveBeenCalledTimes(1);
	});

	it("waits for the last file: each write puts the check off again", async () => {
		const h = host({ size: 100, mtime: 1 });
		const watcher = new PluginCodeWatcher(h, DIR);
		await watcher.start();
		watcher.changed(`${DIR}/manifest.json`);
		watcher.changed(`${DIR}/main.js`);
		expect(h.clearTimeout).toHaveBeenCalledTimes(1);
	});

	it("keeps running when the code is the one it loaded", async () => {
		const h = host({ size: 100, mtime: 1 });
		const watcher = new PluginCodeWatcher(h, DIR);
		await watcher.start();
		watcher.changed(`${DIR}/styles.css`);
		await h.fire();
		await watcher.check();
		expect(h.reload).not.toHaveBeenCalled();
	});

	it("is not woken by its settings or by other plugins' files", async () => {
		const h = host({ size: 100, mtime: 1 });
		const watcher = new PluginCodeWatcher(h, DIR);
		await watcher.start();
		watcher.changed(`${DIR}/data.json`);
		watcher.changed(".obsidian/plugins/task-calendar-other/main.js");
		watcher.changed("TODOs Tasks.md");
		expect(h.setTimeout).not.toHaveBeenCalled();
	});

	it("finds new code on a check of its own, as the phone comes back to Obsidian", async () => {
		const h = host({ size: 100, mtime: 1 });
		const watcher = new PluginCodeWatcher(h, DIR);
		await watcher.start();
		h.files.code = { size: 100, mtime: 5 };
		await watcher.check();
		expect(h.reload).toHaveBeenCalledTimes(1);
	});

	it("loads again once, however many checks follow", async () => {
		const h = host({ size: 100, mtime: 1 });
		const watcher = new PluginCodeWatcher(h, DIR);
		await watcher.start();
		h.files.code = { size: 130, mtime: 3 };
		await Promise.all([watcher.check(), watcher.check()]);
		await watcher.check();
		expect(h.reload).toHaveBeenCalledTimes(1);
	});

	it("does nothing while main.js is missing, or after it stops", async () => {
		const h = host({ size: 100, mtime: 1 });
		const watcher = new PluginCodeWatcher(h, DIR);
		await watcher.start();
		h.files.code = null;
		await watcher.check();
		watcher.stop();
		h.files.code = { size: 1, mtime: 9 };
		await watcher.check();
		expect(h.reload).not.toHaveBeenCalled();
	});
});
