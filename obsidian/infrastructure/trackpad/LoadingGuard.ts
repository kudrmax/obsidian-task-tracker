import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Mark {
	readonly build: string;
	readonly pid: number;
}

/**
 * The crash guard: a mark written before the module is loaded into Obsidian's main process and taken away once it is.
 * A mark left by another process names a build whose loading took Obsidian down; that build is not loaded again.
 * A mark of this very process is another window loading at the same moment, not a crash.
 */
export class LoadingGuard {
	private readonly path: string;

	constructor(
		dir: string,
		private readonly build: string,
		private readonly pid: number,
	) {
		this.path = join(dir, "loading.json");
	}

	/** True when this build's loading never finished in an Obsidian that is gone; the mark is taken away either way. */
	crashedBefore(): boolean {
		const mark = this.read();
		if (!mark || mark.pid === this.pid) return false;
		this.end();
		return mark.build === this.build;
	}

	/** `load` run with the mark on the disk; it comes off when `load` returns or throws, never when the process dies in it. */
	around<T>(load: () => T): T {
		writeFileSync(this.path, JSON.stringify({ build: this.build, pid: this.pid } satisfies Mark));
		try {
			return load();
		} finally {
			this.end();
		}
	}

	private end(): void {
		if (existsSync(this.path)) unlinkSync(this.path);
	}

	private read(): Mark | null {
		try {
			const mark = JSON.parse(readFileSync(this.path, "utf8")) as Partial<Mark>;
			return typeof mark.build === "string" && typeof mark.pid === "number" ? { build: mark.build, pid: mark.pid } : null;
		} catch {
			return null;
		}
	}
}
