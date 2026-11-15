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
		this.socket.send(JSON.stringify({ id, method, params }));
		return new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.waiting.delete(id);
				reject(new Error(`${method}: no answer in ${timeoutMs} ms`));
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
	async eval<T = unknown>(body: string, timeoutMs = 30_000): Promise<T> {
		const answer = await this.call<{ result: { value?: unknown }; exceptionDetails?: { exception?: { description?: string }; text: string } }>(
			"Runtime.evaluate",
			{ expression: `(async () => {${body}\n})()`, awaitPromise: true, returnByValue: true },
			timeoutMs,
		);
		if (answer.exceptionDetails) throw new Error(`in the page: ${answer.exceptionDetails.exception?.description ?? answer.exceptionDetails.text}`);
		return answer.result.value as T;
	}

	close(): void {
		this.socket.close();
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
