import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ALLOWED, type FreezeAllowance } from "./uiFreeze.allow";
import { FROZEN } from "./uiFreeze.baseline";

/**
 * The old screen is frozen while the new one is built (spec §Guards): `obsidian/ui` outside `next/` and the CSS above the
 * next marker may only shrink. Growth needs an entry in `uiFreeze.allow.ts`, which names the commit and the reason.
 */

const ROOT = resolve(__dirname, "..");
const MARKER = "/* next */";

export interface Measure {
	readonly lines: Readonly<Record<string, number>>;
	readonly files: readonly string[];
	readonly cssBytes: number;
}

/** The files git tracks under `dir`: a scratch file lying in a worktree is not the old screen. */
function trackedFiles(dir: string): string[] {
	return execFileSync("git", ["ls-files", "-z", "--", dir], { cwd: ROOT, encoding: "utf8" }).split("\0").filter((p) => p !== "");
}

function measure(): Measure {
	const files = trackedFiles("obsidian/ui").filter((p) => !p.startsWith("obsidian/ui/next/") && existsSync(join(ROOT, p))).sort();
	const lines: Record<string, number> = {};
	for (const file of files) lines[dirname(file)] = (lines[dirname(file)] ?? 0) + readFileSync(join(ROOT, file), "utf8").split("\n").length;
	const css = readFileSync(join(ROOT, "styles.css"), "utf8");
	return { lines, files, cssBytes: Buffer.byteLength(css.slice(0, css.indexOf(MARKER))) };
}

/** What grew past the frozen measure and its allowances. */
export function grown(now: Measure, frozen: Measure, allowed: readonly FreezeAllowance[]): string[] {
	const out: string[] = [];
	const more = (dir: string) => allowed.reduce((sum, a) => sum + ("dir" in a && a.dir === dir ? a.lines : 0), 0);
	for (const [dir, lines] of Object.entries(now.lines)) {
		const limit = (frozen.lines[dir] ?? 0) + more(dir);
		if (lines > limit) out.push(`${dir}: ${lines} lines, frozen at ${limit}`);
	}
	const files = new Set([...frozen.files, ...allowed.flatMap((a) => ("file" in a ? [a.file] : []))]);
	for (const file of now.files) if (!files.has(file)) out.push(`${file}: a new file of the old screen (new code goes in obsidian/ui/next)`);
	const css = frozen.cssBytes + allowed.reduce((sum, a) => sum + ("cssBytes" in a ? a.cssBytes : 0), 0);
	if (now.cssBytes > css) out.push(`styles.css above the next marker: ${now.cssBytes} bytes, frozen at ${css}`);
	return out;
}

/** An allowance that does not say what made it and why. */
export function unexplained(allowed: readonly FreezeAllowance[], isCommit: (sha: string) => boolean): string[] {
	return allowed
		.filter((a) => !/^[0-9a-f]{7,40}$/.test(a.commit) || !isCommit(a.commit) || a.reason.trim().length < 10 || ("lines" in a && a.lines <= 0) || ("cssBytes" in a && a.cssBytes <= 0))
		.map((a) => JSON.stringify(a));
}

const isCommit = (sha: string): boolean => {
	try {
		execFileSync("git", ["cat-file", "-e", `${sha}^{commit}`], { cwd: ROOT, stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
};

const isShallow = (): boolean => {
	try {
		return execFileSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: ROOT, encoding: "utf8" }).trim() === "true";
	} catch {
		return false;
	}
};

/**
 * Whether an allowance's commit is known. The baseline is facts kept in `uiFreeze.baseline.ts`, never a commit looked up,
 * so the freeze holds in any clone. Only the allowances name commits: a shallow clone may lack an old one, and there the
 * lookup gives way (with a note) to the rest of the check (the commit's form, the reason, the amount).
 */
export function commitCheck(lookup: (sha: string) => boolean, shallow: boolean, note: (text: string) => void): (sha: string) => boolean {
	return (sha) => {
		if (lookup(sha)) return true;
		if (!shallow) return false;
		note(`uiFreeze: ${sha} is not in this shallow clone; its allowance is checked for its form and reason only`);
		return true;
	};
}

describe("the old screen is frozen", () => {
	it("grows nowhere past its baseline and allowances", () => {
		expect(grown(measure(), FROZEN, ALLOWED)).toEqual([]);
	});

	it("allows growth only with a commit and a reason", () => {
		expect(unexplained(ALLOWED, commitCheck(isCommit, isShallow(), (text) => console.warn(text)))).toEqual([]);
	});
});

describe("the freeze guard itself", () => {
	const frozen: Measure = { lines: { "obsidian/ui": 100, "obsidian/ui/menu": 50 }, files: ["obsidian/ui/a.ts", "obsidian/ui/menu/b.ts"], cssBytes: 1000 };

	it("lets the old screen shrink", () => {
		expect(grown({ lines: { "obsidian/ui": 90, "obsidian/ui/menu": 50 }, files: ["obsidian/ui/a.ts"], cssBytes: 900 }, frozen, [])).toEqual([]);
	});

	it("trips on a directory that grew, a new file and CSS that grew", () => {
		expect(grown({ ...frozen, lines: { "obsidian/ui": 101, "obsidian/ui/menu": 50 } }, frozen, [])).toHaveLength(1);
		expect(grown({ ...frozen, files: [...frozen.files, "obsidian/ui/c.ts"] }, frozen, [])).toHaveLength(1);
		expect(grown({ ...frozen, lines: { ...frozen.lines, "obsidian/ui/new": 3 } }, frozen, [])).toHaveLength(1);
		expect(grown({ ...frozen, cssBytes: 1001 }, frozen, [])).toHaveLength(1);
	});

	it("lets an allowance carry exactly its growth", () => {
		const allowed: FreezeAllowance[] = [
			{ commit: "abc1234", reason: "Max asked for the drop line", dir: "obsidian/ui", lines: 5 },
			{ commit: "abc1234", reason: "Max asked for the drop line", file: "obsidian/ui/c.ts" },
			{ commit: "abc1234", reason: "Max asked for the drop line", cssBytes: 10 },
		];
		expect(grown({ lines: { "obsidian/ui": 105, "obsidian/ui/menu": 50 }, files: [...frozen.files, "obsidian/ui/c.ts"], cssBytes: 1010 }, frozen, allowed)).toEqual([]);
		expect(grown({ lines: { "obsidian/ui": 106, "obsidian/ui/menu": 50 }, files: frozen.files, cssBytes: 1011 }, frozen, allowed)).toHaveLength(2);
	});

	it("trips on an allowance without a real commit or a reason", () => {
		expect(unexplained([{ commit: "nope", reason: "Max asked for it", cssBytes: 1 }], () => true)).toHaveLength(1);
		expect(unexplained([{ commit: "abc1234", reason: "fix", cssBytes: 1 }], () => true)).toHaveLength(1);
		expect(unexplained([{ commit: "abc1234", reason: "Max asked for the drop line", cssBytes: 1 }], () => false)).toHaveLength(1);
		expect(unexplained([{ commit: "abc1234", reason: "Max asked for the drop line", cssBytes: 1 }], () => true)).toEqual([]);
		const head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
		expect(isCommit(head)).toBe(true);
		expect(isCommit("0000000")).toBe(false);
	});

	it("needs no history for the baseline, and lets a shallow clone lack an allowance's commit with a note", () => {
		const notes: string[] = [];
		expect(commitCheck(() => false, false, (n) => notes.push(n))("abc1234")).toBe(false);
		expect(commitCheck(() => false, true, (n) => notes.push(n))("abc1234")).toBe(true);
		expect(notes).toEqual([expect.stringMatching(/shallow clone/)]);
		expect(unexplained([{ commit: "nope", reason: "Max asked for the drop line", cssBytes: 1 }], commitCheck(() => false, true, () => undefined))).toHaveLength(1);
	});
});
