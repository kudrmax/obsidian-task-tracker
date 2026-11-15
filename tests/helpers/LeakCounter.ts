/**
 * What a host leaves alive (P8): DOM listeners (added or set as an `on…` property), observers, timers, frames, idle
 * callbacks, immediates and queued microtasks, running animations, Obsidian's key scopes and event references, and any
 * subscription that answers its unsubscribe. Installed over a window before a host mounts; after it
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
 *
 * A promise's reactions are not counted, and need not be: a chain of them either ends (it has run by the time the test
 * awaits the queued microtasks) or keeps queueing itself, and then the event loop never reaches a macrotask again, so
 * the test never finishes and fails on its timeout. A promise left waiting forever holds nothing alive but what
 * something else (a listener, a timer, a subscription) would have to resolve, and that is counted.
 */

type Listener = EventListenerOrEventListenerObject;

interface Restorable {
	restore(): void;
}

const capture = (options?: boolean | AddEventListenerOptions | EventListenerOptions): boolean => (typeof options === "boolean" ? options : options?.capture === true);

export class LeakCounter {
	private readonly listeners = new Map<string, { target: EventTarget; type: string; listener: Listener; capture: boolean }>();
	private readonly observers = new Map<object, { kind: string; targets: Set<unknown> }>();
	/** What runs later, by pool: a handle is cleared within its pool (`clearTimeout` clears an interval: one pool in browsers). */
	private readonly pending = new Map<string, Map<unknown, string>>();
	/** `on…` properties set before install (Obsidian's own, the test runner's): never the host's. */
	private readonly handlersBefore = new WeakMap<object, Map<string, unknown>>();
	private readonly mediaQueries: WeakRef<object>[] = [];
	private readonly animations = new Set<{ playState: string; effect?: { target?: unknown } | null; constructor: { name: string } }>();
	private readonly animationsBefore = new Set<unknown>();
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
		if (typeof (this.win as unknown as Record<string, unknown>).PerformanceObserver === "function") this.patchObserver("PerformanceObserver");
		this.patchTimers();
		this.patchMediaListeners();
		this.patchMicrotasks();
		this.patchAnimations();
		this.patchMatchMedia();
		for (const target of this.handlerTargets()) this.handlersBefore.set(target, this.handlersOf(target));
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
			...this.handlerProperties(),
			...[...this.observers.values()].filter((o) => o.targets.size > 0).map((o) => `${o.kind} observing ${o.targets.size}`),
			...[...this.pending.values()].flatMap((pool) => [...pool.values()]),
			...this.runningAnimations(),
			...[...this.scopes].map(() => "a key scope pushed"),
			...this.refs.values(),
			...this.subscribed.values(),
		];
	}

	/** Where an `on…` handler keeps something alive: the window, its document and every element in it, the visual viewport, the media queries asked. */
	private handlerTargets(): object[] {
		const viewport = (this.win as { visualViewport?: object | null }).visualViewport;
		const media = this.mediaQueries.map((r) => r.deref()).filter((m): m is object => !!m);
		return [this.win, this.win.document, ...Array.from(this.win.document.querySelectorAll("*")), ...(viewport ? [viewport] : []), ...media];
	}

	/** The `on…` properties holding a function, own or inherited, on one target. */
	private handlersOf(target: object): Map<string, unknown> {
		const names = new Set<string>();
		for (let o: object | null = target; o && o !== Object.prototype; o = Object.getPrototypeOf(o) as object | null)
			for (const name of Object.getOwnPropertyNames(o)) if (/^on[a-z]+$/.test(name)) names.add(name);
		const out = new Map<string, unknown>();
		for (const name of names) {
			let value: unknown;
			try {
				value = (target as Record<string, unknown>)[name];
			} catch {
				continue;
			}
			if (typeof value === "function" || (typeof value === "object" && value !== null)) out.set(name, value);
		}
		return out;
	}

	private handlerProperties(): string[] {
		return this.handlerTargets().flatMap((target) => {
			const before = this.handlersBefore.get(target);
			return [...this.handlersOf(target)].filter(([name, value]) => before?.get(name) !== value).map(([name]) => `a handler property ${name} on ${this.name(target as EventTarget)}`);
		});
	}

	/** Animations started since install that still run or wait (an infinite one never ends by itself). */
	private runningAnimations(): string[] {
		const doc = this.win.document as Document & { getAnimations?: () => unknown[] };
		const all = new Set<unknown>([...this.animations, ...(typeof doc.getAnimations === "function" ? doc.getAnimations() : []).filter((a) => !this.animationsBefore.has(a))]);
		return [...all]
			.map((a) => a as { playState: string; effect?: { target?: unknown } | null; constructor: { name: string } })
			.filter((a) => a.playState === "running" || a.playState === "paused")
			.map((a) => `an animation ${a.playState} (${a.constructor.name}${a.effect?.target ? ` on ${this.name(a.effect.target as EventTarget)}` : ""})`);
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

	private patchObserver(kind: "ResizeObserver" | "MutationObserver" | "IntersectionObserver" | "PerformanceObserver"): void {
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

	private pool(name: string): Map<unknown, string> {
		let pool = this.pending.get(name);
		if (!pool) this.pending.set(name, (pool = new Map()));
		return pool;
	}

	/**
	 * Timeouts and intervals share one pool of handles (a browser's `clearTimeout` clears an interval, and the other way);
	 * frames, idle callbacks and Node's immediates each have their own. A handle is kept as it is (Node's are objects).
	 */
	private patchTimers(): void {
		const pairs = [
			["setTimeout", "clearTimeout", "timer", "a timeout", true],
			["setInterval", "clearInterval", "timer", "an interval", false],
			["requestAnimationFrame", "cancelAnimationFrame", "frame", "a frame", true],
			["requestIdleCallback", "cancelIdleCallback", "idle", "an idle callback", true],
			["setImmediate", "clearImmediate", "immediate", "an immediate", true],
		] as const;
		const targets = globalThis === (this.win as unknown) ? [this.win] : [this.win, globalThis as unknown as Window & typeof globalThis];
		for (const target of targets)
			for (const [set, clear, poolName, what, once] of pairs) {
				const host = target as unknown as Record<string, unknown>;
				if (typeof host[set] !== "function") continue;
				const pool = this.pool(`${poolName} ${targets.indexOf(target)}`);
				this.patch(host, set, (original) =>
					((fn: (...a: unknown[]) => void, ...rest: unknown[]) => {
						let handle: unknown;
						const wrapped = (...a: unknown[]) => {
							if (once) pool.delete(handle);
							if (typeof fn === "function") fn(...a);
						};
						handle = (original as (...a: unknown[]) => unknown).call(target, wrapped, ...rest);
						pool.set(handle, what);
						return handle;
					}) as unknown,
				);
				if (typeof host[clear] !== "function") continue;
				this.patch(host, clear, (original) =>
					((handle: unknown) => {
						pool.delete(handle);
						return (original as (h: unknown) => unknown).call(target, handle);
					}) as unknown,
				);
			}
	}

	/** Every animation an element starts (`animate`), tracked to its end; the ones already running at install are not the host's. */
	private patchAnimations(): void {
		const doc = this.win.document as Document & { getAnimations?: () => unknown[] };
		if (typeof doc.getAnimations === "function") for (const a of doc.getAnimations()) this.animationsBefore.add(a);
		const proto = (this.win as unknown as { Element: { prototype: Record<string, unknown> } }).Element.prototype;
		if (typeof proto.animate !== "function") return;
		const animations = this.animations;
		this.patch(proto, "animate", (animate) =>
			function (this: Element, ...args: unknown[]) {
				const animation = (animate as (...a: unknown[]) => { playState: string; effect?: { target?: unknown } | null; constructor: { name: string } }).apply(this, args);
				animations.add(animation);
				return animation;
			} as unknown as Record<string, unknown>[string],
		);
	}

	/** The media queries asked, so a handler property left on one is seen. */
	private patchMatchMedia(): void {
		const host = this.win as unknown as Record<string, unknown>;
		if (typeof host.matchMedia !== "function") return;
		const queries = this.mediaQueries;
		this.patch(host, "matchMedia", (matchMedia) =>
			((query: string) => {
				const list = (matchMedia as (q: string) => object).call(this.win, query);
				queries.push(new WeakRef(list));
				return list;
			}) as unknown,
		);
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
		const timers = this.pool("microtask");
		let next = 0;
		const targets = globalThis === (this.win as unknown) ? [this.win] : [this.win, globalThis as unknown as Window & typeof globalThis];
		for (const target of targets) {
			const host = target as unknown as Record<string, unknown>;
			if (typeof host.queueMicrotask !== "function") continue;
			this.patch(host, "queueMicrotask", (original) =>
				((fn: () => void) => {
					const id = next++;
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
