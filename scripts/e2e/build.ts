import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** What the harness knows of a build it is about to run: the file's first line and when it was written. */
export interface BuiltFile {
	readonly firstLine: string;
	readonly writtenAt: number;
}

/**
 * Why a copied `main.js` is not this run's e2e build, or null when it is: its first line must be exactly
 * `// task-calendar <version> e2e` of the version in `manifest.json`, and it must have been written by this run's build
 * (not before it started) and after the last commit, so an old file left in a folder never runs as the new code.
 */
export function buildProblem(file: BuiltFile, version: string, buildStartedAt: number, lastCommitAt: number): string | null {
	const expected = `// task-calendar ${version} e2e`;
	if (file.firstLine !== expected) return `the plugin's main.js starts with «${file.firstLine.slice(0, 80)}», not «${expected}»: not this e2e build`;
	if (file.writtenAt < buildStartedAt) return `the plugin's main.js was written ${new Date(file.writtenAt).toISOString()}, before this run's build started (${new Date(buildStartedAt).toISOString()}): an old file`;
	if (file.writtenAt < lastCommitAt) return `the plugin's main.js was written before the last commit (${new Date(lastCommitAt).toISOString()})`;
	return null;
}

export function builtFile(path: string): BuiltFile {
	const text = readFileSync(path, "utf8");
	return { firstLine: text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n")), writtenAt: statSync(path).mtimeMs };
}

export function lastCommitAt(root: string): number {
	return Number(execFileSync("git", ["log", "-1", "--format=%ct"], { cwd: root, encoding: "utf8" }).trim()) * 1000;
}

export function manifestVersion(root: string): string {
	return (JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")) as { version: string }).version;
}

/** Builds the e2e plugin into `out` and answers when the build started. */
export function buildE2E(root: string, out: string): number {
	const started = Date.now();
	execFileSync("node", ["esbuild.config.mjs", "production", "e2e", `--outfile=${out}`], { cwd: root, stdio: "inherit" });
	return started;
}

/** Throws unless the plugin's copied main.js is this run's e2e build. */
export function assertThisBuild(copied: string, root: string, buildStartedAt: number): void {
	const problem = buildProblem(builtFile(copied), manifestVersion(root), buildStartedAt, lastCommitAt(root));
	if (problem) throw new Error(problem);
}
