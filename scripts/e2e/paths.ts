import { dirname, join, resolve } from "node:path";
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

export function paths(): Paths {
	const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
	const home = process.env.E2E_HOME ?? join(root, ".e2e");
	const work = process.env.E2E_WORK ?? join(home, "work");
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
