import { describe, expect, it } from "vitest";
import type { Clock } from "../../core/application/ports";
import { memoryGrouping } from "../../core/application/ports";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import type { ProjectNote } from "../../core/application/contracts";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const T = "2026-11-07";
const LATER = "2026-11-10";
const clock: Clock = { now: () => new Date(2026, 10, 7, 14, 20) };
const NOTES: readonly ProjectNote[] = [
	{ name: "A", path: "A.md", link: "A" },
	{ name: "B", path: "B.md", link: "B" },
];
const FILE = [
	"## Inbox",
	"- [ ] I1",
	"## Now",
	"- [ ] N1 🗂️ [[A]]",
	"## Soon",
	"- [ ] S1 🗂️ [[A]]",
	"\t- [ ] S1a",
	"- [ ] S2 🗂️ [[B]]",
	"- [ ] S3",
	"## Backlog",
	"- [ ] BA1 🗂️ [[A]]",
	"- [ ] BB1 🗂️ [[B]]",
	"- [ ] BA2 🗂️ [[A]]",
	"- [ ] BN",
	"### Later",
	"- [ ] BA3 🗂️ [[A]]",
	"## Done",
	"",
].join("\n");

function setup(text = FILE) {
	const store = new InMemoryTaskFileStore(text);
	const projects = { list: () => NOTES, onChange: () => () => undefined };
	return { store, svc: new TaskServiceImpl(store, new FakeSettingsStore(), clock, null, projects, memoryGrouping()) };
}

function list(text: string, heading: string): string[] {
	const lines = text.split("\n");
	const from = lines.indexOf(heading) + 1;
	const to = lines.findIndex((l, i) => i >= from && l.startsWith("## "));
	return lines.slice(from, to).filter((l) => l !== "");
}

describe("a drop on a column's title", () => {
	it("the screen gives each column's title target ready: a grouped list keeps the project, an ungrouped one does not", async () => {
		const { svc } = setup();
		const { titleDrops } = await svc.screen(T);
		expect(titleDrops.backlog).toEqual({ kind: "title", list: "backlog", date: null, byProject: true });
		expect(titleDrops.soon).toEqual({ kind: "title", list: "soon", date: null, byProject: false });
		expect(titleDrops.inbox).toEqual({ kind: "title", list: "inbox", date: null, byProject: false });
		expect(titleDrops.day).toEqual({ kind: "title", list: "now", date: null, byProject: false });
		expect((await svc.screen(LATER)).titleDrops.day).toEqual({ kind: "title", list: "soon", date: LATER, byProject: false });
		await svc.setGrouping("soon", true);
		expect((await svc.screen(T)).titleDrops.soon).toEqual({ kind: "title", list: "soon", date: null, byProject: true });
	});

	it("Soon to grouped Backlog: the end of its own project's part without a section, other projects untouched", async () => {
		const { svc, store } = setup();
		const screen = await svc.screen(T);
		const s1 = screen.soon.find((t) => t.text === "S1")!;
		await svc.drop([{ key: s1.key, from: "soon" }], screen.titleDrops.backlog, T);
		expect(list(store.text!, "## Backlog")).toEqual([
			"- [ ] BA1 🗂️ [[A]]",
			"- [ ] BB1 🗂️ [[B]]",
			"- [ ] BA2 🗂️ [[A]]",
			"- [ ] S1 🗂️ [[A]]",
			"\t- [ ] S1a",
			"- [ ] BN",
			"### Later",
			"- [ ] BA3 🗂️ [[A]]",
		]);
	});

	it("Backlog to grouped Soon with no group of that project there: the project's group appears", async () => {
		const { svc, store } = setup(FILE.replace("- [ ] S1 🗂️ [[A]]\n\t- [ ] S1a\n", ""));
		await svc.setGrouping("soon", true);
		const screen = await svc.screen(T);
		expect(screen.projects.soon.groups.map((g) => g.title)).not.toContain("A");
		const ba1 = screen.backlog.find((t) => t.text === "BA1")!;
		await svc.drop([{ key: ba1.key, from: "backlog" }], screen.titleDrops.soon, T);
		expect(list(store.text!, "## Soon")).toEqual(["- [ ] S2 🗂️ [[B]]", "- [ ] S3", "- [ ] BA1 🗂️ [[A]]"]);
		expect((await svc.screen(T)).projects.soon.groups.map((g) => g.title)).toContain("A");
	});

	it("an ungrouped list: the end of the list's part without a section, the project kept", async () => {
		const { svc, store } = setup(FILE.replace("- [ ] BN\n", "- [ ] BN\n### Mid\n- [ ] BM\n"));
		await svc.setGrouping("backlog", false);
		const screen = await svc.screen(T);
		const s2 = screen.soon.find((t) => t.text === "S2")!;
		await svc.drop([{ key: s2.key, from: "soon" }], screen.titleDrops.backlog, T);
		expect(list(store.text!, "## Backlog")).toEqual([
			"- [ ] BA1 🗂️ [[A]]",
			"- [ ] BB1 🗂️ [[B]]",
			"- [ ] BA2 🗂️ [[A]]",
			"- [ ] BN",
			"- [ ] S2 🗂️ [[B]]",
			"### Mid",
			"- [ ] BM",
			"### Later",
			"- [ ] BA3 🗂️ [[A]]",
		]);
	});

	it("a stack from two projects: each to the end of its own group", async () => {
		const { svc, store } = setup();
		const screen = await svc.screen(T);
		const by = (text: string) => screen.soon.find((t) => t.text === text)!.key;
		const keys = await svc.drop(
			[
				{ key: by("S2"), from: "soon" },
				{ key: by("S1"), from: "soon" },
				{ key: by("S3"), from: "soon" },
			],
			screen.titleDrops.backlog,
			T,
		);
		expect(keys).toHaveLength(3);
		expect(list(store.text!, "## Backlog")).toEqual([
			"- [ ] BA1 🗂️ [[A]]",
			"- [ ] BB1 🗂️ [[B]]",
			"- [ ] S2 🗂️ [[B]]",
			"- [ ] BA2 🗂️ [[A]]",
			"- [ ] S1 🗂️ [[A]]",
			"\t- [ ] S1a",
			"- [ ] BN",
			"- [ ] S3",
			"### Later",
			"- [ ] BA3 🗂️ [[A]]",
		]);
	});

	it("a subtask dropped on a grouped title leaves its parent with the parent's project", async () => {
		const { svc, store } = setup();
		const screen = await svc.screen(T);
		const s1a = screen.soon.find((t) => t.text === "S1")!.allSubtasks[0];
		await svc.drop([{ key: s1a.key, from: "soon" }], screen.titleDrops.backlog, T);
		expect(list(store.text!, "## Soon")).toEqual(["- [ ] S1 🗂️ [[A]]", "- [ ] S2 🗂️ [[B]]", "- [ ] S3"]);
		expect(list(store.text!, "## Backlog").slice(0, 4)).toEqual(["- [ ] BA1 🗂️ [[A]]", "- [ ] BB1 🗂️ [[B]]", "- [ ] BA2 🗂️ [[A]]", "- [ ] S1a 🗂️ [[A]]"]);
	});

	it("a day's title: Now's end without a section, the project kept, today's date as any move into Now", async () => {
		const { svc, store } = setup();
		const screen = await svc.screen(T);
		const s2 = screen.soon.find((t) => t.text === "S2")!;
		await svc.drop([{ key: s2.key, from: "soon" }], screen.titleDrops.day, T);
		expect(list(store.text!, "## Now")).toEqual(["- [ ] N1 🗂️ [[A]]", "- [ ] S2 🗂️ [[B]] 📅 2026-11-07"]);
	});
});
