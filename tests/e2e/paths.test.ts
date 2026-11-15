import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProblem } from "../../scripts/e2e/build";
import { assertSafe, inVault, onDisk } from "../../scripts/e2e/paths";

/**
 * The harness never writes into Max's vault nor into the repository outside `.e2e/`, however the folder is spelled:
 * another case (macOS's disk takes `~/obsidian` for `~/Obsidian`), a link, a part that does not exist yet.
 */
describe("the harness's folders", () => {
	const scratch = mkdtempSync(join(tmpdir(), "tc-e2e-paths-"));
	const home = join(scratch, "Home");
	const root = join(scratch, "Repo");
	mkdirSync(join(home, "Obsidian"), { recursive: true });
	mkdirSync(join(root, ".e2e"), { recursive: true });
	mkdirSync(join(root, "scripts"), { recursive: true });

	it("refuses Max's vault spelled in lowercase, as E2E_WORK=~/obsidian/e2e", () => {
		expect(() => assertSafe(join(home, "obsidian", "e2e"), root, home)).toThrow(/~\/Obsidian/);
		expect(() => assertSafe(join(home, "OBSIDIAN"), root, home)).toThrow(/~\/Obsidian/);
	});

	it("refuses the vault reached through a link", () => {
		const link = join(scratch, "vault-link");
		symlinkSync(join(home, "Obsidian"), link);
		expect(() => assertSafe(join(link, "e2e", "work"), root, home)).toThrow(/~\/Obsidian/);
	});

	it("refuses the repository outside .e2e/, in any case", () => {
		expect(() => assertSafe(join(root, "scripts", "work"), root, home)).toThrow(/outside \.e2e/);
		expect(() => assertSafe(join(root.toUpperCase().replace(scratch.toUpperCase(), scratch), "work"), root, home)).toThrow(/outside \.e2e/);
		expect(() => assertSafe(join(root, ".e2e", "work"), root, home)).not.toThrow();
		expect(() => assertSafe(join(root, ".E2E", "work"), root, home)).not.toThrow();
	});

	it("lets a folder of its own pass", () => {
		expect(() => assertSafe(join(scratch, "elsewhere", "work"), root, home)).not.toThrow();
	});

	it("resolves the nearest part that exists and keeps the rest", () => {
		expect(onDisk(join(home, "Obsidian", "not", "yet"))).toMatch(/Obsidian\/not\/yet$/);
	});
});

describe("the fixture's paths in the scratch vault", () => {
	it("refuses a path that climbs out or is absolute", () => {
		expect(() => inVault("/x/vault", "../Obsidian/Tasks.md")).toThrow(/not a path inside/);
		expect(() => inVault("/x/vault", "notes/../../out.md")).toThrow(/not a path inside/);
		expect(() => inVault("/x/vault", "/Users/max/Obsidian/Tasks.md")).toThrow(/not a path inside/);
		expect(() => inVault("/x/vault", "")).toThrow(/not a path inside/);
		expect(() => inVault("/x/vault", ".")).toThrow(/not a path inside/);
	});

	it("takes a path inside, a folder named with dots too", () => {
		expect(inVault("/x/vault", "TODOs Tasks.md")).toBe("/x/vault/TODOs Tasks.md");
		expect(inVault("/x/vault", "Calendars/..ics/phone.json")).toBe("/x/vault/Calendars/..ics/phone.json");
	});
});

describe("the build the harness runs", () => {
	const at = Date.parse("2026-11-15T10:00:00Z");
	const ok = { firstLine: "// task-calendar 0.5.1 e2e", writtenAt: at + 5_000 };
	it("takes this run's e2e build", () => {
		expect(buildProblem(ok, "0.5.1", at, at - 60_000)).toBeNull();
	});
	it("refuses the release build, another version, an old file, a file older than the last commit", () => {
		expect(buildProblem({ ...ok, firstLine: "// task-calendar 0.5.1" }, "0.5.1", at, at - 60_000)).toMatch(/not this e2e build/);
		expect(buildProblem({ ...ok, firstLine: "// task-calendar 0.5.0 e2e" }, "0.5.1", at, at - 60_000)).toMatch(/not this e2e build/);
		expect(buildProblem({ ...ok, firstLine: "// task-calendar 0.5.1 e2e extra" }, "0.5.1", at, at - 60_000)).toMatch(/not this e2e build/);
		expect(buildProblem({ ...ok, writtenAt: at - 1 }, "0.5.1", at, at - 60_000)).toMatch(/before this run's build/);
		expect(buildProblem(ok, "0.5.1", at - 600_000, at + 60_000)).toMatch(/before the last commit/);
	});
});
