import { existsSync, readdirSync } from "node:fs";
import { basename, dirname } from "node:path";
import { API, type Checker, type Project } from "typescript/unstable/sync";

/**
 * The project's own TypeScript (7, its Go compiler through `typescript/unstable/sync`) over the repository, with files
 * laid over it in memory: the guards read the code as the compiler does (every name resolved to its declaration, every
 * expression's type), and their self-tests put bad samples where a part's file would be, never on disk.
 *
 * The API is marked unstable, so `typescript` is pinned to an exact version in package.json; a new version is taken
 * only with these guards green.
 */
export class TsProgram {
	private readonly api: API;
	private readonly projects = new Map<string, Project>();

	constructor(
		root: string,
		configs: readonly string[],
		virtual: ReadonlyMap<string, string> = new Map(),
	) {
		const dirs = new Set<string>();
		for (const file of virtual.keys()) for (let d = dirname(file); d.length > 1; d = dirname(d)) dirs.add(d);
		this.api = new API({
			cwd: root,
			fs: {
				readFile: (f) => (virtual.has(f) ? virtual.get(f)! : undefined),
				fileExists: (f) => (virtual.has(f) ? true : undefined),
				directoryExists: (d) => (dirs.has(d) ? true : undefined),
				getAccessibleEntries: (d) => {
					if (!dirs.has(d)) return undefined;
					const real = existsSync(d) ? readdirSync(d, { withFileTypes: true }) : [];
					const files = real.filter((e) => e.isFile()).map((e) => e.name);
					const directories = real.filter((e) => e.isDirectory()).map((e) => e.name);
					for (const f of virtual.keys()) if (dirname(f) === d && !files.includes(basename(f))) files.push(basename(f));
					for (const x of dirs) if (dirname(x) === d && !directories.includes(basename(x))) directories.push(basename(x));
					return { files, directories };
				},
			},
		});
		const snapshot = this.api.updateSnapshot({ openProjects: [...configs] });
		for (const config of configs) {
			const project = snapshot.getProject(config);
			if (!project) throw new Error(`TypeScript did not open ${config}`);
			this.projects.set(config, project);
		}
	}

	project(config: string): Project {
		return this.projects.get(config)!;
	}

	checker(config: string): Checker {
		return this.project(config).checker;
	}

	close(): void {
		this.api.close();
	}
}
