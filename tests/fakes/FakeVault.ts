import type { App, EventRef, TFile } from "obsidian";

type VaultEvent = "modify" | "create" | "delete" | "rename";
type FileListener = (file: { path: string }, oldPath?: string) => void;

export class FakeVault {
	readonly files = new Map<string, string>();
	created: string[] = [];
	private readonly listeners = new Map<EventRef, { name: VaultEvent; callback: FileListener }>();

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

	on(name: VaultEvent, callback: FileListener): EventRef {
		const ref = {} as EventRef;
		this.listeners.set(ref, { name, callback });
		return ref;
	}

	offref(ref: EventRef): void {
		this.listeners.delete(ref);
	}

	emit(name: VaultEvent, path: string, oldPath?: string): void {
		for (const listener of this.listeners.values()) if (listener.name === name) listener.callback({ path }, oldPath);
	}

	get listenerCount(): number {
		return this.listeners.size;
	}

	asApp(): App {
		return { vault: this } as unknown as App;
	}
}
