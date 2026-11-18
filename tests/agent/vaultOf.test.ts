import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_VAULT, vaultOf } from "../../agent/compose";

/** The program kept in a vault's `.claude/skills/` reads that vault: an agent that sees only the vault (Cowork) runs it there, with no path to name. */
describe("vaultOf", () => {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "vault-of-")));
	const vault = join(root, "Vault");
	const skill = join(vault, ".claude", "skills", "obsidian-task-calendar");
	mkdirSync(join(vault, ".obsidian"), { recursive: true });
	mkdirSync(skill, { recursive: true });
	const program = join(skill, "obsidian-task-calendar.mjs");
	writeFileSync(program, "");

	it("is the vault the program sits in", () => {
		expect(vaultOf(program)).toBe(vault);
	});

	it("follows a link to the program into its vault", () => {
		const link = join(root, "linked.mjs");
		symlinkSync(program, link);
		expect(vaultOf(link)).toBe(vault);
	});

	it("is the default outside any vault, and without a program", () => {
		const outside = join(root, "elsewhere.mjs");
		writeFileSync(outside, "");
		expect(vaultOf(outside)).toBe(DEFAULT_VAULT);
		expect(vaultOf(undefined)).toBe(DEFAULT_VAULT);
	});
});
