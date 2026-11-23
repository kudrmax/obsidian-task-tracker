import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** What the main process has loaded of the folder, and since when it runs. */
export interface FilesInUse {
	readonly inUse: readonly string[];
	readonly startedAt: number;
}

const BUILD_FILE = /^trackpad(?:-main)?-[0-9a-f]{12}\.(?:node|cjs)$/;

/**
 * The module's files in Obsidian's own folder (`userData/task-calendar/trackpad`), outside every vault, so Sync and the
 * vault's git never see them. Each file is named by its content: written once, never over a file already loaded (macOS
 * keeps a loaded module's pages mapped, and a rewrite in place would crash the process), so a new build writes a new name.
 */
export class ModuleFiles {
	readonly build: string;

	constructor(
		readonly dir: string,
		private readonly binary: Buffer,
		private readonly loader: Buffer,
	) {
		this.build = hashOf(binary);
	}

	/** Both files written, if not there yet: the native module's path and the main-process loader's. */
	write(): { addon: string; loader: string } {
		mkdirSync(this.dir, { recursive: true });
		return { addon: this.written("trackpad", ".node", this.binary), loader: this.written("trackpad-main", ".cjs", this.loader) };
	}

	/**
	 * The other builds' files removed: never one the main process has loaded, nor one written since it started (another
	 * window of this Obsidian may be about to load it).
	 */
	clean(files: FilesInUse): void {
		const keep = new Set([...files.inUse, join(this.dir, `trackpad-${this.build}.node`), join(this.dir, `trackpad-main-${hashOf(this.loader)}.cjs`)]);
		for (const name of readdirSync(this.dir)) {
			const path = join(this.dir, name);
			if (!BUILD_FILE.test(name) || keep.has(path) || statSync(path).mtimeMs >= files.startedAt) continue;
			unlinkSync(path);
		}
	}

	private written(name: string, extension: string, content: Buffer): string {
		const path = join(this.dir, `${name}-${hashOf(content)}${extension}`);
		if (existsSync(path) && readFileSync(path).equals(content)) return path;
		const temporary = `${path}.${process.pid}.tmp`;
		writeFileSync(temporary, content);
		renameSync(temporary, path);
		return path;
	}
}

function hashOf(content: Buffer): string {
	return createHash("sha256").update(content).digest("hex").slice(0, 12);
}
