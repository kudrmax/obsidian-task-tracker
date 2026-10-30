import type { App, TFile } from "obsidian";
import { TasksFileMissingError } from "../application/contracts";
import type { TaskFileStore } from "../application/ports";

export class VaultTaskFileStore implements TaskFileStore {
	constructor(
		private readonly app: App,
		private readonly path: () => string,
	) {}

	async read(): Promise<string | null> {
		const file = this.file();
		return file ? this.app.vault.read(file) : null;
	}

	async write(fn: (text: string) => string): Promise<void> {
		const file = this.file();
		if (!file) throw new TasksFileMissingError(this.path());
		await this.app.vault.process(file, fn);
	}

	async create(text: string): Promise<void> {
		await this.app.vault.create(this.path(), text);
	}

	onChange(listener: () => void): () => void {
		const vault = this.app.vault;
		const ours = (...paths: string[]) => {
			if (paths.includes(this.path())) listener();
		};
		const refs = [
			vault.on("modify", (file) => ours(file.path)),
			vault.on("create", (file) => ours(file.path)),
			vault.on("delete", (file) => ours(file.path)),
			vault.on("rename", (file, oldPath) => ours(file.path, oldPath)),
		];
		return () => refs.forEach((ref) => vault.offref(ref));
	}

	private file(): TFile | null {
		return this.app.vault.getFileByPath(this.path());
	}
}
