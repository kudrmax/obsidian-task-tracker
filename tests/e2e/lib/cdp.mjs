/**
 * The Chrome DevTools Protocol over a page of the test Obsidian: commands, events, evaluation in the page. Node's own
 * WebSocket (Node 22+), no package.
 */

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The page targets the debugging port lists, or none while the app is not up. */
export async function targets(port) {
	try {
		const response = await fetch(`http://127.0.0.1:${port}/json/list`);
		return await response.json();
	} catch {
		return [];
	}
}

/** Obsidian's main window: its app page, not a pop-out or devtools. */
export const mainWindow = (target) => target.type === "page" && target.url.startsWith("app://obsidian.md/index.html");

export class Cdp {
	#ws;
	#id = 0;
	#pending = new Map();
	#listeners = new Map();

	constructor(ws, target) {
		this.#ws = ws;
		this.target = target;
		ws.onmessage = (message) => {
			const msg = JSON.parse(message.data);
			if (msg.id && this.#pending.has(msg.id)) {
				const { resolve, reject } = this.#pending.get(msg.id);
				this.#pending.delete(msg.id);
				if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
				else resolve(msg.result);
			} else if (msg.method) for (const listener of this.#listeners.get(msg.method) ?? []) listener(msg.params);
		};
		ws.onclose = () => {
			for (const { reject } of this.#pending.values()) reject(new Error("the page went away"));
			this.#pending.clear();
		};
	}

	/** Connects to the first target `match` accepts, waiting up to `timeoutMs` for one to appear. */
	static async connect(port, match = mainWindow, timeoutMs = 30000) {
		const until = Date.now() + timeoutMs;
		for (;;) {
			const target = (await targets(port)).find(match);
			if (target) {
				const ws = new WebSocket(target.webSocketDebuggerUrl);
				await new Promise((resolve, reject) => {
					ws.onopen = resolve;
					ws.onerror = reject;
				});
				return new Cdp(ws, target);
			}
			if (Date.now() > until) throw new Error(`no page on port ${port}`);
			await sleep(300);
		}
	}

	send(method, params = {}) {
		const id = ++this.#id;
		return new Promise((resolve, reject) => {
			this.#pending.set(id, { resolve, reject });
			this.#ws.send(JSON.stringify({ id, method, params }));
		});
	}

	on(method, listener) {
		this.#listeners.set(method, [...(this.#listeners.get(method) ?? []), listener]);
		return () => this.#listeners.set(method, (this.#listeners.get(method) ?? []).filter((l) => l !== listener));
	}

	/** The value of `expression` in the page, awaited; an exception in the page throws here with its stack. */
	async eval(expression) {
		const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
		if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? JSON.stringify(result.exceptionDetails));
		return result.result.value;
	}

	/** `fn` (a function of no arguments, written as page code) run in the page with `args` as JSON. */
	call(fn, ...args) {
		return this.eval(`(${fn.toString()})(...${JSON.stringify(args)})`);
	}

	close() {
		this.#ws.close();
	}
}
