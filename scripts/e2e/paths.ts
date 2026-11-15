import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
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
 * A path as the disk knows it: the nearest part that exists resolved by the system (`realpath`, which on macOS's
 * case-insensitive disk also gives the case the disk holds), the rest appended as written.
 */
export function onDisk(path: string, real: (p: string) => string = realpathSync.native, exists: (p: string) => boolean = existsSync): string {
	const rest: string[] = [];
	let at = resolve(path);
	while (!exists(at)) {
		const up = dirname(at);
		if (up === at) break;
		rest.unshift(basename(at));
		at = up;
	}
	return join(exists(at) ? real(at) : at, ...rest);
}

/**
 * A folder the harness may write into: never in Max's vault, and in the repository only under `.e2e/` (gitignored), so
 * the copy of his tasks file can never be committed or synced. Paths are compared as the disk compares them: resolved
 * through links and without regard to case (macOS's disk takes `~/obsidian` for `~/Obsidian`).
 */
export function assertSafe(dir: string, root: string, home: string = homedir(), disk: (p: string) => string = onDisk): void {
	const key = (path: string) => disk(path).toLowerCase();
	const target = key(dir);
	const inside = (parent: string) => target === parent || target.startsWith(`${parent}${sep}`);
	if (inside(key(join(home, "Obsidian")))) throw new Error(`${dir} is inside ~/Obsidian, Max's vault: the harness never writes there`);
	if (inside(key(root)) && !inside(key(join(root, ".e2e")))) throw new Error(`${dir} is inside the repository but outside .e2e/: the harness writes only to .e2e/ there`);
}

/**
 * A vault path of the fixture (the tasks file, a note, a calendar, as the settings name them) as a path inside the scratch
 * vault: one that is absolute or climbs out of it (`..`) is refused, so a setting can never send a write elsewhere.
 */
export function inVault(vault: string, path: string): string {
	const full = resolve(vault, path);
	const rel = relative(resolve(vault), full);
	if (path === "" || isAbsolute(path) || rel === "" || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) throw new Error(`«${path}» is not a path inside the scratch vault: the harness writes only there`);
	return full;
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
