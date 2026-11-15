import type { EventRef, TAbstractFile, TFile } from "obsidian";

/**
 * How a write over the file ended. `written`: the change was taken. `kept`: the change refused the text it found (not the
 * base), which is `current`. `moved`: the file that was at the path is somewhere else now (a rename mid-write).
 * `missing`: no file at the path.
 */
export type WriteOutcome =
	| { readonly kind: "written"; readonly text: string }
	| { readonly kind: "kept"; readonly current: string }
	| { readonly kind: "moved" }
	| { readonly kind: "missing" };

/** A change of a file of the vault, by path; `oldPath` for a rename. */
export interface VaultChange {
	readonly kind: "modify" | "create" | "delete" | "rename";
	readonly path: string;
	readonly oldPath?: string;
}

/** The tasks file as the runtime reads and writes it. */
export interface TasksVault {
	/** The file's text, null when there is none at the path. */
	read(path: string): Promise<string | null>;
	/** `change` gets the file's text inside the write and answers the new text, or null to leave it as it is. */
	write(path: string, change: (current: string) => string | null): Promise<WriteOutcome>;
	create(path: string, text: string): Promise<void>;
	watch(listener: (change: VaultChange) => void): () => void;
}

/** What the runtime uses of Obsidian's `Vault`. */
export interface ObsidianVault {
	getFileByPath(path: string): TFile | null;
	read(file: TFile): Promise<string>;
	process(file: TFile, fn: (data: string) => string): Promise<string>;
	create(path: string, data: string): Promise<TFile>;
	on(name: "modify" | "create" | "delete", callback: (file: TAbstractFile) => void): EventRef;
	on(name: "rename", callback: (file: TAbstractFile, oldPath: string) => void): EventRef;
	offref(ref: EventRef): void;
}

/**
 * The tasks file in Obsidian's vault. A write runs inside `vault.process`, so nothing lands between reading the file and
 * writing it; the `TFile` it holds follows a rename, so the write also checks that the file still sits at the path.
 */
export class ObsidianTasksVault implements TasksVault {
	constructor(private readonly vault: ObsidianVault) {}

	async read(path: string): Promise<string | null> {
		const file = this.vault.getFileByPath(path);
		return file ? this.vault.read(file) : null;
	}

	async write(path: string, change: (current: string) => string | null): Promise<WriteOutcome> {
		const file = this.vault.getFileByPath(path);
		if (!file) return { kind: "missing" };
		let outcome: WriteOutcome = { kind: "moved" };
		await this.vault.process(file, (current) => {
			if (file.path !== path) return current;
			const next = change(current);
			outcome = next === null ? { kind: "kept", current } : { kind: "written", text: next };
			return next ?? current;
		});
		return outcome;
	}

	async create(path: string, text: string): Promise<void> {
		await this.vault.create(path, text);
	}

	watch(listener: (change: VaultChange) => void): () => void {
		const refs = [
			this.vault.on("modify", (f) => listener({ kind: "modify", path: f.path })),
			this.vault.on("create", (f) => listener({ kind: "create", path: f.path })),
			this.vault.on("delete", (f) => listener({ kind: "delete", path: f.path })),
			this.vault.on("rename", (f, oldPath) => listener({ kind: "rename", path: f.path, oldPath })),
		];
		return () => refs.forEach((ref) => this.vault.offref(ref));
	}
}
