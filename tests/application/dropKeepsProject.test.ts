import { describe, expect, it } from "vitest";
import type { Clock } from "../../core/application/ports";
import { memoryGrouping } from "../../core/application/ports";
import { TaskServiceImpl } from "../../core/application/TaskServiceImpl";
import type { ProjectNote } from "../../core/application/contracts";
import { FakeSettingsStore } from "../fakes/FakeSettingsStore";
import { InMemoryTaskFileStore } from "../fakes/InMemoryTaskFileStore";

const T = "2026-11-07";
const clock: Clock = { now: () => new Date(2026, 10, 7, 14, 20) };
const NOTES: readonly ProjectNote[] = [{ name: "Сербия", path: "Сербия.md", link: "Сербия" }];
const FILE = [
	"## Inbox",
	"## Now",
	"- [ ] N1",
	"- [ ] N2",
	"## Soon",
	"- [ ] Добавить на google maps 🗂️ [[Сербия]]",
	"\t- [ ] 4 кафе",
	"\t- [ ] кафе с Юлей",
	"- [ ] Записаться в зал 🗂️ [[Сербия]]",
	"## Backlog",
	"## Done",
	"",
].join("\n");

async function setup() {
	const store = new InMemoryTaskFileStore(FILE);
	const projects = { list: () => NOTES, onChange: () => () => undefined };
	const svc = new TaskServiceImpl(store, new FakeSettingsStore(), clock, null, projects, memoryGrouping());
	await svc.setGrouping("soon", true);
	return { store, svc };
}

async function keyOf(svc: TaskServiceImpl, title: string) {
	const screen = await svc.screen(T);
	const all = [...screen.soon, ...screen.backlog, ...screen.inbox, ...screen.day.list];
	const item = all.find((i) => i.title === title);
	if (!item) throw new Error(`no ${title}`);
	return item.key;
}

describe("a task taken from a grouped list into Now keeps its project", () => {
	for (const [name, to] of [
		["end of the day list", { kind: "list", column: "day", before: null }],
		["before a task of the day", { kind: "list", column: "day", before: "N2" }],
	] as const) {
		it(name, async () => {
			const { store, svc } = await setup();
			const key = await keyOf(svc, "Добавить на google maps");
			const target = to.before ? { ...to, before: await keyOf(svc, to.before) } : to;
			await svc.drop([{ key, from: "soon" }], target as never, T);
			const text = (await store.read()) as string;
			expect(text).toContain("Добавить на google maps 🗂️ [[Сербия]]");
		});
	}
});

describe("in Now, which never groups by project, the task shows its project's mark", () => {
	it("the card keeps the project", async () => {
		const { svc } = await setup();
		const key = await keyOf(svc, "Добавить на google maps");
		await svc.drop([{ key, from: "soon" }], { kind: "list", column: "day", before: null }, T);
		const card = (await svc.screen(T)).day.list.find((i) => i.title === "Добавить на google maps");
		expect(card?.project?.name).toBe("Сербия");
		expect(card?.project?.mark).toBe(true);
	});
});
