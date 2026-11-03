import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..", "src", "ui");

function sources(dir: string): { path: string; code: string }[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) return sources(path);
		if (!entry.name.endsWith(".ts")) return [];
		const code = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
		return [{ path: relative(root, path), code }];
	});
}

const where = (pattern: RegExp) => sources(root).flatMap(({ path, code }) => Array.from(code.matchAll(pattern), () => path));

describe("the submenus are built once", () => {
	it("Remove due date is written once", () => {
		expect(where(/"Remove due date"/g)).toEqual(["menu/DatePage.ts"]);
	});

	it("the Section submenu's way back only in SectionChooser", () => {
		expect(where(/backRow\([^)]*"Section"/g)).toEqual(["menu/SectionChooser.ts"]);
	});

	it("a month picker only on the date page and in the quick bar", () => {
		expect(where(/new MonthPicker\(/g).sort()).toEqual(["menu/DatePage.ts", "quick/QuickBar.ts"]);
	});
});
