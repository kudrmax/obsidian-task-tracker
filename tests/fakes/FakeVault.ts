import type { App, EventRef, TFile } from "obsidian";

type ModifyListener = (file: { path: string }) => void;

export class FakeVault {
	readonly files = new Map<string, string>();
	created: string[] = [];
	private readonly listeners = new Map<EventRef, ModifyListener>();

	getFileByPath(path: string): TFile | null {
		return this.files.has(path) ? ({ path } as TFile) : null;
	}

	async read(file: TFile): Promise<string> {
		return this.files.get(file.path)!;
	}

	async process(file: TFile, fn: (data: string) => string): Promise<string> {
		const next = fn(this.files.get(file.path)!);
		this.files.set(file.path, next);
		return next;
	}

	async create(path: string, data: string): Promise<TFile> {
		this.files.set(path, data);
		this.created.push(path);
		return { path } as TFile;
	}

	on(name: "modify", callback: ModifyListener): EventRef {
		if (name !== "modify") throw new Error(name);
		const ref = {} as EventRef;
		this.listeners.set(ref, callback);
		return ref;
	}

	offref(ref: EventRef): void {
		this.listeners.delete(ref);
	}

	emitModify(path: string): void {
		for (const listener of this.listeners.values()) listener({ path });
	}

	get listenerCount(): number {
		return this.listeners.size;
	}

	asApp(): App {
		return { vault: this } as unknown as App;
	}
}
