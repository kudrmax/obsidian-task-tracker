import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

/** Where the harness keeps what it makes. Nothing of it is committed: the fixture is a copy of Max's own tasks. */
export interface Paths {
	readonly root: string;
	/** `.e2e/` (or `E2E_HOME`): the build, the fixture, the baselines, the runs. */
	readonly home: string;
	readonly build: string;
	readonly fixture: string;
	readonly baselines: string;
	readonly runs: string;
	/** `E2E_WORK` (or `.e2e/work`): the test Obsidian's own profile and its scratch vault. */
	readonly work: string;
	readonly profile: string;
	readonly vault: string;
}

/**
 * A folder the harness may write into: never in Max's vault, and in the repository only under `.e2e/` (gitignored), so
 * the copy of his tasks file can never be committed or synced.
 */
export function assertSafe(dir: string, root: string): void {
	const at = (path: string) => (existsSync(path) ? realpathSync(path) : resolve(path));
	const target = at(dir);
	const inside = (parent: string) => target === parent || target.startsWith(`${parent}${sep}`);
	if (inside(at(join(homedir(), "Obsidian")))) throw new Error(`${dir} is inside ~/Obsidian, Max's vault: the harness never writes there`);
	if (inside(at(root)) && !inside(at(join(root, ".e2e")))) throw new Error(`${dir} is inside the repository but outside .e2e/: the harness writes only to .e2e/ there`);
}

export function paths(): Paths {
	const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
	const home = process.env.E2E_HOME ?? join(root, ".e2e");
	const work = process.env.E2E_WORK ?? join(home, "work");
	assertSafe(home, root);
	assertSafe(work, root);
	return {
		root,
		home,
		build: join(home, "build"),
		fixture: join(home, "fixture"),
		baselines: join(home, "baselines"),
		runs: join(home, "runs"),
		work,
		profile: join(work, "obsidian-user"),
		vault: join(work, "vault"),
	};
}
