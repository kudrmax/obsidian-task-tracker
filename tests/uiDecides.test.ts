import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A tripwire, not a parser: it trips when a file of src/ui compares a task's fields, the usual sign of a product
 * decision made in the view (CLAUDE.md, «The UI decides nothing»). The Swift frontend would have to write the same
 * line again, so the decision moves to application: a field in TaskItem.can, a service method, a ready menu model.
 */
const ROOT = resolve(__dirname, "..");

const DECISIONS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
	{ name: "which list a task is in", pattern: /\.list\s*[!=]==/g },
	{ name: "whether a task repeats", pattern: /\bitem\.repeat\b(?!\s*[,)\]}])/g },
	{ name: "how many labels a task has", pattern: /\.labels\.length\b/g },
	{ name: "a task's priority compared", pattern: /\.priority\s*[!=]==/g },
	{ name: "whether a task has subtasks", pattern: /\.subtasks\.length\s*[!=]==\s*0/g },
	{ name: "whether a task has a description", pattern: /\.description\s*[!=]==\s*null/g },
	{ name: "a key built from its path", pattern: /\bkey\.path\.slice\b/g },
	{ name: "a task's day, or its due date instead", pattern: /\.dueDate\s*\?\?|\bitem\.day\s*\?\?/g },
	{ name: "what a tap on a task's status writes", pattern: /\bitem\.open\s*\?(?![.?])/g },
	{ name: "what the quick entry's spot allows", pattern: /\.spot\.kind\s*[!=]==/g },
];

/**
 * Today's hits, by file, with the package of the layers review that removes them. A count may only go down: lower it
 * here when a hit goes, delete the file's line when it reaches zero. Never raise one or add a file.
 */
const BASELINE: Readonly<Record<string, { readonly count: number; readonly removedBy: string }>> = {
	"src/ui/TaskCalendarView.ts": { count: 5, removedBy: "S4 (can.fold) and S9 (TaskService.screenOf)" },
	"src/ui/TaskCard.ts": { count: 4, removedBy: "none: these draw the card's marks (repeat icon, description mark); they stay" },
	"src/ui/menu/TaskMenu.ts": { count: 4, removedBy: "S4 (TaskItem.can, togglePriority, toggleLabel)" },
	"src/ui/search/searchRows.ts": { count: 1, removedBy: "S9 (search returns its groups)" },
};

function files(dir: string): string[] {
	return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
		const path = `${dir}/${entry.name}`;
		return entry.isDirectory() ? files(path) : /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
	});
}

function withoutComments(text: string): string {
	return text.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, "")).replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** Each hit of a file as `line: what it decides`. */
function hitsIn(text: string): string[] {
	return withoutComments(text)
		.split("\n")
		.flatMap((line, i) => DECISIONS.flatMap((d) => [...line.matchAll(d.pattern)].map(() => `${i + 1}: ${d.name}`)));
}

const HITS: Readonly<Record<string, string[]>> = Object.fromEntries(
	files("src/ui")
		.map((file) => [file, hitsIn(readFileSync(join(ROOT, file), "utf8"))] as const)
		.filter(([, hits]) => hits.length > 0),
);

const RULE = "CLAUDE.md, Layers: «The UI decides nothing». Move the decision into application (TaskItem.can, a service method, a ready menu model) instead of raising the baseline.";

describe("the UI decides nothing", () => {
	it("compares no task field to decide, beyond today's baseline", () => {
		const over = Object.entries(HITS)
			.filter(([file, hits]) => hits.length > (BASELINE[file]?.count ?? 0))
			.map(([file, hits]) => `${file}: ${hits.length} (baseline ${BASELINE[file]?.count ?? 0})\n  ${hits.join("\n  ")}`);
		expect(over, `${over.join("\n")}\n${RULE}`).toEqual([]);
	});

	it("keeps the baseline as low as the code: a removed hit lowers it", () => {
		const stale = Object.entries(BASELINE)
			.filter(([file, b]) => (HITS[file]?.length ?? 0) < b.count)
			.map(([file, b]) => `${file}: baseline ${b.count}, now ${HITS[file]?.length ?? 0}`);
		expect(stale, "Lower these counts in BASELINE (delete a line at zero).").toEqual([]);
	});

	it("trips on the forms it watches and not on drawing", () => {
		expect(hitsIn('if (item.list === "done") go();')).toEqual(["1: which list a task is in"]);
		expect(hitsIn("const on = item.repeat !== null && item.repeatable;")).toHaveLength(1);
		expect(hitsIn("repeatRow(item.repeat); setRule({ rule: item.repeat, day });")).toEqual([]);
		expect(hitsIn("const k = { ...key, path: current.key.path.slice(0, -1) };")).toEqual(["1: a key built from its path"]);
		expect(hitsIn("// item.list === \"done\" in a comment")).toEqual([]);
		expect(hitsIn("const day = item.day ?? item.dueDate;")).toHaveLength(1);
	});
});
