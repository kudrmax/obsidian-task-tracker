import type { Vault } from "obsidian";

/** Tells when one file of the vault changed. */
export interface PathWatcher {
	/**
	 * Fires `listener` when the file at `path()` is written, created, deleted, or renamed to or from that path. The path is read
	 * on every event, so a path changed in the settings counts at once. Returns the unsubscribe.
	 */
	watch(path: () => string, listener: () => void): () => void;
}

export class VaultPathWatcher implements PathWatcher {
	constructor(private readonly vault: Vault) {}

	watch(path: () => string, listener: () => void): () => void {
		const vault = this.vault;
		const ours = (...paths: string[]) => {
			if (paths.includes(path())) listener();
		};
		const refs = [
			vault.on("modify", (file) => ours(file.path)),
			vault.on("create", (file) => ours(file.path)),
			vault.on("delete", (file) => ours(file.path)),
			vault.on("rename", (file, oldPath) => ours(file.path, oldPath)),
		];
		return () => refs.forEach((ref) => vault.offref(ref));
	}
}
