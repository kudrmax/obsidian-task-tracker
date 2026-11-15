import { HARNESS } from "./frames";

/** A Chrome DevTools Protocol session over Node's own WebSocket: calls by id, events by name. */
export class Cdp {
	private nextId = 1;
	private readonly waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; method: string }>();
	private readonly listeners = new Map<string, Set<(params: Record<string, unknown>) => void>>();

	private constructor(private readonly socket: WebSocket) {
		socket.onmessage = (message) => {
			const data = JSON.parse(String(message.data)) as { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { message: string } };
			if (data.id !== undefined) {
				const call = this.waiting.get(data.id);
				this.waiting.delete(data.id);
				if (data.error) call?.reject(new Error(`${call.method}: ${data.error.message}`));
				else call?.resolve(data.result);
			} else if (data.method) this.listeners.get(data.method)?.forEach((l) => l(data.params ?? {}));
		};
		socket.onclose = () => {
			for (const call of this.waiting.values()) call.reject(new Error(`${call.method}: the connection closed`));
			this.waiting.clear();
		};
	}

	static async connect(url: string): Promise<Cdp> {
		const socket = new WebSocket(url);
		await new Promise<void>((resolve, reject) => {
			socket.onopen = () => resolve();
			socket.onerror = () => reject(new Error(`cannot connect to ${url}`));
		});
		return new Cdp(socket);
	}

	call<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<T> {
		const id = this.nextId++;
		const sent = Date.now();
		this.socket.send(JSON.stringify({ id, method, params }));
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.waiting.delete(id);
				/**
				 * A timer that fires far later than asked means the harness's own event loop was held (a long diff, a
				 * decode): the page may well have answered meanwhile, and the error says whose the wait was.
				 */
				const late = Date.now() - sent - timeoutMs;
				reject(new CdpTimeout(method, timeoutMs, late > HELD_MS ? `the harness itself was held ${Math.round(late / 1000)} s past the bound` : null));
			}, timeoutMs);
			this.waiting.set(id, {
				method,
				resolve: (v) => {
					clearTimeout(timer);
					resolve(v as T);
				},
				reject: (e) => {
					clearTimeout(timer);
					reject(e);
				},
			});
		});
	}

	on(event: string, listener: (params: Record<string, unknown>) => void): () => void {
		const set = this.listeners.get(event) ?? new Set();
		set.add(listener);
		this.listeners.set(event, set);
		return () => set.delete(listener);
	}

	/** Evaluates `expression` in the page (an async function body: `return` what it answers), by value. */
	/** Runs `body` in the page as an async function; it marks its run in a trace (`HARNESS.evalBegin`…`evalEnd`), so the budget leaves the harness's own script out. */
	async eval<T = unknown>(body: string, timeoutMs = 30_000): Promise<T> {
		const answer = await this.call<{ result: { value?: unknown }; exceptionDetails?: { exception?: { description?: string }; text: string } }>(
			"Runtime.evaluate",
			{ expression: `(async () => { console.timeStamp("${HARNESS.evalBegin}"); try {${body}\n} finally { console.timeStamp("${HARNESS.evalEnd}"); } })()`, awaitPromise: true, returnByValue: true },
			timeoutMs,
		).catch(async (e: unknown) => {
			if (!(e instanceof CdpTimeout) || e.why !== null) throw e;
			throw new CdpTimeout("Runtime.evaluate", timeoutMs, await this.diagnose(body));
		});
		if (answer.exceptionDetails) throw new Error(`in the page: ${answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text}`);
		return answer.result.value as T;
	}

	/**
	 * Why an evaluation got no answer: the page's thread free (it answers a bare expression at once), so the evaluation
	 * awaits a promise that never settles; or the thread busy, with the stack it is busy in (`Debugger.pause`); or the
	 * page not answering even that (stuck outside script: layout, a crash, a reload).
	 */
	private async diagnose(body: string): Promise<string> {
		const what = body.replace(/\s+/g, " ").trim().slice(0, 120);
		const free = await this.call("Runtime.evaluate", { expression: "1", returnByValue: true }, 3000).then(
			() => true,
			() => false,
		);
		if (free) return `the page's thread is free: the evaluation awaits a promise that never settles («${what}»)`;
		const paused = new Promise<string>((resolve) => {
			const off = this.on("Debugger.paused", (p) => {
				off();
				const frames = (p.callFrames as { functionName: string; url: string; location: { lineNumber: number; columnNumber: number } }[]) ?? [];
				resolve(frames.slice(0, 12).map((f) => `${f.functionName || "(anonymous)"} ${f.url.split("/").pop()}:${f.location.lineNumber + 1}:${f.location.columnNumber + 1}`).join(" ← "));
			});
			setTimeout(() => {
				off();
				resolve("");
			}, 8000);
		});
		await this.call("Debugger.enable", {}, 8000).catch(() => undefined);
		await this.call("Debugger.pause", {}, 8000).catch(() => undefined);
		const stack = await paused;
		await this.call("Debugger.resume", {}, 3000).catch(() => undefined);
		await this.call("Debugger.disable", {}, 3000).catch(() => undefined);
		return stack ? `the page's thread is busy in: ${stack} («${what}»)` : `the page answers nothing, not even a pause: stuck outside script (layout, a reload, a crash) («${what}»)`;
	}

	close(): void {
		this.socket.close();
	}
}

/** How late past its bound a timer may fire before the harness counts its own event loop as held. */
const HELD_MS = 2000;

/** A call that got no answer within its bound, with why when the harness could tell. */
export class CdpTimeout extends Error {
	constructor(
		readonly method: string,
		readonly timeoutMs: number,
		/** Whose the wait was, when the harness could tell. */
		readonly why: string | null,
	) {
		super(`${method}: no answer in ${timeoutMs} ms${why ? `: ${why}` : ""}`);
	}
}

export interface Target {
	readonly type: string;
	readonly url: string;
	readonly webSocketDebuggerUrl: string;
}

export async function targets(port: number): Promise<Target[]> {
	const res = await fetch(`http://127.0.0.1:${port}/json/list`);
	return (await res.json()) as Target[];
}
