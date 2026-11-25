import { describe, expect, it } from "vitest";
import type { CorePort } from "../../obsidian/adapters/CorePort";
import type { Row } from "../../obsidian/ui/engine/port";
import { corePortOver, NOW } from "./standCore";

/** Дом with its own tasks and Ремонт with one, Отпуск empty. */
const TEXT = ["## Inbox", "", "- [ ] Купить краску 🗂️ Дом", "- [ ] Позвонить мастеру 🗂️ Дом", "- [ ] Выбрать плитку 🗂️ Ремонт", "", "## Backlog", "", "## Soon", "", "## Now", "", "## Done", "", "## Projects", "", "- Дом", "\t- Ремонт", "- Отпуск", ""].join("\n");

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** By project's rows as the port draws them, the chosen node `node`. */
async function byProject(node: string | null): Promise<{ port: CorePort; fileText: () => string; rows: () => readonly Row[] }> {
	const core = await corePortOver(TEXT, NOW);
	const { port } = core;
	port.view(true);
	await port.setViewMode("byProject");
	if (node) await port.chooseProject(node);
	await settle();
	const rows = () => port.read(0, port.projects(true)!.context).lists.projects.rows;
	return { port, fileText: () => core.file.text ?? "", rows };
}

describe("By project through CorePort (F229–F237, Decision 165)", () => {
	it("draws the node's own tasks first, then a part per subproject; without a filter a part per top project", async () => {
		const { rows } = await byProject("Дом");
		const heads = rows().filter((row) => row.kind === "section");
		expect(heads.map((row) => row.kind === "section" && row.title)).toEqual(["Ремонт"]);
		expect(heads[0]).toMatchObject({ lifts: false, menu: null });
		expect(rows()[0].kind).toBe("task");
		const all = await byProject(null);
		expect(all.rows().filter((row) => row.kind === "section").map((row) => row.kind === "section" && row.title)).toContain("Дом");
	});

	it("a card let go in another subproject's part takes that project for the one it stood under; the preview readied while carried keeps the screen's context", async () => {
		const { port, fileText, rows } = await byProject("Дом");
		const head = rows().find((row) => row.kind === "section")!;
		const card = rows().filter((row) => row.kind === "task" && row.depth === 0)[0];
		const before = rows().filter((row) => row.kind === "task").slice(-1)[0].id;
		const to = { list: "projects" as const, before, section: head.id, dayOffset: 0, depth: 0 };
		const context = port.projects(true)!.context;
		port.read(0, context);
		expect(port.takes(card.id, to)).toBe(true);
		expect(port.changes(card.id, to)).toBe(true);
		const title = port.read(0, context).cards[card.id].title;
		port.ready(card.id, to);
		await settle();
		expect(port.preview(card.id, to, context).lists.projects.rows.length).toBeGreaterThan(0);
		await port.move(card.id, to);
		const line = fileText().split("\n").find((l) => l.includes(title))!;
		expect(line).toContain("🗂️ Ремонт");
		expect(line).not.toContain("🗂️ Дом");
	});

	it("the plus opens a field at the end of the chosen project's part, and none under Done (F237)", async () => {
		const { port } = await byProject("Дом");
		const at = port.newTaskPlace(0, ["projects"]);
		expect(at?.list).toBe("projects");
		await port.pickNode("done", true);
		await settle();
		port.read(0, port.projects(true)!.context);
		expect(port.newTaskPlace(0, ["projects"])).toBeNull();
	});
});
