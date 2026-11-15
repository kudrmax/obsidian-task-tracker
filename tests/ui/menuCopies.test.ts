import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..", "obsidian", "ui");

/** The old screen's sources, or the new screens' (`next/`): each says each word once. */
function sources(dir: string, next = false): { path: string; code: string }[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return !next && relative(root, path) === "next" ? [] : sources(path, next);
		if (!/\.tsx?$/.test(entry.name)) return [];
		const code = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
		return [{ path: relative(root, path), code }];
	});
}

const where = (pattern: RegExp, next = false) => sources(next ? join(root, "next") : root, next).flatMap(({ path, code }) => Array.from(code.matchAll(pattern), () => path));

describe("the submenus are built once", () => {
	it("Remove due date is written once", () => {
		expect(where(/"Remove due date"/g)).toEqual(["menu/DatePage.ts"]);
	});

	it("the new screens say Remove due date once too, in the menu's model", () => {
		expect(where(/"Remove due date"/g, true)).toEqual(["next/model/taskMenu.ts"]);
	});

	it("the Section submenu's way back only in SectionChooser", () => {
		expect(where(/backRow\([^)]*"Section"/g)).toEqual(["menu/SectionChooser.ts"]);
	});

	it("a month picker only on the date page and in the quick bar", () => {
		expect(where(/new MonthPicker\(/g).sort()).toEqual(["menu/DatePage.ts", "quick/QuickBar.ts"]);
	});
});
