import type { App } from "obsidian";
import type { NoteFiles } from "../../core/application/ports";

/** The vault's files for «New project…»: the core decides the note's path and text, this only reads and writes it. */
export class VaultNoteFiles implements NoteFiles {
	constructor(private readonly app: App) {}

	paths(): readonly string[] {
		return this.app.vault.getFiles().map((file) => file.path);
	}

	async read(path: string): Promise<string> {
		const file = this.app.vault.getFileByPath(path);
		return file ? this.app.vault.read(file) : "";
	}

	async write(path: string, text: string): Promise<void> {
		const file = this.app.vault.getFileByPath(path);
		if (file) await this.app.vault.process(file, () => text);
		else await this.app.vault.create(path, text);
	}
}
