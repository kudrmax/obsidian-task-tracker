import { describe, expect, it } from "vitest";
import type { Program } from "../../obsidian/runtime/dispatch/Program";
import { Store } from "../../obsidian/runtime/dispatch/Store";
import { DAY, FILE, harness, ok, PATH, settle } from "./harness";

const macrotask = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("the runtime's life", () => {
	it("unloaded before the host was ready: ready() resolves, and nothing is watched or timed when readiness comes late", async () => {
		const { runtime, vault, timers } = await harness({ ready: false });
		runtime.hostReady("layout");
		await runtime.unload();
		await expect(runtime.ready()).resolves.toBeUndefined();
		runtime.hostReady("metadata");
		await macrotask();
		expect(vault.listenerCount).toBe(0);
		expect(timers.pending.size).toBe(0);
		expect(runtime.replica.state.tasks).toBeNull();
	});

	it("unloaded while the file is being read: what the start set up is undone, and the clock never starts", async () => {
		const { runtime, vault, timers } = await harness({ ready: false });
		let open!: () => void;
		vault.readGate = new Promise((resolve) => (open = resolve));
		runtime.hostReady("layout");
		runtime.hostReady("metadata");
		await macrotask();
		await runtime.unload();
		open();
		await runtime.ready();
		await macrotask();
		expect(vault.listenerCount).toBe(0);
		expect(timers.pending.size).toBe(0);
	});

	it("rejects ready() when building the replica failed", async () => {
		const { runtime } = await harness({
			ready: false,
			projects: {
				list: () => {
					throw new Error("metadata cache gone");
				},
				ready: () => true,
				onChange: () => () => undefined,
			},
		});
		runtime.hostReady("layout");
		runtime.hostReady("metadata");
		await expect(runtime.ready()).rejects.toThrow("metadata cache gone");
	});

	it("runs the one move to projects once the host's notes are complete, mid-session (decision 8)", async () => {
		let complete = false;
		const listeners = new Set<() => void>();
		const old = FILE.replace("- [ ] Idea", "- [ ] Idea 🗂️ [[Notes/Alpha]]").replace("## Projects\n\n- Дружба\n\t- Small talk\n\n", "");
		const { runtime, vault } = await harness({
			file: old,
			projects: { list: () => [], ready: () => complete, onChange: (l) => (listeners.add(l), () => listeners.delete(l)) },
		});
		expect(runtime.replica.state.projectsReady).toBe(false);
		expect(vault.text(PATH)).toContain("[[Notes/Alpha]]");
		complete = true;
		listeners.forEach((l) => l());
		await settle(runtime);
		expect(runtime.replica.state.projectsReady).toBe(true);
		expect(vault.text(PATH)).toContain("- [ ] Idea 🗂️ Alpha");
		expect(vault.text(PATH)).toContain("## Projects");
	});
});

describe("a store mounted", () => {
	it("draws its first frame on its own, with the views it needs, no message needed", async () => {
		const { runtime } = await harness();
		const drawn: unknown[] = [];
		const program: Program<{ views: number }, { kind: "views" }> = {
			update: (model) => [{ views: model.views + 1 }, []],
			needs: () => [{ key: "screen", method: "tasks.screen", args: [DAY] }],
			viewsChanged: () => ({ kind: "views" }),
			fromRuntime: () => null,
		};
		new Store(program, { views: 0 }, runtime, { render: (m) => drawn.push(m) });
		expect(drawn).toEqual([]);
		await Promise.resolve();
		expect(drawn).toEqual([{ views: 1 }]);
	});

	it("draws at once when its host flushes it inside the mounting event", async () => {
		const { runtime } = await harness();
		const drawn: unknown[] = [];
		const program: Program<number, never> = { update: (m) => [m, []], needs: () => [], viewsChanged: () => undefined as never, fromRuntime: () => null };
		new Store(program, 0, runtime, { render: (m) => drawn.push(m) }).flush();
		expect(drawn).toEqual([0]);
		ok({ ok: true });
	});
});
