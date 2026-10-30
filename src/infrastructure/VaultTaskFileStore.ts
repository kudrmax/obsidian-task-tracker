import type { App, TFile } from "obsidian";
import { TasksFileMissingError } from "../application/contracts";
import type { TaskFileStore } from "../application/ports";
import { VaultPathWatcher } from "./VaultPathWatcher";

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
		return new VaultPathWatcher(this.app.vault).watch(this.path, listener);
	}

	private file(): TFile | null {
		return this.app.vault.getFileByPath(this.path());
	}
}
