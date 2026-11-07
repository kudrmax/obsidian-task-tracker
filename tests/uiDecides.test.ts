import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A tripwire, not a parser: it trips when a file of obsidian/ui compares a task's fields, the usual sign of a product
 * decision made in the view (CLAUDE.md, «The UI decides nothing»). The Swift frontend would have to write the same
 * line again, so the decision moves to application: a field in TaskItem.can, a service method, a ready menu model.
 */
const ROOT = resolve(__dirname, "..");

/** A task's field read as a condition: compared, negated, tested in an `if`, or as the left of `&&`, `||` or `?:`. */
function tested(field: string, compared = true): RegExp {
	const f = `\\.${field}\\b`;
	const forms = [`${f}\\s*(?:&&|\\|\\||\\?(?![.?:]))`, `!\\s*(?:\\w+\\.)*\\w+${f}`, `\\bif\\s*\\(\\s*(?:\\w+\\.)*\\w+${f}\\s*\\)`];
	if (compared) forms.push(`${f}\\s*[!=]==`);
	return new RegExp(forms.join("|"), "g");
}

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
	{ name: "a task's status compared", pattern: /\.status\s*[!=]==/g },
	{ name: "whether a task is a subtask", pattern: /\.isSubtask\b/g },
	{ name: "a task's due date compared", pattern: /\.dueDate\s*[!=]==/g },
	{ name: "a day compared with today", pattern: /[!=]==\s*(?:this\.)?(?:deps\.)?today\(\)|\btoday\(\)\s*[!=]==/g },
	{ name: "a task's status switched on", pattern: /\bswitch\s*\(\s*[\w.]*\.status\s*\)/g },
	{ name: "whether a task's list is one of these", pattern: /\.includes\(\s*[\w.]*\.list\s*\)/g },
	{ name: "whether a task is closed", pattern: /!\s*(?:\w+\.)*(?:item|task|subtask)\.open\b/g },
	{ name: "whether a task is on a time", pattern: tested("slot") },
	{ name: "a task's reminder compared", pattern: /\.reminder\s*[!=]==/g },
	{ name: "a task's section compared", pattern: /\.group\s*[!=]==|[!=]==\s*(?:\w+\.)*group\b(?!\s*\.)/g },
	{ name: "whether a task's subtasks are folded", pattern: tested("collapsed") },
	{ name: "whether a task has a due date", pattern: tested("dueDate", false) },
	{ name: "a task's fields taken apart to decide", pattern: /\{[^}]*\b(?:list|status|priority|dueDate|isSubtask|open)\b[^}]*\}\s*=\s*(?:\w+\.)*(?:item|task)\b/g },
];

/**
 * Today's hits, by file, with the package of the layers review that removes them. A count may only go down: lower it
 * here when a hit goes, delete the file's line when it reaches zero. Never raise one or add a file.
 */
const BASELINE: Readonly<Record<string, { readonly count: number; readonly removedBy: string }>> = {
	"obsidian/ui/TaskCard.ts": { count: 4, removedBy: "none: these draw the card's marks (the description mark, the dot of a task in progress); they stay" },
	"obsidian/ui/drag/ListDrop.ts": { count: 2, removedBy: "none: a gap's rectangle is drawn under the header of the section its place names, among that section's cards; it stays" },
	"obsidian/ui/full/FullScreen.ts": { count: 2, removedBy: "none: it draws a closed subtask, a done one crossed out (`mark`); it stays. The second hit is the closed one's, found once the guard watched `!item.open` too" },
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
	files("obsidian/ui")
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
		expect(hitsIn('if (item.status === "done" || item.isSubtask) go();')).toEqual(["1: a task's status compared", "1: whether a task is a subtask"]);
		expect(hitsIn("const shown = item.dueDate !== opts.day;")).toEqual(["1: a task's due date compared"]);
		expect(hitsIn("if (date === this.today()) a(); if (this.deps.today() !== day) b();")).toEqual(["1: a day compared with today", "1: a day compared with today"]);
		expect(hitsIn("this.select(this.today());")).toEqual([]);
		expect(hitsIn("switch (item.status) {")).toEqual(["1: a task's status switched on"]);
		expect(hitsIn("if (LISTS.includes(item.list)) go();")).toEqual(["1: whether a task's list is one of these"]);
		expect(hitsIn("if (!item.open) go(); if (!this.panel.open) stay();")).toEqual(["1: whether a task is closed"]);
		expect(hitsIn("const { list, status } = item;")).toEqual(["1: a task's fields taken apart to decide"]);
		expect(hitsIn("const { day, onSubtask } = this.context;")).toEqual([]);
		expect(hitsIn("if (item.slot !== null) a(); if (!item.slot) b(); const t = item.slot ? 1 : 2;")).toEqual(["1: whether a task is on a time", "1: whether a task is on a time", "1: whether a task is on a time"]);
		expect(hitsIn("drawSlot(item.slot); const { slot } = item.slot ?? x;")).toEqual([]);
		expect(hitsIn('if (item.reminder === "none") a();')).toEqual(["1: a task's reminder compared"]);
		expect(hitsIn("if (item.group === name || head.group !== null) a();")).toEqual(["1: a task's section compared", "1: a task's section compared"]);
		expect(hitsIn("if (item.collapsed) a(); setCollapsed(key, item.collapsed);")).toEqual(["1: whether a task's subtasks are folded"]);
		expect(hitsIn("if (item.dueDate !== null) a(); const d = item.dueDate && 1;")).toEqual(["1: a task's due date compared", "1: whether a task has a due date"]);
	});
});
