/**
 * What a host leaves alive (P8): DOM listeners, observers, timers and frames, Obsidian's key scopes and event
 * references, and any subscription that answers its unsubscribe. Installed over a window before a host mounts; after it
 * unmounts, `alive()` names everything it started and did not end. The hosts of slices 3 and 4 (the note block, the
 * leaf, the settings tab) run under it in `tests/hostLifecycle.test.ts`.
 *
 * Use:
 *   const leaks = new LeakCounter(window); // patches the window's EventTarget, observers and timers
 *   const vault = leaks.events(fakeVault, "vault");                 // Obsidian's on/offref
 *   const runtime = leaks.subscriptions(runtime, "subscribe", "runtime"); // a method answering its unsubscribe
 *   leaks.keymap                                                     // pushScope/popScope for a host's scopes
 *   …mount, act, unmount…
 *   expect(leaks.alive()).toEqual([]);
 *   leaks.uninstall();
 */

type Listener = EventListenerOrEventListenerObject;

interface Restorable {
	restore(): void;
}

const capture = (options?: boolean | AddEventListenerOptions | EventListenerOptions): boolean => (typeof options === "boolean" ? options : options?.capture === true);

export class LeakCounter {
	private readonly listeners = new Map<string, { target: EventTarget; type: string; listener: Listener; capture: boolean }>();
	private readonly observers = new Map<object, { kind: string; targets: Set<unknown> }>();
	private readonly timers = new Map<string, string>();
	private readonly scopes = new Set<unknown>();
	private readonly refs = new Map<unknown, string>();
	private readonly subscribed = new Map<symbol, string>();
	private readonly patches: Restorable[] = [];
	private readonly ids = new WeakMap<object, number>();
	private nextId = 1;
	/** Inside a counted call: what the platform adds itself (an abort listener of its own) is not the host's. */
	private depth = 0;

	constructor(private readonly win: Window & typeof globalThis) {
		this.patchListeners();
		for (const kind of ["ResizeObserver", "MutationObserver", "IntersectionObserver"] as const) this.patchObserver(kind);
		this.patchTimers();
		this.patchMediaListeners();
		this.patchMicrotasks();
	}

	/** Obsidian's key scopes, as `app.keymap`: a scope pushed and never popped is alive. */
	readonly keymap = {
		pushScope: (scope: unknown) => void this.scopes.add(scope),
		popScope: (scope: unknown) => void this.scopes.delete(scope),
	};

	/** An Obsidian `Events` (the vault, the workspace, the metadata cache): a reference `on` gave and `offref` never took is alive. */
	events<T extends { on(...args: never[]): unknown; offref(ref: never): void }>(target: T, label: string): T {
		const on = target.on.bind(target) as (...args: unknown[]) => unknown;
		const offref = target.offref.bind(target) as (ref: unknown) => void;
		const refs = this.refs;
		(target as { on: unknown }).on = (...args: unknown[]) => {
			const ref = on(...args);
			refs.set(ref, `${label}.on("${String(args[0])}")`);
			return ref;
		};
		(target as { offref: unknown }).offref = (ref: unknown) => {
			refs.delete(ref);
			offref(ref);
		};
		return target;
	}

	/** A method answering its unsubscribe (`runtime.subscribe`, `settings.onChange`…): one never called back is alive. */
	subscriptions<T extends object, K extends keyof T>(target: T, method: K, label: string): T {
		const original = (target[method] as unknown as (...args: unknown[]) => () => void).bind(target);
		const subscribed = this.subscribed;
		(target as Record<K, unknown>)[method] = (...args: unknown[]) => {
			const off = original(...args);
			const key = Symbol(label);
			subscribed.set(key, `${label}.${String(method)}`);
			return () => {
				subscribed.delete(key);
				off();
			};
		};
		return target;
	}

	/** Everything started since install and not ended, one line each. */
	alive(): string[] {
		return [
			...[...this.listeners.values()].map((l) => `listener ${l.type} on ${this.name(l.target)}`),
			...[...this.observers.values()].filter((o) => o.targets.size > 0).map((o) => `${o.kind} observing ${o.targets.size}`),
			...this.timers.values(),
			...[...this.scopes].map(() => "a key scope pushed"),
			...this.refs.values(),
			...this.subscribed.values(),
		];
	}

	uninstall(): void {
		this.patches.splice(0).reverse().forEach((p) => p.restore());
	}

	/** Every target of the window's world (the window, its nodes, a media query, the visual viewport): not an abort signal, the test runner's own. */
	private counts(target: EventTarget): boolean {
		const signals = [this.win.AbortSignal, globalThis.AbortSignal].filter((c): c is typeof AbortSignal => typeof c === "function");
		return !signals.some((Signal) => target instanceof Signal);
	}

	private name(target: EventTarget): string {
		if (target === this.win) return "window";
		if (target === this.win.document) return "document";
		const element = target as Partial<Element>;
		if (target === (this.win as { visualViewport?: unknown }).visualViewport) return "the visual viewport";
		const media = (target as { media?: unknown }).media;
		if (typeof media === "string") return `the media query ${media}`;
		if (typeof element.tagName === "string") return `<${element.tagName.toLowerCase()}${element.className ? ` class="${element.className}"` : ""}>`;
		return "an event target";
	}

	private id(o: object): number {
		let id = this.ids.get(o);
		if (id === undefined) this.ids.set(o, (id = this.nextId++));
		return id;
	}

	private patch<T extends object, K extends keyof T>(target: T, key: K, make: (original: T[K]) => T[K]): void {
		const original = target[key];
		target[key] = make(original);
		this.patches.push({ restore: () => void (target[key] = original) });
	}

	/** Every prototype on the way from the window, its document and an element to Object that defines its own `addEventListener`. */
	private listenerPrototypes(): EventTarget[] {
		const found = new Set<EventTarget>();
		const viewport = (this.win as { visualViewport?: object | null }).visualViewport;
		const media = typeof this.win.matchMedia === "function" ? this.win.matchMedia("all") : null;
		for (const start of [this.win, this.win.document, this.win.document.createElement("div"), this.win.EventTarget.prototype, viewport, media].filter((o): o is object => !!o))
			for (let proto = Object.getPrototypeOf(start) as object | null; proto; proto = Object.getPrototypeOf(proto) as object | null)
				if (Object.prototype.hasOwnProperty.call(proto, "addEventListener")) found.add(proto as EventTarget);
		if (Object.prototype.hasOwnProperty.call(this.win, "addEventListener")) found.add(this.win);
		return [...found];
	}

	private patchListeners(): void {
		for (const proto of this.listenerPrototypes()) this.patchListenersOf(proto);
	}

	private patchListenersOf(proto: EventTarget): void {
		const listeners = this.listeners;
		const counter = this;
		const key = (target: EventTarget, type: string, listener: Listener, captured: boolean) => `${this.id(target)} ${type} ${this.id(listener as object)} ${captured}`;
		this.patch(proto, "addEventListener", (add) =>
			function (this: EventTarget, type: string, listener: Listener | null, options?: boolean | AddEventListenerOptions) {
				if (counter.depth > 0 || !counter.counts(this)) return add.call(this, type, listener, options);
				counter.depth++;
				try {
				if (listener) {
					const k = key(this, type, listener, capture(options));
					listeners.set(k, { target: this, type, listener, capture: capture(options) });
					const signal = typeof options === "object" ? options.signal : undefined;
					signal?.addEventListener("abort", () => listeners.delete(k));
					if (typeof options === "object" && options.once) add.call(this, type, () => listeners.delete(k), { once: true, capture: capture(options) });
				}
				return add.call(this, type, listener, options);
				} finally {
					counter.depth--;
				}
			},
		);
		this.patch(proto, "removeEventListener", (remove) =>
			function (this: EventTarget, type: string, listener: Listener | null, options?: boolean | EventListenerOptions) {
				if (listener) listeners.delete(key(this, type, listener, capture(options)));
				return remove.call(this, type, listener, options);
			},
		);
	}

	private patchObserver(kind: "ResizeObserver" | "MutationObserver" | "IntersectionObserver"): void {
		const Original = (this.win as unknown as Record<string, unknown>)[kind] as (new (...args: never[]) => { observe(t: unknown, o?: unknown): void; disconnect(): void; unobserve?(t: unknown): void }) | undefined;
		const observers = this.observers;
		const Counted = class {
			private readonly inner: InstanceType<NonNullable<typeof Original>> | null;
			private readonly record = { kind, targets: new Set<unknown>() };
			constructor(...args: never[]) {
				this.inner = Original ? new Original(...args) : null;
				observers.set(this, this.record);
			}
			observe(target: unknown, options?: unknown): void {
				this.record.targets.add(target);
				this.inner?.observe(target, options);
			}
			unobserve(target: unknown): void {
				this.record.targets.delete(target);
				this.inner?.unobserve?.(target);
			}
			disconnect(): void {
				this.record.targets.clear();
				this.inner?.disconnect();
			}
			takeRecords(): unknown[] {
				return (this.inner as unknown as { takeRecords?(): unknown[] })?.takeRecords?.() ?? [];
			}
		};
		this.patch(this.win as unknown as Record<string, unknown>, kind, () => Counted);
		if (globalThis !== (this.win as unknown)) this.patch(globalThis as unknown as Record<string, unknown>, kind, () => Counted);
	}

	private patchTimers(): void {
		const timers = this.timers;
		const pairs = [
			["setTimeout", "clearTimeout", "a timeout", true],
			["setInterval", "clearInterval", "an interval", false],
			["requestAnimationFrame", "cancelAnimationFrame", "a frame", true],
			["requestIdleCallback", "cancelIdleCallback", "an idle callback", true],
		] as const;
		const targets = globalThis === (this.win as unknown) ? [this.win] : [this.win, globalThis as unknown as Window & typeof globalThis];
		for (const target of targets)
			for (const [set, clear, what, once] of pairs) {
				const host = target as unknown as Record<string, unknown>;
				if (typeof host[set] !== "function") continue;
				this.patch(host, set, (original) =>
					((fn: (...a: unknown[]) => void, ...rest: unknown[]) => {
						let handle: unknown;
						const wrapped = (...a: unknown[]) => {
							if (once) timers.delete(`${set} ${String(handle)}`);
							fn(...a);
						};
						handle = (original as (...a: unknown[]) => unknown).call(target, wrapped, ...rest);
						timers.set(`${set} ${String(handle)}`, what);
						return handle;
					}) as unknown,
				);
				this.patch(host, clear, (original) =>
					((handle: unknown) => {
						timers.delete(`${set} ${String(handle)}`);
						return (original as (h: unknown) => unknown).call(target, handle);
					}) as unknown,
				);
			}
	}

	/** A media query's old listeners (`addListener`), which Safari and older code still use. */
	private patchMediaListeners(): void {
		if (typeof this.win.matchMedia !== "function") return;
		const proto = Object.getPrototypeOf(this.win.matchMedia("all")) as Record<string, unknown>;
		if (typeof proto.addListener !== "function") return;
		const listeners = this.listeners;
		const counter = this;
		const key = (target: object, listener: unknown) => `${counter.id(target)} change ${counter.id(listener as object)} legacy`;
		this.patch(proto, "addListener", (add) =>
			function (this: MediaQueryList, listener: unknown) {
				if (listener) listeners.set(key(this, listener), { target: this, type: "change", listener: listener as Listener, capture: false });
				counter.depth++;
				try {
					return (add as (l: unknown) => unknown).call(this, listener);
				} finally {
					counter.depth--;
				}
			},
		);
		this.patch(proto, "removeListener", (remove) =>
			function (this: MediaQueryList, listener: unknown) {
				if (listener) listeners.delete(key(this, listener));
				counter.depth++;
				try {
					return (remove as (l: unknown) => unknown).call(this, listener);
				} finally {
					counter.depth--;
				}
			},
		);
	}

	/** A microtask queued and not yet run: it runs after the host is gone. */
	private patchMicrotasks(): void {
		const timers = this.timers;
		let next = 0;
		const targets = globalThis === (this.win as unknown) ? [this.win] : [this.win, globalThis as unknown as Window & typeof globalThis];
		for (const target of targets) {
			const host = target as unknown as Record<string, unknown>;
			if (typeof host.queueMicrotask !== "function") continue;
			this.patch(host, "queueMicrotask", (original) =>
				((fn: () => void) => {
					const id = `microtask ${next++}`;
					timers.set(id, "a microtask");
					return (original as (f: () => void) => void).call(target, () => {
						timers.delete(id);
						fn();
					});
				}) as unknown,
			);
		}
	}
}
