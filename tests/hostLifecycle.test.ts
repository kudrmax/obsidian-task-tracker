// @vitest-environment happy-dom
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TaskKey } from "../core/application/contracts";
import type { HostSession, Program } from "../obsidian/runtime/Runtime";
import { LeakCounter } from "./helpers/LeakCounter";
import { harness, type Harness } from "./runtime/harness";

/**
 * P8: every host, mounted and unmounted (mid-gesture too), leaves no listener, observer, scope, timer or subscription,
 * and a carry it started ends. The hosts (the note block, the leaf, the settings tab) join `HOSTS` as slices 3, 4 and 6
 * build them; until then the reference host stands for them and proves the counter.
 */

/** What a host is handed in the test: its runtime session, its element, and Obsidian's app as far as hosts touch it. */
export interface HostContext {
	readonly session: HostSession;
	readonly parent: HTMLElement;
	readonly app: { readonly keymap: { pushScope(scope: unknown): void; popScope(scope: unknown): void }; readonly workspace: FakeEvents };
	/** A task a gesture may lift. */
	readonly key: TaskKey;
}

export interface MountedHost {
	/** Starts a gesture that holds something (a lift that starts a carry) and leaves it under way. */
	startGesture(): void;
	unmount(): void;
}

export interface HostCase {
	readonly name: string;
	/** Its file's path under `obsidian/ui/next/host/` (`leaf/Leaf.tsx`), or null for the reference host. */
	readonly file: string | null;
	mount(context: HostContext): MountedHost;
}

/** Obsidian's `Events` as hosts use it: `on` answers a reference, `offref` drops it. */
export class FakeEvents {
	private readonly handlers = new Map<object, { name: string; callback: () => void }>();
	on(name: string, callback: () => void): object {
		const ref = {};
		this.handlers.set(ref, { name, callback });
		return ref;
	}
	offref(ref: object): void {
		this.handlers.delete(ref);
	}
	trigger(name: string): void {
		for (const h of this.handlers.values()) if (h.name === name) h.callback();
	}
}

type Kind = "store" | "subscription" | "element listener" | "window listener" | "observer" | "interval" | "frame" | "scope" | "event ref" | "gesture listeners" | "carry";

/**
 * A host as P8 asks one to be: it makes every kind of living thing a host makes, owns them and ends them all on unmount.
 * `forget` leaves one kind alive, so the counter can be shown to catch it.
 */
function referenceHost(forget: Kind | null = null): HostCase {
	return {
		name: forget ? `reference host forgetting its ${forget}` : "reference host",
		file: null,
		mount({ session, parent, app, key }) {
			const ends = new Map<Kind, () => void>();
			const own = (kind: Kind, end: () => void) => ends.set(kind, end);
			const el = parent.ownerDocument.createElement("div");
			parent.appendChild(el);
			const win = el.ownerDocument.defaultView!;
			const program: Program<number, { kind: "views" }> = { update: (m) => [m + 1, []], needs: () => [], viewsChanged: () => ({ kind: "views" }), fromRuntime: () => null };
			const store = session.store(program, 0, { render: (m) => void (el.textContent = String(m)) });
			store.flush();
			own("store", () => store.dispose());
			own("subscription", session.subscribe(() => undefined));
			const down = () => undefined;
			el.addEventListener("pointerdown", down);
			own("element listener", () => el.removeEventListener("pointerdown", down));
			const resize = () => undefined;
			win.addEventListener("resize", resize);
			own("window listener", () => win.removeEventListener("resize", resize));
			const observer = new win.ResizeObserver(() => undefined);
			observer.observe(el);
			own("observer", () => observer.disconnect());
			const interval = win.setInterval(() => undefined, 60_000);
			own("interval", () => win.clearInterval(interval));
			const frame = win.requestAnimationFrame(() => undefined);
			own("frame", () => win.cancelAnimationFrame(frame));
			const scope = {};
			app.keymap.pushScope(scope);
			own("scope", () => app.keymap.popScope(scope));
			const ref = app.workspace.on("css-change", () => undefined);
			own("event ref", () => app.workspace.offref(ref));
			return {
				startGesture() {
					const move = () => undefined;
					const doc = el.ownerDocument;
					doc.addEventListener("pointermove", move, { capture: true });
					doc.addEventListener("pointerup", move, { capture: true });
					own("gesture listeners", () => {
						doc.removeEventListener("pointermove", move, { capture: true });
						doc.removeEventListener("pointerup", move, { capture: true });
					});
					const answer = session.call("tasks.startCarry", [{ keys: [key] }, true]).answer;
					if (!answer.ok) throw new Error(answer.error.message);
				},
				unmount() {
					for (const [kind, end] of ends) if (kind !== forget) end();
					if (forget !== "carry" && forget !== "store" && forget !== "subscription") session.teardown();
					el.remove();
				},
			};
		},
	};
}

/** Every host of the new screens. A host file under `obsidian/ui/next/host/` must be here. */
const HOSTS: readonly HostCase[] = [referenceHost()];

/** Microtasks queued before now have run: one queued at teardown is gone by then, one that keeps queueing itself is not. */
const microtasksRun = async () => {
	for (let i = 0; i < 5; i++) await Promise.resolve();
};

const HOST_DIR = join(__dirname, "..", "obsidian/ui/next/host");

describe("every host leaves nothing alive", () => {
	let h: Harness;
	let leaks: LeakCounter;
	let workspace: FakeEvents;
	let context: HostContext;

	beforeEach(async () => {
		h = await harness();
		leaks = new LeakCounter(window);
		leaks.subscriptions(h.runtime, "subscribe", "runtime");
		workspace = leaks.events(new FakeEvents(), "workspace");
		const screen = h.runtime.read("tasks.screen", ["2026-11-15"]);
		if (!screen.ok) throw new Error(screen.error.message);
		const key = (screen.result as { inbox: { key: TaskKey }[] }).inbox[0].key;
		context = { session: h.runtime.openHost(), parent: document.body, app: { keymap: leaks.keymap, workspace }, key };
	});

	afterEach(async () => {
		leaks.uninstall();
		await h.runtime.unload();
	});

	it("knows every host there is", () => {
		const files = existsSync(HOST_DIR)
			? readdirSync(HOST_DIR, { recursive: true, encoding: "utf8" })
					.map((f) => f.split("\\").join("/"))
					.filter((f) => /\.tsx?$/.test(f) && !/\.d\.ts$/.test(f))
			: [];
		expect(files.filter((f) => !HOSTS.some((host) => host.file === f))).toEqual([]);
	});

	it.each(HOSTS.map((host) => [host.name, host] as const))("%s: mounted and unmounted", async (_, host) => {
		host.mount(context).unmount();
		await microtasksRun();
		expect(leaks.alive()).toEqual([]);
	});

	it.each(HOSTS.map((host) => [host.name, host] as const))("%s: unmounted mid-gesture, its carry ended", async (_, host) => {
		const mounted = host.mount(context);
		mounted.startGesture();
		expect(h.screens.get().carry).toBeDefined();
		mounted.unmount();
		await microtasksRun();
		expect(leaks.alive()).toEqual([]);
		expect(h.screens.get().carry).toBeUndefined();
		expect(h.runtime.replica.state.projectsScreen.carry).toBeUndefined();
	});

	describe("the counter catches each kind a host forgets", () => {
		const kinds: [Kind, RegExp][] = [
			["store", /runtime\.subscribe/],
			["subscription", /runtime\.subscribe/],
			["element listener", /listener pointerdown on <div/],
			["window listener", /listener resize on window/],
			["observer", /ResizeObserver observing 1/],
			["interval", /an interval/],
			["frame", /a frame/],
			["scope", /a key scope/],
			["event ref", /workspace\.on\("css-change"\)/],
			["gesture listeners", /listener pointermove on document/],
		];
		it.each(kinds)("%s", async (kind, named) => {
			const mounted = referenceHost(kind).mount(context);
			mounted.startGesture();
			mounted.unmount();
			await microtasksRun();
			expect(leaks.alive().join("\n")).toMatch(named);
		});

		it("a media query's listener, both kinds", () => {
			const query = window.matchMedia("(hover: hover)");
			query.addEventListener("change", () => undefined);
			query.addListener(() => undefined);
			expect(leaks.alive().filter((a) => a.includes("media query"))).toHaveLength(2);
		});

		it("a microtask that keeps queueing itself", async () => {
			let live = true;
			const again = () => {
				if (live) queueMicrotask(again);
			};
			queueMicrotask(again);
			await microtasksRun();
			expect(leaks.alive()).toContain("a microtask");
			live = false;
			await microtasksRun();
			expect(leaks.alive()).not.toContain("a microtask");
		});

		it("carry: a session never torn down leaves the carry in the device's storage", () => {
			const mounted = referenceHost("carry").mount(context);
			mounted.startGesture();
			mounted.unmount();
			expect(h.screens.get().carry).toBeDefined();
		});

		it("a once listener that fired, and a timeout that ran, are not alive", async () => {
			const el = document.createElement("div");
			el.addEventListener("click", () => undefined, { once: true });
			el.dispatchEvent(new Event("click"));
			await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
			expect(leaks.alive()).toEqual([]);
		});
	});
});

describe("the leak counter on what happy-dom lacks", () => {
	it("counts the visual viewport's listeners and idle callbacks once the window has them", () => {
		const win = window as unknown as { visualViewport?: EventTarget; requestIdleCallback?: (f: () => void) => number; cancelIdleCallback?: (id: number) => void };
		const had = { viewport: win.visualViewport, idle: win.requestIdleCallback, cancel: win.cancelIdleCallback };
		Object.defineProperty(window, "visualViewport", { value: new (window as unknown as { EventTarget: typeof EventTarget }).EventTarget(), configurable: true });
		win.requestIdleCallback = (f) => window.setTimeout(f, 1);
		win.cancelIdleCallback = (id) => window.clearTimeout(id);
		const leaks = new LeakCounter(window);
		try {
			win.visualViewport!.addEventListener("resize", () => undefined);
			const idle = win.requestIdleCallback!(() => undefined);
			expect(leaks.alive().join("\n")).toMatch(/visual viewport[\s\S]*idle callback|idle callback[\s\S]*visual viewport/);
			win.cancelIdleCallback!(idle);
			expect(leaks.alive().join("\n")).not.toMatch(/idle callback/);
		} finally {
			leaks.uninstall();
			Object.defineProperty(window, "visualViewport", { value: had.viewport, configurable: true });
			win.requestIdleCallback = had.idle;
			win.cancelIdleCallback = had.cancel;
		}
	});
});
